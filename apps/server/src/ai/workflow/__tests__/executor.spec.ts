/* eslint-disable @typescript-eslint/no-explicit-any */
import type { BaseGraph, CompiledWorkflowGraph, GraphConfig, WorkflowState } from '../../langgraph';
import type { MessageStore } from '../../message/message-store.interface';
import type { ToolDispatcher } from '../../tools/tool.dispatcher';
import type { ToolRouter } from '../../tools/tool-router';
import type { WorkflowCallbacks } from '../../workflow/executor.types';
import type { GraphRegistry } from '../../workflow/graph-registry';
import { Executor } from '../executor';
import type { ExecutionCtx } from '../executor.types';

/** Helper: wrap partial state in LangGraph node-keyed format */
function nodeUpdate(partial: Partial<WorkflowState>) {
    return { llm_call: partial };
}

function makeMocks() {
    const stream = jest.fn().mockImplementation(async function* () {
        yield nodeUpdate({
            lastAssistantMessage: 'Hello from AI',
            hasToolCalls: false,
            pendingToolCalls: [],
            toolResults: {},
            roomId: 'room-1',
            error: undefined,
            isDone: false,
        });
    });

    const mockGraph: CompiledWorkflowGraph = {
        stream,
        invoke: jest.fn(),
        withConfig: jest.fn(),
    };

    const mockGraphDef: BaseGraph = {
        name: 'chat',
        description: 'test graph',
        createGraph: jest.fn().mockReturnValue(mockGraph),
    };

    const messageStore: MessageStore = {
        init: jest.fn(),
        persistUser: jest.fn(),
        persistAssistant: jest.fn(),
        persistToolResult: jest.fn(),
        persistRound: jest.fn(),
        persistFinal: jest.fn(),
        buildHistory: jest.fn().mockReturnValue([{ role: 'user' as const, content: 'Hello' }]),
        getTokenUsage: jest.fn(),
    };

    const roomService = {
        incrementMessageCount: jest.fn().mockResolvedValue(undefined),
    };

    const graphRegistry: GraphRegistry = {
        get: jest.fn().mockReturnValue(mockGraphDef),
    } as any;

    const llmResolver = {
        resolve: jest.fn(),
    } as any;

    const toolDispatcher: ToolDispatcher = {
        getDefinitions: jest.fn().mockReturnValue([]),
        waitForResultsByRoom: jest.fn().mockResolvedValue(null),
    } as any;

    const toolRouter: ToolRouter = {
        needsConfirmation: jest.fn().mockReturnValue(false),
        route: jest.fn(),
    } as any;

    const callbacks: WorkflowCallbacks = {
        onTextChunk: jest.fn(),
        onToolCall: jest.fn(),
        onLlmDone: jest.fn(),
        onError: jest.fn(),
        onTimeout: jest.fn(),
        onStop: jest.fn(),
    };

    return {
        stream,
        mockGraphDef,
        messageStore: messageStore as jest.Mocked<MessageStore>,
        roomService,
        graphRegistry,
        llmResolver,
        toolDispatcher: toolDispatcher as jest.Mocked<ToolDispatcher>,
        toolRouter,
        callbacks: callbacks as jest.Mocked<WorkflowCallbacks>,
    };
}

function makeCtx(
    mocks: ReturnType<typeof makeMocks>,
    overrides: Partial<ExecutionCtx> = {},
): ExecutionCtx {
    return {
        roomId: 'room-1',
        clientId: 'client-1',
        content: 'Hello',
        callbacks: mocks.callbacks,
        abortSignal: new AbortController().signal,
        ...overrides,
    };
}

function makeDeps(mocks: ReturnType<typeof makeMocks>) {
    return {
        messageStore: mocks.messageStore,
        roomService: mocks.roomService as any,
        graphRegistry: mocks.graphRegistry,
        llmResolver: mocks.llmResolver,
        toolDispatcher: mocks.toolDispatcher,
        toolRouter: mocks.toolRouter,
    };
}

