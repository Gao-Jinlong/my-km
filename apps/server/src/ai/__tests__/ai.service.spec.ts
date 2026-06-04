import type { BaseCheckpointSaver } from '@langchain/langgraph-checkpoint';
import { ConflictException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { AiChatService } from '../ai.service';
import { LLMFactory } from '../llm/llm-factory';
import { ProviderRegistry } from '../llm/provider-registry';
import { RunManager } from '../run/run-manager';
import type { RunEventStore } from '../store/run-event-store';
import { ThreadService } from '../thread/thread.service';
import { ConcurrencyPolicy, RunStatus } from '../types/run.types';

// Ensure ProviderRegistry and LLMFactory are resolved by NestJS
// We provide them as string tokens matching @Inject() decorators

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

// Mock RunContext to avoid langgraph import chain
jest.mock('../run/run-context', () => ({
    RunContext: jest.fn().mockImplementation(() => ({
        checkpointer: { type: 'memory' },
        eventStore: { append: jest.fn() },
        getCompiledGraph: jest.fn().mockReturnValue({
            stream: jest.fn().mockResolvedValue((async function* () {})()),
        }),
    })),
}));

describe('AiChatService', () => {
    let service: AiChatService;
    let threadService: ThreadService;
    let runManager: RunManager;
    let mockCheckpointer: { type: string };
    let mockEventStore: { append: jest.Mock };
    let mockProviderRegistry: { defaultConfig: any; register: jest.Mock };

    beforeEach(async () => {
        mockCheckpointer = { type: 'memory' };
        mockEventStore = { append: jest.fn().mockResolvedValue({}) };
        mockProviderRegistry = {
            defaultConfig: { provider: 'zhipu', model: 'glm-5' },
            register: jest.fn(),
        };

        const runContext = new (jest.requireMock('../run/run-context').RunContext)();

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
                {
                    provide: RunManager,
                    useFactory: () => {
                        const es = mockEventStore as unknown as RunEventStore;
                        const cp = mockCheckpointer as unknown as BaseCheckpointSaver;
                        return new RunManager(es, cp);
                    },
                },
                {
                    provide: 'RunContext',
                    useValue: runContext,
                },
                {
                    provide: 'ProviderRegistry',
                    useValue: mockProviderRegistry,
                },
                {
                    provide: 'LLMFactory',
                    useValue: { getOrCreate: jest.fn().mockReturnValue({ chat: jest.fn() }) },
                },
            ],
        }).compile();

        service = module.get<AiChatService>(AiChatService);
        threadService = module.get<ThreadService>(ThreadService);
        runManager = module.get<RunManager>(RunManager);
    });

    describe('startRun', () => {
        it('should create a thread and run when no threadId', async () => {
            const result = await service.startRun({
                content: 'Hello',
            });
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
    });

    describe('concurrency control', () => {
        it('should reject when active run exists and policy is rejected', async () => {
            // Create first run
            await service.startRun({ content: 'First', threadId: 't1' });
            const activeRun = runManager.getActiveRunForThread('t1');
            if (activeRun) activeRun.setStatus(RunStatus.Running);

            // Second run with rejected policy
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
