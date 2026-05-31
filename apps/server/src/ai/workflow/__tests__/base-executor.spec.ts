import type {
    BaseGraph,
    CompiledWorkflowGraph,
    GraphConfig,
    LLMCaller,
    WorkflowState,
} from '../../langgraph';
import type { ToolDispatcher } from '../../tools/tool.dispatcher';
import type { ToolRouter } from '../../tools/tool-router';
import type { LLMResolver } from '../../workflow/llm-resolver';
import { BaseExecutor } from '../base-executor';

// Mock concrete subclass for testing BaseExecutor
class TestExecutor extends BaseExecutor {
    public persistAssistantCalls: Array<{ roomId: string; state: Partial<WorkflowState> }> = [];
    public persistToolResultsCalls: Array<{
        roomId: string;
        toolCalls: Array<{ id: string; name: string; arguments: Record<string, unknown> }>;
        results: Record<string, unknown>;
    }> = [];
    public persistFinalCalls: Partial<WorkflowState>[] = [];
    public routeToolCallsArgs: Array<{
        id: string;
        name: string;
        arguments: Record<string, unknown>;
    }>[] = [];
    public abortCalled = false;
    public timeoutCalled = false;

    private _aborted = false;
    private _waitForResult: Record<string, unknown> | null = null;
    private _roomId = 'room-1';

    setRoomId(val: string) {
        this._roomId = val;
    }
    setAborted(val: boolean) {
        this._aborted = val;
    }
    setWaitForResult(val: Record<string, unknown> | null) {
        this._waitForResult = val;
    }

    // Expose protected methods for testing
    public testGetOrCreateGraph(graphDef: BaseGraph) {
        return this.getOrCreateGraph(graphDef);
    }

    public async testRunToolLoop(
        graph: CompiledWorkflowGraph,
        initialState: Partial<WorkflowState>,
        configurable: Partial<GraphConfig>,
    ) {
        return this.runToolLoop(graph, initialState, configurable);
    }

    protected async persistAssistant(state: Partial<WorkflowState>): Promise<void> {
        this.persistAssistantCalls.push({ roomId: this._roomId, state });
    }

    protected async persistToolResults(
        toolCalls: Array<{ id: string; name: string; arguments: Record<string, unknown> }>,
        results: Record<string, unknown>,
    ): Promise<void> {
        this.persistToolResultsCalls.push({ roomId: this._roomId, toolCalls, results });
    }

    protected async persistFinal(state: Partial<WorkflowState>): Promise<void> {
        this.persistFinalCalls.push(state);
    }

    protected async routeToolCalls(
        toolCalls: Array<{ id: string; name: string; arguments: Record<string, unknown> }>,
    ): Promise<void> {
        this.routeToolCallsArgs.push(toolCalls);
    }

    protected async waitForToolResults(): Promise<Record<string, unknown> | null> {
        return this._waitForResult;
    }

    protected isAborted(): boolean {
        return this._aborted;
    }

    protected onAbort(): void {
        this.abortCalled = true;
    }

    protected onTimeout(): void {
        this.timeoutCalled = true;
    }
}

/**
 * Helper: wrap a partial state object in a LangGraph node-keyed update.
 * LangGraph stream() yields { llm_call: { ...partialState } }, not flat state.
 */
function nodeUpdate(partial: Partial<WorkflowState>) {
    return { llm_call: partial };
}

function makeMocks() {
    const stream = jest.fn().mockImplementation(async function* () {
        // No tool calls: single node update
        yield nodeUpdate({
            lastAssistantMessage: 'Response',
            hasToolCalls: false,
            pendingToolCalls: [],
        });
    });

    const mockGraph: CompiledWorkflowGraph = {
        stream,
        invoke: jest.fn(),
        withConfig: jest.fn(),
    };

    const mockGraphDef: BaseGraph = {
        name: 'test',
        description: 'test graph',
        createGraph: jest.fn().mockReturnValue(mockGraph),
    };

    const llmResolver = { resolve: jest.fn() } as unknown as LLMResolver;
    const toolDispatcher = {
        getDefinitions: jest.fn().mockReturnValue([]),
    } as unknown as ToolDispatcher;
    const toolRouter = { needsConfirmation: jest.fn() } as unknown as ToolRouter;

    return { stream, mockGraph, mockGraphDef, llmResolver, toolDispatcher, toolRouter };
}

