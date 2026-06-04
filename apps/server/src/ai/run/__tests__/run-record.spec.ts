import type { BaseCheckpointSaver } from '@langchain/langgraph-checkpoint';
import type { RunEventStore } from '../../store/run-event-store';
import { RunStatus } from '../../types/run.types';
import { RunRecord } from '../run-record';

describe('RunRecord', () => {
    let record: RunRecord;
    let mockEventStore: { append: jest.Mock };
    let mockCheckpointer: { type: string };

    beforeEach(() => {
        mockEventStore = { append: jest.fn().mockResolvedValue({}) };
        mockCheckpointer = { type: 'memory' };

        record = new RunRecord({
            id: 'run-1',
            threadId: 'thread-1',
            eventStore: mockEventStore as unknown as RunEventStore,
            checkpointer: mockCheckpointer as unknown as BaseCheckpointSaver,
        });
    });

    describe('initial state', () => {
        it('should start with pending status', () => {
            expect(record.status).toBe(RunStatus.Pending);
            expect(record.id).toBe('run-1');
            expect(record.threadId).toBe('thread-1');
        });

        it('should have zero token usage', () => {
            expect(record.tokenUsage).toEqual({
                promptTokens: 0,
                completionTokens: 0,
                totalTokens: 0,
            });
        });
    });

    describe('abort', () => {
        it('should set status to cancelled', () => {
            record.abort();
            expect(record.status).toBe(RunStatus.Cancelled);
        });

        it('should abort the internal controller', () => {
            record.abort();
            expect(record.abortSignal.aborted).toBe(true);
        });
    });

    describe('emitEvent', () => {
        it('should append event to event store', async () => {
            const event = { event: 'lifecycle', data: { status: 'started' } };
            await record.emitEvent(event);
            expect(mockEventStore.append).toHaveBeenCalledWith(
                'run-1',
                'thread-1',
                expect.objectContaining({
                    eventType: 'lifecycle',
                    payload: { status: 'started' },
                }),
            );
        });
    });

    describe('finalize', () => {
        it('should return token usage', () => {
            record.accumulateTokens({ promptTokens: 100, completionTokens: 50, totalTokens: 150 });
            const usage = record.finalize();
            expect(usage).toEqual({
                promptTokens: 100,
                completionTokens: 50,
                totalTokens: 150,
            });
        });
    });

    describe('accumulateTokens', () => {
        it('should accumulate token usage across multiple calls', () => {
            record.accumulateTokens({ promptTokens: 10, completionTokens: 5, totalTokens: 15 });
            record.accumulateTokens({ promptTokens: 20, completionTokens: 10, totalTokens: 30 });

            expect(record.tokenUsage).toEqual({
                promptTokens: 30,
                completionTokens: 15,
                totalTokens: 45,
            });
        });
    });
});
