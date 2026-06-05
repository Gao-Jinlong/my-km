import type { BaseCheckpointSaver } from '@langchain/langgraph-checkpoint';
import { ConflictException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { AiChatService } from '../ai.service';
import { LLMFactory } from '../llm/llm-factory';
import type { LLMConfig } from '../llm/provider.types';
import { ProviderRegistry } from '../llm/provider-registry';
import type { RunContext } from '../run/run-context';
import { RunContextFactory } from '../run/run-context-factory';
import { RunManager } from '../run/run-manager';
import type { RunEventStore } from '../store/run-event-store';
import { ThreadService } from '../thread/thread.service';
import { ConcurrencyPolicy, RunStatus } from '../types/run.types';

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

jest.mock('../langgraph/graphs/chat-graph', () => ({
    ChatGraph: jest.fn().mockImplementation(() => ({
        name: 'chat',
        createGraph: jest.fn().mockReturnValue({
            compile: jest.fn().mockReturnValue({ type: 'compiled-graph', stream: jest.fn() }),
        }),
    })),
}));

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
                    } as unknown as RunEventStore,
                    llmConfig: { ...opts.llmConfig },
                    requestContext: opts.requestContext ? { ...opts.requestContext } : undefined,
                } as RunContext;
            }),
        };

        const mockRegistry = {
            defaultConfig: defaultLlmConfig,
            register: jest.fn(),
            isRegistered: jest.fn().mockReturnValue(true),
            registeredProviders: ['zhipu', 'openai'],
        };

        const mockLLM = {
            getOrCreate: jest.fn().mockReturnValue({ chat: jest.fn() }),
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
                { provide: RunManager, useClass: RunManager },
                { provide: RunContextFactory, useValue: mockRunContextFactoryInstance },
                { provide: ProviderRegistry, useValue: mockRegistry },
                { provide: 'ProviderRegistry', useValue: mockRegistry },
                { provide: LLMFactory, useValue: mockLLM },
            ],
        }).compile();

        service = module.get<AiChatService>(AiChatService);
        threadService = module.get<ThreadService>(ThreadService);
        runManager = module.get<RunManager>(RunManager);
        mockRunContextFactory = module.get<RunContextFactory>(RunContextFactory);
        mockProviderRegistry = module.get<ProviderRegistry>(ProviderRegistry);
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
                    concurrency: ConcurrencyPolicy.Rejected,
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

        it('should pass requestContext to RunContextFactory', async () => {
            const ctx = { userId: 'u1' };
            await service.startRun({ content: 'Hello', context: ctx });

            expect(mockRunContextFactory.create).toHaveBeenCalledWith(
                expect.objectContaining({ requestContext: ctx }),
            );
        });
    });

    describe('concurrency control', () => {
        it('should reject when active run exists and policy is rejected', async () => {
            await service.startRun({ content: 'First', threadId: 't1' });
            const activeRun = runManager.getActiveRunForThread('t1');
            if (activeRun) activeRun.setStatus(RunStatus.Running);

            await expect(
                service.startRun({
                    content: 'Second',
                    threadId: 't1',
                    concurrency: ConcurrencyPolicy.Rejected,
                }),
            ).rejects.toThrow(ConflictException);
        });
    });

    describe('resume', () => {
        it('should throw when run not found', async () => {
            await expect(
                service.resume({ runId: 'nonexistent', toolCallId: 'tc-1', result: {} }),
            ).rejects.toThrow(/not found/);
        });

        it('should return same RunRecord without calling factory again', async () => {
            const record = await service.startRun({ content: 'test', threadId: 't1' });
            record.setStatus(RunStatus.Interrupted);

            (mockRunContextFactory.create as jest.Mock).mockClear();

            const resumed = await service.resume({
                runId: record.id,
                toolCallId: 'tc-1',
                result: {},
            });

            expect(resumed).toBe(record);
            expect(mockRunContextFactory.create).not.toHaveBeenCalled();
        });

        it('should preserve original runContext after resume', async () => {
            const record = await service.startRun({ content: 'test', threadId: 't1' });
            const originalContext = record.runContext;
            record.setStatus(RunStatus.Interrupted);

            const resumed = await service.resume({
                runId: record.id,
                toolCallId: 'tc-1',
                result: {},
            });

            expect(resumed.runContext).toBe(originalContext);
        });
    });

    describe('cancel', () => {
        it('should cancel an active run', async () => {
            const run = await service.startRun({ content: 'test', threadId: 't1' });
            await service.cancel(run.id);
            const found = runManager.getRun(run.id);
            expect(found?.status).toBe(RunStatus.Cancelled);
        });

        it('should throw when run not found', async () => {
            await expect(service.cancel('nonexistent')).rejects.toThrow(/not found/);
        });
    });
});
