import type { BaseCheckpointSaver } from '@langchain/langgraph-checkpoint';
import type { RunEventStore } from '../../store/run-event-store';
import { RunStatus } from '../../types/run.types';
import type { RunContext } from '../run-context';
import { RunManager } from '../run-manager';

/**
 * 创建一个用于测试的 mock RunContext
 */
function createMockRunContext(overrides?: {
    eventStore?: { append: jest.Mock };
    checkpointer?: { type: string };
}): RunContext {
    const mockES = overrides?.eventStore ?? { append: jest.fn().mockResolvedValue({}) };
    const mockCP = overrides?.checkpointer ?? { type: 'memory' };

    return {
        checkpointer: mockCP as unknown as BaseCheckpointSaver,
        eventStore: mockES as unknown as RunEventStore,
        llmConfig: { provider: 'zhipu', model: 'glm-5' },
        requestContext: undefined,
    } as RunContext;
}

describe('RunManager', () => {
    let manager: RunManager;

    beforeEach(() => {
        manager = new RunManager();
    });

    describe('createRun', () => {
        it('should create a run with runContext and snapshot', () => {
            const ctx = createMockRunContext();
            const snapshot = { content: 'Hello' };

            const run = manager.createRun('thread-1', ctx, snapshot);
            expect(run).toBeDefined();
            expect(run.threadId).toBe('thread-1');
            expect(run.status).toBe(RunStatus.Pending);
            expect(run.runContext).toBe(ctx);
            expect(run.snapshot).toBe(snapshot);
        });

        it('should track the run by ID', () => {
            const ctx = createMockRunContext();
            const run = manager.createRun('thread-1', ctx, { content: 'test' });
            const found = manager.getRun(run.id);
            expect(found).toBe(run);
        });

        it('should return undefined for unknown run ID', () => {
            expect(manager.getRun('nonexistent')).toBeUndefined();
        });

        it('should create distinct records for each call', () => {
            const ctx1 = createMockRunContext();
            const ctx2 = createMockRunContext();

            const r1 = manager.createRun('t1', ctx1, { content: 'a' });
            const r2 = manager.createRun('t2', ctx2, { content: 'b' });

            expect(r1).not.toBe(r2);
            expect(r1.runContext).toBe(ctx1);
            expect(r2.runContext).toBe(ctx2);
        });
    });

    describe('getActiveRunForThread', () => {
        it('should return active run for a thread', () => {
            const ctx = createMockRunContext();
            const run = manager.createRun('thread-1', ctx, { content: 'test' });
            run.setStatus(RunStatus.Running);
            const active = manager.getActiveRunForThread('thread-1');
            expect(active).toBe(run);
        });

        it('should return undefined when no active run exists', () => {
            expect(manager.getActiveRunForThread('thread-1')).toBeUndefined();
        });

        it('should not return completed runs', () => {
            const ctx = createMockRunContext();
            const run = manager.createRun('thread-1', ctx, { content: 'test' });
            run.setStatus(RunStatus.Completed);
            expect(manager.getActiveRunForThread('thread-1')).toBeUndefined();
        });

        it('should return interrupted runs as active', () => {
            const ctx = createMockRunContext();
            const run = manager.createRun('thread-1', ctx, { content: 'test' });
            run.setStatus(RunStatus.Interrupted);
            const active = manager.getActiveRunForThread('thread-1');
            expect(active).toBe(run);
        });
    });

    describe('cancelRun', () => {
        it('should cancel a run by ID', () => {
            const ctx = createMockRunContext();
            const run = manager.createRun('thread-1', ctx, { content: 'test' });
            manager.cancelRun(run.id);
            expect(run.status).toBe(RunStatus.Cancelled);
        });

        it('should do nothing for unknown run ID', () => {
            expect(() => manager.cancelRun('nonexistent')).not.toThrow();
        });
    });

    describe('cleanup', () => {
        it('should remove completed/failed/cancelled runs', () => {
            const ctx1 = createMockRunContext();
            const ctx2 = createMockRunContext();
            const r1 = manager.createRun('t1', ctx1, { content: 'a' });
            const r2 = manager.createRun('t2', ctx2, { content: 'b' });
            r1.setStatus(RunStatus.Completed);
            r2.setStatus(RunStatus.Running);

            manager.cleanup();

            expect(manager.getRun(r1.id)).toBeUndefined();
            expect(manager.getRun(r2.id)).toBe(r2);
        });
    });
});
