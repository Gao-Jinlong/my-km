import type { BaseCheckpointSaver } from '@langchain/langgraph-checkpoint';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { AiChatService } from '../ai.service';
import { CheckpointReaderService } from '../checkpointer/checkpoint-reader.service';
import { LLMFactory } from '../llm/llm-factory';
import type { LLMConfig } from '../llm/provider.types';
import { ProviderRegistry } from '../llm/provider-registry';
import type { RunContext } from '../run/run-context';
import { RunContextFactory } from '../run/run-context-factory';
import { RunManager } from '../run/run-manager';
import { RunRecord } from '../run/run-record';
import type { RunEventStore } from '../store/run-event-store';
import { ThreadService } from '../thread/thread.service';
import { RunStatus } from '../types/run.types';

// Mock langgraph ESM modules to prevent uuid ESM error in Jest
jest.mock('@langchain/langgraph', () => ({
    StateGraph: jest.fn().mockReturnValue({
        addNode: jest.fn().mockReturnThis(),
        addEdge: jest.fn().mockReturnThis(),
        addConditionalEdges: jest.fn().mockReturnThis(),
        compile: jest.fn().mockReturnValue({ stream: jest.fn() }),
    }),
    START: '__start__',
    END: '__end__',
    Annotation: { Root: jest.fn().mockReturnValue({}) },
}));

jest.mock('@langchain/langgraph-checkpoint', () => ({
    MemorySaver: jest.fn().mockImplementation(() => ({ type: 'MemorySaver' })),
}));

// Configurable graph stream mock — each test can override via mockStreamImpl
// A1: streamMode ['messages', 'values'] → chunks are [mode, payload] tuples
let mockStreamImpl: () => AsyncIterable<unknown> = () => ({
    async *[Symbol.asyncIterator]() {
        yield [
            'values',
            {
                messages: [
                    { type: 'human', content: 'Hi', id: 'msg-1' },
                    { type: 'ai', content: 'hello world', id: 'msg-2' },
                ],
            },
        ];
    },
});

// Capture the most recent graph.stream() input — tests can assert on what
// executeRunProtocol() passed in (e.g. SystemMessage with hide_from_ui kwargs).
let capturedStreamInput: unknown;

jest.mock('../langgraph/graphs/chat-graph', () => ({
    ChatGraph: jest.fn().mockImplementation(() => ({
        name: 'chat',
        createGraph: jest.fn().mockReturnValue({
            compile: jest.fn().mockReturnValue({
                stream: jest.fn().mockImplementation((input: unknown) => {
                    capturedStreamInput = input;
                    return mockStreamImpl();
                }),
            }),
        }),
    })),
}));

/**
 * 捕获 emitEvent 产生的事件（替代之前的 mock Response）
 */
function createEventCapture() {
    const events: Array<{ event: string; data: unknown }> = [];
    return {
        events,
        sseWriter: (e: { event: string; data: unknown }) => {
            events.push(e);
        },
    };
}