describe('Executor', () => {
    describe('execute — no tool calls', () => {
        it('should persist user message and final assistant message', async () => {
            const mocks = makeMocks();
            const ctx = makeCtx(mocks);
            const deps = makeDeps(mocks);

            const executor = new Executor(ctx, deps);
            await executor.execute();

            expect(mocks.messageStore.init).toHaveBeenCalledWith('room-1', undefined);
            expect(mocks.messageStore.persistUser).toHaveBeenCalledWith('room-1', 'Hello');
            expect(mocks.messageStore.buildHistory).toHaveBeenCalledWith('room-1');
            expect(mocks.messageStore.persistFinal).toHaveBeenCalledWith('room-1', 'Hello from AI');
            expect(mocks.callbacks.onLlmDone).toHaveBeenCalledWith('room-1');
        });

        it('should increment message count after user and final persist', async () => {
            const mocks = makeMocks();
            const ctx = makeCtx(mocks);
            const deps = makeDeps(mocks);

            const executor = new Executor(ctx, deps);
            await executor.execute();

            expect(mocks.roomService.incrementMessageCount).toHaveBeenCalledTimes(2);
        });
    });

    describe('execute — with tool calls', () => {
        it('should persist assistant and tool results separately', async () => {
            const mocks = makeMocks();
            let callCount = 0;
            mocks.stream.mockImplementation(async function* () {
                callCount++;
                if (callCount === 1) {
                    yield nodeUpdate({
                        lastAssistantMessage: 'Let me search',
                        hasToolCalls: true,
                        pendingToolCalls: [
                            { id: 'tc-1', name: 'search', arguments: { q: 'test' } },
                        ],
                        toolResults: {},
                        roomId: 'room-1',
                        error: undefined,
                        isDone: false,
                    });
                } else {
                    yield nodeUpdate({
                        lastAssistantMessage: 'Done',
                        hasToolCalls: false,
                        pendingToolCalls: [],
                        toolResults: {},
                        roomId: 'room-1',
                        error: undefined,
                        isDone: false,
                    });
                }
            });
            (mocks.toolDispatcher as any).waitForResultsByRoom.mockResolvedValue({
                'tc-1': { result: 'found' },
            });

            const ctx = makeCtx(mocks);
            const deps = makeDeps(mocks);

            const executor = new Executor(ctx, deps);
            await executor.execute();

            expect(mocks.messageStore.persistAssistant).toHaveBeenCalledWith(
                'room-1',
                'Let me search',
                expect.arrayContaining([expect.objectContaining({ name: 'search' })]),
            );
            expect(mocks.messageStore.persistToolResult).toHaveBeenCalledWith(
                'room-1',
                'tc-1',
                JSON.stringify({ result: 'found' }),
            );
            // Should NOT call persistFinal when tool calls occurred
            expect(mocks.messageStore.persistFinal).not.toHaveBeenCalled();
        });

        it('should route tool calls and emit events', async () => {
            const mocks = makeMocks();
            let callCount = 0;
            mocks.stream.mockImplementation(async function* () {
                callCount++;
                if (callCount === 1) {
                    yield nodeUpdate({
                        lastAssistantMessage: 'Let me search',
                        hasToolCalls: true,
                        pendingToolCalls: [
                            { id: 'tc-1', name: 'search', arguments: { q: 'test' } },
                        ],
                        toolResults: {},
                        roomId: 'room-1',
                        error: undefined,
                        isDone: false,
                    });
                } else {
                    yield nodeUpdate({
                        lastAssistantMessage: 'Done',
                        hasToolCalls: false,
                        pendingToolCalls: [],
                        toolResults: {},
                        roomId: 'room-1',
                        error: undefined,
                        isDone: false,
                    });
                }
            });
            (mocks.toolDispatcher as any).waitForResultsByRoom.mockResolvedValue({ 'tc-1': 'ok' });

            const ctx = makeCtx(mocks);
            const deps = makeDeps(mocks);

            const executor = new Executor(ctx, deps);
            await executor.execute();

            expect(mocks.toolRouter.route).toHaveBeenCalledWith(
                'search',
                { q: 'test' },
                'room-1',
                'tc-1',
            );
            expect(mocks.callbacks.onToolCall).toHaveBeenCalledWith('room-1', {
                toolCallId: 'tc-1',
                toolName: 'search',
                input: { q: 'test' },
                requiresConfirmation: false,
            });
        });
    });

    describe('execute — tool timeout', () => {
        it('should handle timeout and break loop', async () => {
            const mocks = makeMocks();
            mocks.stream.mockImplementation(async function* () {
                yield nodeUpdate({
                    lastAssistantMessage: 'Let me search',
                    hasToolCalls: true,
                    pendingToolCalls: [{ id: 'tc-1', name: 'search', arguments: {} }],
                    toolResults: {},
                    roomId: 'room-1',
                    error: undefined,
                    isDone: false,
                });
            });
            (mocks.toolDispatcher as any).waitForResultsByRoom.mockResolvedValue(null); // timeout

            const ctx = makeCtx(mocks);
            const deps = makeDeps(mocks);

            const executor = new Executor(ctx, deps);
            await executor.execute();

            expect(mocks.callbacks.onTimeout).toHaveBeenCalledWith(
                'room-1',
                expect.stringContaining('timed out'),
            );
        });
    });

    describe('execute — error handling', () => {
        it('should emit error callback on graph failure', async () => {
            const mocks = makeMocks();
            mocks.stream.mockRejectedValue(new Error('Graph failed'));

            const ctx = makeCtx(mocks);
            const deps = makeDeps(mocks);

            const executor = new Executor(ctx, deps);
            await executor.execute();

            expect(mocks.callbacks.onError).toHaveBeenCalledWith(
                'room-1',
                'WORKFLOW_ERROR',
                'Graph failed',
            );
        });
    });

    describe('execute — abort signal', () => {
        it('should stop when signal is triggered before stream', async () => {
            const mocks = makeMocks();
            const controller = new AbortController();
            controller.abort();

            const ctx = makeCtx(mocks, { abortSignal: controller.signal });
            const deps = makeDeps(mocks);

            const executor = new Executor(ctx, deps);
            await executor.execute();

            expect(mocks.callbacks.onStop).toHaveBeenCalledWith('room-1');
        });
    });

    describe('execute — max rounds exceeded', () => {
        it('should stop after max rounds', async () => {
            const mocks = makeMocks();
            mocks.stream.mockImplementation(async function* () {
                yield nodeUpdate({
                    lastAssistantMessage: 'Searching...',
                    hasToolCalls: true,
                    pendingToolCalls: [{ id: 'tc', name: 'search', arguments: {} }],
                    toolResults: {},
                    roomId: 'room-1',
                    error: undefined,
                    isDone: false,
                });
            });
            (mocks.toolDispatcher as any).waitForResultsByRoom.mockResolvedValue({ tc: 'ok' });

            const ctx = makeCtx(mocks);
            const deps = makeDeps(mocks);

            const executor = new Executor(ctx, deps);
            await executor.execute();

            // Should have hit max rounds (10)
            expect(mocks.messageStore.persistAssistant).toHaveBeenCalledTimes(10);
        });
    });
});
