import type { BaseCheckpointSaver } from '@langchain/langgraph-checkpoint';
import type { EventBus, RunStreamEvent } from '../../event/event-bus';
import type { RunEventStore } from '../../store/run-event-store';
import { RunStatus } from '../../types/run.types';
import type { RunContext } from '../run-context';
import { RunRecord } from '../run-record';

/**
 * 创建一个用于测试的 mock RunContext
 */
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

describe('RunRecord', () => {
    let record: RunRecord;
    let mockEventStore: { append: jest.Mock };

    beforeEach(() => {
        mockEventStore = { append: jest.fn().mockResolvedValue({}) };
        const runContext = createMockRunContext({ eventStore: mockEventStore });

        record = new RunRecord({
            id: 'run-1',
            threadId: 'thread-1',
            runContext,
            snapshot: { content: 'Hello' },
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

    describe('runContext and snapshot', () => {
        it('should hold runContext', () => {
            expect(record.runContext).toBeDefined();
            expect(record.runContext.eventStore).toBe(mockEventStore);
        });

        it('should hold typed snapshot', () => {
            expect(record.snapshot).toBeDefined();
            expect(record.snapshot.content).toBe('Hello');
        });

        it('should not have hidden _llmProvider/_content/_context fields', () => {
            expect((record as unknown as Record<string, unknown>)._llmProvider).toBeUndefined();
            expect((record as unknown as Record<string, unknown>)._content).toBeUndefined();
            expect((record as unknown as Record<string, unknown>)._context).toBeUndefined();
        });

        it('should hold snapshot with requestContext', () => {
            const ctx = createMockRunContext();
            const rec = new RunRecord({
                id: 'run-2',
                threadId: 'thread-1',
                runContext: ctx,
                snapshot: { content: 'Hi', requestContext: { userId: 'u1' } },
            });

            expect(rec.snapshot.requestContext).toEqual({ userId: 'u1' });
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
        it('should append event to eventStore via runContext', async () => {
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

        it('should call sseWriter when set', async () => {
            const capturedEvents: Array<{ event: string; data: unknown }> = [];
            record.setSseWriter(e => {
                capturedEvents.push(e);
            });

            await record.emitEvent({ event: 'metadata', data: { run_id: 'run-1' } });
            await record.emitEvent({ event: 'values', data: { messages: [] } });

            expect(capturedEvents).toHaveLength(2);
            expect(capturedEvents[0].event).toBe('metadata');
            expect(capturedEvents[1].event).toBe('values');
        });

        it('should write to both sseWriter and eventStore', async () => {
            const capturedEvents: Array<{ event: string; data: unknown }> = [];
            record.setSseWriter(e => {
                capturedEvents.push(e);
            });

            await record.emitEvent({ event: 'end', data: {} });

            // sseWriter called
            expect(capturedEvents).toHaveLength(1);
            expect(capturedEvents[0].event).toBe('end');

            // eventStore.append called
            expect(mockEventStore.append).toHaveBeenCalledWith(
                'run-1',
                'thread-1',
                expect.objectContaining({ eventType: 'end' }),
            );
        });

        it('should publish state-boundary events to eventBus with seq + eventType + payload', async () => {
            const eventBus = { publish: jest.fn().mockResolvedValue(undefined) };
            const rec = new RunRecord({
                id: 'r1',
                threadId: 't1',
                runContext: createMockRunContext({ eventBus }),
                snapshot: { content: '' },
                lastSeq: 10,
            });

            await rec.emitEvent({ event: 'values', data: { messages: [] } });

            expect(eventBus.publish).toHaveBeenCalledWith('run:r1', {
                seq: 10,
                eventType: 'values',
                payload: { messages: [] },
            });
        });

        it('should not block SSE/PG when eventBus.publish rejects', async () => {
            const eventStore = { append: jest.fn().mockResolvedValue({}) };
            const eventBus = { publish: jest.fn().mockRejectedValue(new Error('bus down')) };
            const captured: Array<{ event: string; data: unknown }> = [];
            const rec = new RunRecord({
                id: 'r1',
                threadId: 't1',
                runContext: createMockRunContext({ eventStore, eventBus }),
                snapshot: { content: '' },
            });
            rec.setSseWriter(e => captured.push(e));

            await expect(rec.emitEvent({ event: 'end', data: {} })).resolves.toBeUndefined();
            // SSE 仍写
            expect(captured).toHaveLength(1);
            // PG 仍写
            expect(eventStore.append).toHaveBeenCalled();
        });

        it('uses the SAME seq for PG append and eventBus publish', async () => {
            const eventStore = { append: jest.fn().mockResolvedValue({}) };
            const eventBus = { publish: jest.fn().mockResolvedValue(undefined) };
            const rec = new RunRecord({
                id: 'r1',
                threadId: 't1',
                runContext: createMockRunContext({ eventStore, eventBus }),
                snapshot: { content: '' },
                lastSeq: 7,
            });

            await rec.emitEvent({ event: 'values', data: {} });

            const pgSeq = (eventStore.append.mock.calls[0][2] as { seq: number }).seq;
            const pubSeq = (eventBus.publish.mock.calls[0][1] as RunStreamEvent).seq;
            expect(pgSeq).toBe(7);
            expect(pubSeq).toBe(7);
            expect(pgSeq).toBe(pubSeq);
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

    describe('lastSeq anchoring', () => {
        it('defaults seq to 0 for a new run', () => {
            const record = new RunRecord({
                id: 'r1',
                threadId: 't1',
                runContext: createMockRunContext(),
                snapshot: { content: 'hi' },
            });
            expect(record.currentSeq).toBe(0);
        });

        it('starts seq from provided lastSeq (resume path)', () => {
            const record = new RunRecord({
                id: 'r1',
                threadId: 't1',
                runContext: createMockRunContext(),
                snapshot: { content: '' },
                lastSeq: 41,
            });
            expect(record.currentSeq).toBe(41);
        });

        it('setLastSeq resets the seq counter', () => {
            const record = new RunRecord({
                id: 'r1',
                threadId: 't1',
                runContext: createMockRunContext(),
                snapshot: { content: '' },
            });
            record.setLastSeq(99);
            expect(record.currentSeq).toBe(99);
        });

        it('uses currentSeq as the next seq allocated by emitEvent', async () => {
            const eventStore = { append: jest.fn().mockResolvedValue({}) };
            const record = new RunRecord({
                id: 'r1',
                threadId: 't1',
                runContext: createMockRunContext({ eventStore }),
                snapshot: { content: '' },
                lastSeq: 41,
            });

            await record.emitEvent({ event: 'values', data: { messages: [] } });

            expect(eventStore.append).toHaveBeenCalledWith(
                'r1',
                't1',
                expect.objectContaining({ seq: 41 }),
            );
            expect(record.currentSeq).toBe(42);
        });
    });

    describe('emitSSEOnly', () => {
        it('should publish messages events with seq (no PG persist)', async () => {
            const eventStore = { append: jest.fn().mockResolvedValue({}) };
            const eventBus = { publish: jest.fn().mockResolvedValue(undefined) };
            const rec = new RunRecord({
                id: 'r1',
                threadId: 't1',
                runContext: createMockRunContext({ eventStore, eventBus }),
                snapshot: { content: '' },
                lastSeq: 5,
            });

            rec.emitSSEOnly({ event: 'messages', data: { chunk: 'hi' } });

            expect(eventBus.publish).toHaveBeenCalledWith('run:r1', {
                seq: 5,
                eventType: 'messages',
                payload: { chunk: 'hi' },
            });
            // messages 不落盘
            expect(eventStore.append).not.toHaveBeenCalled();
            // seq 已分配（currentSeq 推进）
            expect(rec.currentSeq).toBe(6);
        });

        it('should write to sseWriter when set', () => {
            const captured: Array<{ event: string; data: unknown }> = [];
            const rec = new RunRecord({
                id: 'r1',
                threadId: 't1',
                runContext: createMockRunContext(),
                snapshot: { content: '' },
            });
            rec.setSseWriter(e => captured.push(e));

            rec.emitSSEOnly({ event: 'messages', data: { chunk: 'x' } });

            expect(captured).toHaveLength(1);
            expect(captured[0].event).toBe('messages');
        });

        it('does not throw when eventBus.publish rejects (catch prevents unhandled rejection)', () => {
            const eventBus = { publish: jest.fn().mockRejectedValue(new Error('bus down')) };
            const captured: Array<{ event: string; data: unknown }> = [];
            const rec = new RunRecord({
                id: 'r1',
                threadId: 't1',
                runContext: createMockRunContext({ eventBus }),
                snapshot: { content: '' },
            });
            rec.setSseWriter(e => captured.push(e));

            // emitSSEOnly is synchronous; the rejected publish is fire-and-forget + .catch'd,
            // so the synchronous call must not throw and SSE must still be written.
            expect(() =>
                rec.emitSSEOnly({ event: 'messages', data: { chunk: 'x' } }),
            ).not.toThrow();
            expect(captured).toHaveLength(1);
            expect(captured[0].event).toBe('messages');
        });
    });
});