describe('AiChatService', () => {
    let service: AiChatService;
    let threadService: ThreadService;
    let runManager: RunManager;
    let mockProviderRegistry: ProviderRegistry;
    let mockRunContextFactory: RunContextFactory;
    let defaultLlmConfig: LLMConfig;

    beforeEach(async () => {
        defaultLlmConfig = { provider: 'zhipu', model: 'glm-5' };

        // Create a fresh mock RunContext for each factory.create() call
        const mockRunContextFactoryInstance = {
            create: jest.fn().mockImplementation(async (opts: any) => {
                return {
                    checkpointer: { type: 'memory' } as unknown as BaseCheckpointSaver,
                    eventStore: {
                        append: jest.fn().mockResolvedValue({}),
                        flushRun: jest.fn().mockResolvedValue(undefined),
                    } as unknown as RunEventStore,
                    llmConfig: { ...opts.llmConfig },
                } as RunContext;
            }),
        };

        const mockRegistry = {
            defaultConfig: defaultLlmConfig,
            register: jest.fn(),
            isRegistered: jest.fn().mockReturnValue(true),
            registeredProviders: ['zhipu', 'openai'],
        };

        // A1: LLMProvider 暴露 BaseChatModel via getChatModel()
        const mockLLM = {
            getOrCreate: jest.fn().mockReturnValue({
                getChatModel: jest.fn().mockReturnValue({
                    bindTools: jest.fn().mockReturnThis(),
                    invoke: jest.fn(),
                    stream: jest.fn(),
                }),
            }),
        };

        // Functional mock RunManager — stores runs in-memory like the real one
        const runStore = new Map<string, RunRecord>();
        const mockRunManager = {
            createRun: jest
                .fn()
                .mockImplementation(
                    async (threadId: string, runContext: RunContext, snapshot: any) => {
                        const record = new RunRecord({
                            id: `run-${runStore.size + 1}`,
                            threadId,
                            runContext,
                            snapshot,
                        });
                        runStore.set(record.id, record);
                        return record;
                    },
                ),
            setStatus: jest.fn().mockImplementation((_runId: string, status: RunStatus) => {
                const r = runStore.get(_runId);
                if (r) r.setStatus(status);
            }),
            finalize: jest.fn(),
            getRun: jest.fn().mockImplementation((id: string) => runStore.get(id)),
            getActiveRunForThread: jest.fn().mockImplementation((threadId: string) => {
                for (const r of runStore.values()) {
                    if (
                        r.threadId === threadId &&
                        ['pending', 'running', 'interrupted'].includes(r.status)
                    ) {
                        return r;
                    }
                }
                return undefined;
            }),
            cancelRun: jest.fn().mockImplementation(async (id: string) => {
                const r = runStore.get(id);
                if (r) r.abort();
            }),
            cleanup: jest.fn(),
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                AiChatService,
                {
                    provide: ThreadService,
                    useValue: {
                        findOrCreate: jest.fn().mockResolvedValue({ id: 'thread-1' }),
                        findAll: jest.fn().mockResolvedValue([]),
                        findById: jest.fn().mockResolvedValue({ id: 'thread-1' }),
                        update: jest.fn().mockResolvedValue({}),
                        delete: jest.fn().mockResolvedValue({}),
                        archive: jest.fn().mockResolvedValue({}),
                        incrementMessageCount: jest.fn().mockResolvedValue({}),
                    },
                },
                { provide: RunManager, useValue: mockRunManager },
                { provide: RunContextFactory, useValue: mockRunContextFactoryInstance },
                { provide: ProviderRegistry, useValue: mockRegistry },
                { provide: 'ProviderRegistry', useValue: mockRegistry },
                { provide: LLMFactory, useValue: mockLLM },
                {
                    provide: CheckpointReaderService,
                    useValue: {
                        // 保留 mock 以满足 DI，A1 service 不再读取历史消息
                        getMessages: jest.fn().mockResolvedValue([]),
                        getThreadState: jest.fn().mockResolvedValue({
                            values: { messages: [] },
                            next: [],
                            checkpoint: { thread_id: 'thread-1' },
                            tasks: [],
                        }),
                    },
                },
            ],
        }).compile();

        service = module.get<AiChatService>(AiChatService);
        threadService = module.get<ThreadService>(ThreadService);
        runManager = module.get<RunManager>(RunManager);
        mockRunContextFactory = module.get<RunContextFactory>(RunContextFactory);
        mockProviderRegistry = module.get<ProviderRegistry>(ProviderRegistry);

        // A1 默认 stream: yield [mode, payload] tuple — values 模式带 messages
        mockStreamImpl = () => ({
            async *[Symbol.asyncIterator]() {
                yield [
                    'values',
                    {
                        messages: [
                            { type: 'human', content: 'Hi', id: 'msg-1' },
                            { type: 'ai', content: 'hello world', id: 'msg-2' },
                        ],
                    },
                ];
            },
        });
        capturedStreamInput = undefined;
    });

    describe('startRun', () => {
        it('should create a thread and run when no threadId', async () => {
            const result = await service.startRun({ content: 'Hello' });
            expect(result).toBeDefined();
            expect(result.threadId).toBe('thread-1');
            expect(result.status).toBe(RunStatus.Running);
        });

        it('should use existing thread when threadId provided', async () => {
            const result = await service.startRun({
                content: 'Hello',
                threadId: 'thread-1',
            });
            expect(threadService.findOrCreate).toHaveBeenCalledWith('thread-1', expect.anything());
            expect(result).toBeDefined();
        });

        it('should call RunContextFactory.create() after concurrency check', async () => {
            await service.startRun({ content: 'Hello' });
            expect(mockRunContextFactory.create).toHaveBeenCalledTimes(1);
        });

        it('should create per-run RunContext with merged llmConfig', async () => {
            await service.startRun({
                content: 'Hello',
                llmConfig: { provider: 'openai', model: 'gpt-4' },
            });

            expect(mockRunContextFactory.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    llmConfig: expect.objectContaining({ provider: 'openai', model: 'gpt-4' }),
                }),
            );
        });

        it('should throw if no default LLM config is set', async () => {
            (mockProviderRegistry as any).defaultConfig = undefined;

            await expect(service.startRun({ content: 'Hello' })).rejects.toThrow(
                'No LLM provider configured',
            );
        });

        it('should not create RunContext when concurrency is rejected', async () => {
            // Create first run
            await service.startRun({ content: 'First', threadId: 't1' });
            const activeRun = runManager.getActiveRunForThread('t1');
            if (activeRun) activeRun.setStatus(RunStatus.Running);

            // Reset call count
            (mockRunContextFactory.create as jest.Mock).mockClear();

            // Second run with rejected policy
            await expect(
                service.startRun({
                    content: 'Second',
                    threadId: 't1',
                    multitaskStrategy: 'reject',
                }),
            ).rejects.toThrow(ConflictException);

            // Factory should not have been called for the rejected run
            expect(mockRunContextFactory.create).not.toHaveBeenCalled();
        });

        it('should give two runs different RunContext instances', async () => {
            const r1 = await service.startRun({ content: 'First', threadId: 't1' });
            // Complete first run so second can proceed
            r1.setStatus(RunStatus.Completed);

            const r2 = await service.startRun({ content: 'Second', threadId: 't1' });

            expect(r1.runContext).not.toBe(r2.runContext);
        });

        it('should preserve llmConfig snapshot — changing defaultConfig after startRun does not affect run', async () => {
            const record = await service.startRun({ content: 'Hello' });
            const snapshotProvider = record.runContext.llmConfig.provider;

            // Change default config
            (mockProviderRegistry as any).defaultConfig = { provider: 'openai', model: 'gpt-4' };

            // Original run should still have zhipu
            expect(record.runContext.llmConfig.provider).toBe(snapshotProvider);
        });

        it('should pass context to RunManager snapshot, not RunContextFactory', async () => {
            const ctx = { selectedText: 'hello', fullContent: 'world' };
            await service.startRun({ content: 'Hello', context: ctx });

            // RunContextFactory should NOT receive requestContext
            expect(mockRunContextFactory.create).toHaveBeenCalledWith(
                expect.objectContaining({ llmConfig: expect.any(Object) }),
            );
            // Verify the factory call has only llmConfig (no requestContext key)
            const factoryCall = (mockRunContextFactory.create as jest.Mock).mock.calls[0][0];
            expect(factoryCall).not.toHaveProperty('requestContext');

            // RunManager snapshot should have the context
            expect(runManager.createRun).toHaveBeenCalledWith(
                expect.any(String),
                expect.any(Object),
                expect.objectContaining({ requestContext: ctx }),
            );
        });
    });

    describe('multitask_strategy (concurrency control)', () => {
        it('should reject when active run exists and strategy is "reject"', async () => {
            await service.startRun({ content: 'First', threadId: 't1' });
            const activeRun = runManager.getActiveRunForThread('t1');
            if (activeRun) activeRun.setStatus(RunStatus.Running);

            await expect(
                service.startRun({
                    content: 'Second',
                    threadId: 't1',
                    multitaskStrategy: 'reject',
                }),
            ).rejects.toThrow(ConflictException);
        });

        it('should default to "reject" when multitaskStrategy omitted', async () => {
            await service.startRun({ content: 'First', threadId: 't1' });
            const activeRun = runManager.getActiveRunForThread('t1');
            if (activeRun) activeRun.setStatus(RunStatus.Running);

            await expect(service.startRun({ content: 'Second', threadId: 't1' })).rejects.toThrow(
                ConflictException,
            );
        });

        it('should fall back to reject and emit warn for "enqueue"', async () => {
            const loggerSpy = jest
                .spyOn((service as unknown as { logger: { warn: jest.Mock } }).logger, 'warn')
                .mockImplementation(() => undefined);

            await service.startRun({ content: 'First', threadId: 't1' });
            const activeRun = runManager.getActiveRunForThread('t1');
            if (activeRun) activeRun.setStatus(RunStatus.Running);

            await expect(
                service.startRun({
                    content: 'Second',
                    threadId: 't1',
                    multitaskStrategy: 'enqueue',
                }),
            ).rejects.toThrow(ConflictException);

            expect(loggerSpy).toHaveBeenCalledWith(
                expect.stringContaining("'enqueue' not yet supported"),
            );
        });

        it('should abort active run for "interrupt" strategy', async () => {
            const r1 = await service.startRun({ content: 'First', threadId: 't1' });
            r1.setStatus(RunStatus.Running);
            const abortSpy = jest.spyOn(r1, 'abort');

            // Second run with interrupt should succeed (abort first)
            const r2 = await service.startRun({
                content: 'Second',
                threadId: 't1',
                multitaskStrategy: 'interrupt',
            });

            expect(abortSpy).toHaveBeenCalled();
            expect(r2).toBeDefined();
            expect(r2.id).not.toBe(r1.id);
        });
    });

    describe('resumeFromCommand', () => {
        it('should throw NotFoundException when no active run for thread', async () => {
            await expect(
                service.resumeFromCommand('nonexistent-thread', { resume: { foo: 'bar' } }),
            ).rejects.toThrow(NotFoundException);
        });

        it('should throw ConflictException when run is not interrupted', async () => {
            // ThreadService.findOrCreate mock 始终返回 { id: 'thread-1' }，
            // 所以 startRun({threadId: 't1'}) 创建的 record.threadId 仍是 'thread-1'。
            const record = await service.startRun({ content: 'test', threadId: 't1' });
            // status is Running, not Interrupted
            expect(record.status).toBe(RunStatus.Running);

            await expect(
                service.resumeFromCommand('thread-1', { resume: { ok: true } }),
            ).rejects.toThrow(ConflictException);
        });

        it('should set status to Running and return record when resume succeeds', async () => {
            const record = await service.startRun({ content: 'test', threadId: 't1' });
            record.setStatus(RunStatus.Interrupted);

            const resumed = await service.resumeFromCommand('thread-1', {
                resume: { tool_call_id: 'tc-1', tool_result: 'ok' },
            });

            expect(resumed).toBe(record);
            expect(resumed.status).toBe(RunStatus.Running);
        });
    });

    describe('executeRunProtocol', () => {
        it('should emit metadata → values → end on happy path', async () => {
            const record = await service.startRun({ content: 'Hi', threadId: 't1' });
            const capture = createEventCapture();
            record.setSseWriter(capture.sseWriter);

            await service.executeRunProtocol(record);

            const eventTypes = capture.events.map(e => e.event);
            expect(eventTypes[0]).toBe('metadata');
            expect(eventTypes).toContain('values');
            expect(eventTypes[eventTypes.length - 1]).toBe('end');
            expect(record.status).toBe(RunStatus.Completed);
        });

        it('should include run_id and thread_id in metadata event', async () => {
            const record = await service.startRun({ content: 'Hi', threadId: 't1' });
            const capture = createEventCapture();
            record.setSseWriter(capture.sseWriter);

            await service.executeRunProtocol(record);

            const metadata = capture.events.find(e => e.event === 'metadata');
            expect(metadata).toBeDefined();
            expect((metadata?.data as Record<string, unknown>).run_id).toBe(record.id);
            expect((metadata?.data as Record<string, unknown>).thread_id).toBe(record.threadId);
        });

        it('should include messages in values event from stream payload', async () => {
            const record = await service.startRun({ content: 'Hi', threadId: 't1' });
            const capture = createEventCapture();
            record.setSseWriter(capture.sseWriter);

            await service.executeRunProtocol(record);

            const valuesEvent = capture.events.find(e => e.event === 'values');
            expect(valuesEvent).toBeDefined();
            const messages = (valuesEvent?.data as Record<string, unknown>).messages as Array<
                Record<string, unknown>
            >;
            // A1: values payload 直接来自 graph stream 的 values 模式
            // 默认 mock yield messages: [Hi, hello world]
            expect(messages.length).toBe(2);
            expect(messages.some(m => m.content === 'Hi')).toBe(true);
            expect(messages.some(m => m.content === 'hello world')).toBe(true);
        });

        it('should emit error event and set status Failed when graph throws', async () => {
            mockStreamImpl = () => ({
                async *[Symbol.asyncIterator]() {
                    throw new Error('simulated graph failure');
                    // biome-ignore lint/correctness/noUnreachable: required to satisfy AsyncIterable signature
                    yield;
                },
            });

            const record = await service.startRun({ content: 'Hi', threadId: 't1' });
            const capture = createEventCapture();
            record.setSseWriter(capture.sseWriter);

            await service.executeRunProtocol(record);

            const errorEvent = capture.events.find(e => e.event === 'error');
            expect(errorEvent).toBeDefined();
            expect(record.status).toBe(RunStatus.Failed);
        });

        it('should set status Interrupted when __interrupt__ present in values', async () => {
            mockStreamImpl = () => ({
                async *[Symbol.asyncIterator]() {
                    yield [
                        'values',
                        {
                            messages: [{ type: 'ai', content: 'need tool', id: 'm1' }],
                            __interrupt__: [{ value: { tool_call_id: 'tc-1' } }],
                        },
                    ];
                },
            });

            const record = await service.startRun({ content: 'Hi', threadId: 't1' });
            const capture = createEventCapture();
            record.setSseWriter(capture.sseWriter);

            await service.executeRunProtocol(record);

            expect(record.status).toBe(RunStatus.Interrupted);
        });

        it('should set status Cancelled when aborted mid-stream', async () => {
            const record = await service.startRun({ content: 'Hi', threadId: 't1' });
            record.abort();
            const capture = createEventCapture();
            record.setSseWriter(capture.sseWriter);

            await service.executeRunProtocol(record);

            expect(record.status).toBe(RunStatus.Cancelled);
        });

        it('should write all events to EventStore via emitEvent', async () => {
            const record = await service.startRun({ content: 'Hi', threadId: 't1' });
            const capture = createEventCapture();
            record.setSseWriter(capture.sseWriter);

            await service.executeRunProtocol(record);

            // eventStore.append should have been called for each event
            const appendSpy = record.runContext.eventStore.append as jest.Mock;
            // At minimum: metadata + values + end = 3 calls
            expect(appendSpy.mock.calls.length).toBeGreaterThanOrEqual(3);

            // Verify event types
            const eventTypes = appendSpy.mock.calls.map(
                (call: [string, string, { eventType: string }]) => call[2].eventType,
            );
            expect(eventTypes).toContain('metadata');
            expect(eventTypes).toContain('values');
            expect(eventTypes).toContain('end');
        });

        it('should inject editor context as SystemMessage with hide_from_ui kwarg when context is present', async () => {
            const editorCtx = { selectedText: 'important code', fullContent: 'some content here' };
            const record = await service.startRun({
                content: 'Explain this',
                threadId: 't1',
                context: editorCtx,
            });
            const capture = createEventCapture();
            record.setSseWriter(capture.sseWriter);

            // Verify snapshot has requestContext
            expect(record.snapshot.requestContext).toEqual(editorCtx);

            await service.executeRunProtocol(record);

            // Verify graph.stream() received [SystemMessage(editor ctx), HumanMessage(user)]
            expect(capturedStreamInput).toBeDefined();
            const input = capturedStreamInput as { messages: unknown[] };
            expect(input.messages).toHaveLength(2);

            const [sysMsg, humanMsg] = input.messages as Array<{
                _getType: () => string;
                content: string;
                additional_kwargs?: Record<string, unknown>;
            }>;

            // SystemMessage is first, carries editor context, marked hide_from_ui
            expect(sysMsg._getType()).toBe('system');
            expect(sysMsg.content).toContain('[Editor Context]');
            expect(sysMsg.content).toContain('important code');
            expect(sysMsg.additional_kwargs?.hide_from_ui).toBe(true);

            // HumanMessage carries ONLY the user input — no editor context bleed-through
            expect(humanMsg._getType()).toBe('human');
            expect(humanMsg.content).toBe('Explain this');
            expect(humanMsg.content).not.toContain('[Editor Context]');

            expect(record.status).toBe(RunStatus.Completed);
        });

        it('should NOT inject SystemMessage when no editor context', async () => {
            const record = await service.startRun({ content: 'Hello', threadId: 't1' });

            // No context provided
            expect(record.snapshot.requestContext).toBeUndefined();

            const capture = createEventCapture();
            record.setSseWriter(capture.sseWriter);

            await service.executeRunProtocol(record);

            // input.messages should only contain the HumanMessage — no SystemMessage prepended
            expect(capturedStreamInput).toBeDefined();
            const input = capturedStreamInput as { messages: unknown[] };
            expect(input.messages).toHaveLength(1);

            const [humanMsg] = input.messages as Array<{ _getType: () => string; content: string }>;
            expect(humanMsg._getType()).toBe('human');
            expect(humanMsg.content).toBe('Hello');

            expect(record.status).toBe(RunStatus.Completed);
        });
    });

    describe('cancel', () => {
        it('should cancel an active run', async () => {
            const run = await service.startRun({ content: 'test', threadId: 't1' });
            await service.cancel(run.id);
            const found = runManager.getRun(run.id);
            expect(found?.status).toBe(RunStatus.Cancelled);
        });

        it('should throw NotFoundException when run not found', async () => {
            await expect(service.cancel('nonexistent')).rejects.toThrow(NotFoundException);
        });
    });
});