describe('BaseExecutor', () => {
    describe('getOrCreateGraph', () => {
        it('should compile and cache graph on first call', () => {
            const mocks = makeMocks();
            const executor = new TestExecutor(
                mocks.llmResolver,
                mocks.toolDispatcher,
                mocks.toolRouter,
            );

            const result1 = executor.testGetOrCreateGraph(mocks.mockGraphDef);
            const result2 = executor.testGetOrCreateGraph(mocks.mockGraphDef);

            expect(mocks.mockGraphDef.createGraph).toHaveBeenCalledTimes(1);
            expect(result1).toBe(result2);
        });
    });

    describe('runToolLoop — no tool calls', () => {
        it('should exit loop when no tool calls', async () => {
            const mocks = makeMocks();
            const executor = new TestExecutor(
                mocks.llmResolver,
                mocks.toolDispatcher,
                mocks.toolRouter,
            );

            const initialState: Partial<WorkflowState> = {
                messages: [],
                roomId: 'room-1',
                lastAssistantMessage: '',
                hasToolCalls: false,
                pendingToolCalls: [],
                toolResults: {},
                error: undefined,
                isDone: false,
            };
            const configurable: Partial<GraphConfig> = {
                llmCaller: mocks.mockGraph.stream as unknown as LLMCaller,
            };

            const { lastState, hadToolCalls } = await executor.testRunToolLoop(
                mocks.mockGraph,
                initialState,
                configurable,
            );

            expect(hadToolCalls).toBe(false);
            expect(lastState).toEqual(
                expect.objectContaining({ lastAssistantMessage: 'Response' }),
            );
            expect(executor.persistAssistantCalls).toHaveLength(0);
        });
    });

    describe('runToolLoop — with tool calls', () => {
        it('should persist assistant and tool results, route tools, wait for results, and continue', async () => {
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
                    });
                } else {
                    yield nodeUpdate({
                        lastAssistantMessage: 'Done',
                        hasToolCalls: false,
                        pendingToolCalls: [],
                    });
                }
            });

            const executor = new TestExecutor(
                mocks.llmResolver,
                mocks.toolDispatcher,
                mocks.toolRouter,
            );
            executor.setWaitForResult({ 'tc-1': { result: 'found' } });

            const initialState: Partial<WorkflowState> = {
                messages: [],
                roomId: 'room-1',
                lastAssistantMessage: '',
                hasToolCalls: false,
                pendingToolCalls: [],
                toolResults: {},
                error: undefined,
                isDone: false,
            };
            const configurable: Partial<GraphConfig> = {
                llmCaller: mocks.mockGraph.stream as unknown as LLMCaller,
            };

            const { hadToolCalls } = await executor.testRunToolLoop(
                mocks.mockGraph,
                initialState,
                configurable,
            );

            expect(hadToolCalls).toBe(true);
            expect(executor.persistAssistantCalls).toHaveLength(1);
            expect(executor.persistAssistantCalls[0].state.lastAssistantMessage).toBe(
                'Let me search',
            );
            expect(executor.persistToolResultsCalls).toHaveLength(1);
            expect(executor.persistToolResultsCalls[0].results).toEqual({
                'tc-1': { result: 'found' },
            });
            expect(executor.routeToolCallsArgs).toHaveLength(1);
            expect(executor.routeToolCallsArgs[0][0].id).toBe('tc-1');
        });
    });

    describe('runToolLoop — abort before stream', () => {
        it('should call onAbort and return early', async () => {
            const mocks = makeMocks();
            const executor = new TestExecutor(
                mocks.llmResolver,
                mocks.toolDispatcher,
                mocks.toolRouter,
            );
            executor.setAborted(true);

            const initialState: Partial<WorkflowState> = {
                messages: [],
                roomId: 'room-1',
                lastAssistantMessage: '',
                hasToolCalls: false,
                pendingToolCalls: [],
                toolResults: {},
                error: undefined,
                isDone: false,
            };
            const configurable: Partial<GraphConfig> = {
                llmCaller: mocks.mockGraph.stream as unknown as LLMCaller,
            };

            const { hadToolCalls } = await executor.testRunToolLoop(
                mocks.mockGraph,
                initialState,
                configurable,
            );

            expect(hadToolCalls).toBe(false);
            expect(executor.abortCalled).toBe(true);
        });
    });

    describe('runToolLoop — max rounds', () => {
        it('should exit after maxToolRounds', async () => {
            const mocks = makeMocks();
            mocks.stream.mockImplementation(async function* () {
                yield nodeUpdate({
                    lastAssistantMessage: 'Searching...',
                    hasToolCalls: true,
                    pendingToolCalls: [{ id: 'tc-1', name: 'search', arguments: {} }],
                });
            });

            const executor = new TestExecutor(
                mocks.llmResolver,
                mocks.toolDispatcher,
                mocks.toolRouter,
            );
            executor.setWaitForResult({ 'tc-1': 'result' });
            (executor as any).maxToolRounds = 3;

            const initialState: Partial<WorkflowState> = {
                messages: [],
                roomId: 'room-1',
                lastAssistantMessage: '',
                hasToolCalls: false,
                pendingToolCalls: [],
                toolResults: {},
                error: undefined,
                isDone: false,
            };
            const configurable: Partial<GraphConfig> = {
                llmCaller: mocks.mockGraph.stream as unknown as LLMCaller,
            };

            await executor.testRunToolLoop(mocks.mockGraph, initialState, configurable);

            expect(executor.persistAssistantCalls).toHaveLength(3);
        });
    });
});
