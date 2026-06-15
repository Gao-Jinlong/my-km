import type { BaseCheckpointSaver } from '@langchain/langgraph-checkpoint';
import type { EventBus } from '../../event/event-bus';
import type { RunEventStore } from '../../store/run-event-store';
import { RunStatus } from '../../types/run.types';
import type { RunContext } from '../run-context';
import { RunManager } from '../run-manager';
import { RunRecord } from '../run-record';
import type { RunStateRepository } from '../run-state.repository';

function createMockRunContext(overrides?: {
    eventStore?: { append: jest.Mock };
    checkpointer?: { type: string };
    eventBus?: { publish: jest.Mock };
}): RunContext {
    const mockES = overrides?.eventStore ?? { append: jest.fn().mockResolvedValue({}) };
    const mockCP = overrides?.checkpointer ?? { type: 'memory' };
    const mockEB = overrides?.eventBus ?? { publish: jest.fn().mockResolvedValue(undefined) };
    return {
        checkpointer: mockCP as unknown as BaseCheckpointSaver,
        eventStore: mockES as unknown as RunEventStore,
        eventBus: mockEB as unknown as EventBus,
        llmConfig: { provider: 'zhipu', model: 'glm-5' },
    } as RunContext;
}

function createMockRunStateRepo(): {
    repo: RunStateRepository;
    store: Map<string, Record<string, unknown>>;
} {
    const store = new Map<string, Record<string, unknown>>();
    const repo = {
        findById: jest.fn(async (id: string) => store.get(id) ?? null),
        findActiveRunByThread: jest.fn(async (threadId: string) => {
            for (const row of store.values()) {
                if (
                    row.threadId === threadId &&
                    ['pending', 'running', 'interrupted'].includes(row.status as string)
                ) {
                    return row;
                }
            }
            return null;
        }),
        createRun: jest.fn(async (input: Record<string, unknown>) => {
            const row = { ...input, lastSeq: 0 };
            store.set(input.id as string, row);
            return row;
        }),
        setStatus: jest.fn(async (id: string, status: string) => {
            const row = store.get(id);
            if (row) row.status = status;
        }),
        acquireLease: jest.fn(async () => ({ acquired: true })),
        releaseLease: jest.fn(),
        heartbeat: jest.fn(async () => true),
        saveResumePayload: jest.fn(),
        updateLastSeq: jest.fn(),
        updateTokenUsage: jest.fn(),
    } as unknown as RunStateRepository;
    return { repo, store };
}

