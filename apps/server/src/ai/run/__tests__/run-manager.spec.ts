import type { BaseCheckpointSaver } from '@langchain/langgraph-checkpoint';
import type { RunEventStore } from '../../store/run-event-store';
import { RunStatus } from '../../types/run.types';
import { RunManager } from '../run-manager';

describe('RunManager', () => {
    let manager: RunManager;
    let mockEventStore: { append: jest.Mock };
    let mockCheckpointer: { type: string };

    beforeEach(() => {
        mockEventStore = { append: jest.fn().mockResolvedValue({}) };
        mockCheckpointer = { type: 'memory' };
        manager = new RunManager(
            mockEventStore as unknown as RunEventStore,
            mockCheckpointer as unknown as BaseCheckpointSaver,
        );
    });

    describe('createRun', () => {
        it('should create a run and track it', () => {
            const run = manager.createRun('thread-1');
            expect(run).toBeDefined();
            expect(run.threadId).toBe('thread-1');
            expect(run.status).toBe(RunStatus.Pending);
        });

        it('should track the run by ID', () => {
            const run = manager.createRun('thread-1');
            const found = manager.getRun(run.id);
            expect(found).toBe(run);
        });

        it('should return undefined for unknown run ID', () => {
            expect(manager.getRun('nonexistent')).toBeUndefined();
        });
    });

    describe('getActiveRunForThread', () => {
        it('should return active run for a thread', () => {
            const run = manager.createRun('thread-1');
            run.setStatus(RunStatus.Running);
            const active = manager.getActiveRunForThread('thread-1');
            expect(active).toBe(run);
        });

        it('should return undefined when no active run exists', () => {
            expect(manager.getActiveRunForThread('thread-1')).toBeUndefined();
        });

        it('should not return completed runs', () => {
            const run = manager.createRun('thread-1');
            run.setStatus(RunStatus.Completed);
            expect(manager.getActiveRunForThread('thread-1')).toBeUndefined();
        });

        it('should return interrupted runs as active', () => {
            const run = manager.createRun('thread-1');
            run.setStatus(RunStatus.Interrupted);
            const active = manager.getActiveRunForThread('thread-1');
            expect(active).toBe(run);
        });
    });

    describe('cancelRun', () => {
        it('should cancel a run by ID', () => {
            const run = manager.createRun('thread-1');
            manager.cancelRun(run.id);
            expect(run.status).toBe(RunStatus.Cancelled);
        });

        it('should do nothing for unknown run ID', () => {
            expect(() => manager.cancelRun('nonexistent')).not.toThrow();
        });
    });

    describe('cleanup', () => {
        it('should remove completed/failed/cancelled runs', () => {
            const r1 = manager.createRun('t1');
            const r2 = manager.createRun('t2');
            r1.setStatus(RunStatus.Completed);
            r2.setStatus(RunStatus.Running);

            manager.cleanup();

            expect(manager.getRun(r1.id)).toBeUndefined();
            expect(manager.getRun(r2.id)).toBe(r2);
        });
    });
});