describe('RunManager', () => {
    let manager: RunManager;
    let runStateRepo: RunStateRepository;

    beforeEach(() => {
        const { repo } = createMockRunStateRepo();
        runStateRepo = repo;
        manager = new RunManager(runStateRepo);
    });

    describe('createRun', () => {
        it('creates a run and persists authoritative fields via repo', async () => {
            const ctx = createMockRunContext();
            const snapshot = { content: 'Hello' };

            const run = await manager.createRun('thread-1', ctx, snapshot, { replicaId: 'A' });

            expect(run).toBeDefined();
            expect(run.threadId).toBe('thread-1');
            expect(run.status).toBe(RunStatus.Pending);
            expect(runStateRepo.createRun).toHaveBeenCalledWith(
                expect.objectContaining({
                    threadId: 'thread-1',
                    ownerId: 'A',
                    inputKind: 'message',
                    content: 'Hello',
                }),
            );
        });

        it('tracks the run by ID in memory cache', async () => {
            const ctx = createMockRunContext();
            const run = await manager.createRun(
                'thread-1',
                ctx,
                { content: 'test' },
                { replicaId: 'A' },
            );
            expect(manager.getRun(run.id)).toBe(run);
        });

        it('returns undefined for unknown run ID', () => {
            expect(manager.getRun('nonexistent')).toBeUndefined();
        });

        it('asserts leaseUntil is a future Date', async () => {
            const ctx = createMockRunContext();
            await manager.createRun('thread-1', ctx, { content: 'test' }, { replicaId: 'A' });
            const createArg = (runStateRepo.createRun as jest.Mock).mock.calls[0][0];
            expect(createArg.leaseUntil).toBeInstanceOf(Date);
            expect(createArg.leaseUntil.getTime()).toBeGreaterThan(Date.now());
        });

        it('removes memory cache and rethrows when persistence fails', async () => {
            const randomUUIDSpy = jest
                .spyOn(crypto, 'randomUUID')
                .mockReturnValue(
                    'run-failed' as `${string}-${string}-${string}-${string}-${string}`,
                );
            try {
                (runStateRepo.createRun as jest.Mock).mockRejectedValueOnce(new Error('DB down'));

                const ctx = createMockRunContext();
                await expect(
                    manager.createRun('thread-1', ctx, { content: 'test' }, { replicaId: 'A' }),
                ).rejects.toThrow('DB down');

                expect(manager.getRun('run-failed')).toBeUndefined();
            } finally {
                randomUUIDSpy.mockRestore();
            }
        });
    });

    describe('getActiveRunByThread (delegated to PG)', () => {
        it('returns the active RunRow from repository', async () => {
            const ctx = createMockRunContext();
            await manager.createRun('thread-1', ctx, { content: 'test' }, { replicaId: 'A' });

            const active = await manager.getActiveRunByThread('thread-1');
            expect(active?.threadId).toBe('thread-1');
            expect(runStateRepo.findActiveRunByThread).toHaveBeenCalledWith('thread-1');
        });

        it('returns null when no active run', async () => {
            expect(await manager.getActiveRunByThread('none')).toBeNull();
        });
    });

    describe('adoptRun', () => {
        it('injects a rebuilt record into memory cache (resume path)', () => {
            const ctx = createMockRunContext();
            const record = new RunRecord({
                id: 'recovered-1',
                threadId: 'thread-1',
                runContext: ctx,
                snapshot: { content: '' },
            });
            manager.adoptRun(record);
            expect(manager.getRun('recovered-1')).toBe(record);
        });
    });

    describe('finalize', () => {
        it('writes provided token usage even when run is not in memory', async () => {
            await manager.finalize('missing-run', {
                promptTokens: 1,
                completionTokens: 2,
                totalTokens: 3,
            });
            expect(runStateRepo.updateTokenUsage).toHaveBeenCalledWith('missing-run', {
                promptTokens: 1,
                completionTokens: 2,
                totalTokens: 3,
            });
        });

        it('does not write zero token usage when no record and no usage provided', async () => {
            await manager.finalize('missing-run');
            expect(runStateRepo.updateTokenUsage).not.toHaveBeenCalled();
        });
    });

    describe('cancelRun', () => {
        it('cancels an in-memory run owned by this process', async () => {
            const ctx = createMockRunContext();
            const run = await manager.createRun(
                'thread-1',
                ctx,
                { content: 'test' },
                { replicaId: 'A' },
            );
            await manager.cancelRun(run.id);
            expect(run.status).toBe(RunStatus.Cancelled);
        });

        it('does nothing for unknown run ID', async () => {
            await expect(manager.cancelRun('nonexistent')).resolves.not.toThrow();
        });
    });

    describe('cleanup', () => {
        it('removes completed/failed/cancelled runs from memory cache', async () => {
            const ctx = createMockRunContext();
            const r1 = await manager.createRun('t1', ctx, { content: 'a' }, { replicaId: 'A' });
            const r2 = await manager.createRun('t2', ctx, { content: 'b' }, { replicaId: 'A' });
            r1.setStatus(RunStatus.Completed);
            r2.setStatus(RunStatus.Running);
            manager.cleanup();
            expect(manager.getRun(r1.id)).toBeUndefined();
            expect(manager.getRun(r2.id)).toBe(r2);
        });
    });

    describe('setStatus', () => {
        it('rethrows when repository status update fails', async () => {
            const ctx = createMockRunContext();
            const run = await manager.createRun(
                'thread-1',
                ctx,
                { content: 'test' },
                { replicaId: 'A' },
            );
            (runStateRepo.setStatus as jest.Mock).mockRejectedValueOnce(
                new Error('DB status failed'),
            );

            await expect(manager.setStatus(run.id, RunStatus.Running)).rejects.toThrow(
                'DB status failed',
            );
        });
    });
});
