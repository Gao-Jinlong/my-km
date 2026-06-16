import type { RunContext } from '../run-context';
import type { RunEventSink } from '../run-event-sink';
import { RunRecord } from '../run-record';

function createMockRunContext(): RunContext {
    return {
        checkpointer: { type: 'memory' } as never,
        eventStore: { append: jest.fn().mockResolvedValue({}) } as never,
        eventBus: { publish: jest.fn().mockResolvedValue(undefined) } as never,
        llmConfig: { provider: 'zhipu', model: 'glm-5' },
    } as RunContext;
}

describe('RunRecord sink registration', () => {
    let record: RunRecord;

    beforeEach(() => {
        record = new RunRecord({
            id: 'run-1',
            threadId: 'thread-1',
            runContext: createMockRunContext(),
            snapshot: { content: 'Hello' },
        });
    });

    describe('registerSink', () => {
        it('registers a sink and delivers events to it', async () => {
            const captured: Array<{ eventType: string; seq: number }> = [];
            const sink: RunEventSink = {
                push(e) {
                    captured.push({ eventType: e.eventType, seq: e.seq });
                },
                close() {},
            };

            record.registerSink(sink);
            await record.emitEvent({ event: 'values', data: {} });

            expect(captured).toHaveLength(1);
            expect(captured[0].eventType).toBe('values');
            expect(captured[0].seq).toBe(0);
        });

        it('returns an unregister function that removes the sink', async () => {
            const captured: Array<{ eventType: string }> = [];
            const sink: RunEventSink = {
                push(e) {
                    captured.push({ eventType: e.eventType });
                },
                close() {},
            };

            const unregister = record.registerSink(sink);
            await record.emitEvent({ event: 'metadata', data: {} });
            expect(captured).toHaveLength(1);

            unregister();
            await record.emitEvent({ event: 'values', data: {} });
            expect(captured).toHaveLength(1); // 不再增加
        });

        it('calls sink.close() when unregistering', async () => {
            const closeSpy = jest.fn();
            const sink: RunEventSink = {
                push() {},
                close: closeSpy,
            };

            const unregister = record.registerSink(sink);
            unregister();

            expect(closeSpy).toHaveBeenCalledTimes(1);
        });

        it('supports multiple sinks registered simultaneously', async () => {
            const captured1: string[] = [];
            const captured2: string[] = [];

            record.registerSink({
                push(e) {
                    captured1.push(e.eventType);
                },
                close() {},
            });

            record.registerSink({
                push(e) {
                    captured2.push(e.eventType);
                },
                close() {},
            });

            await record.emitEvent({ event: 'metadata', data: {} });
            await record.emitEvent({ event: 'values', data: {} });

            expect(captured1).toEqual(['metadata', 'values']);
            expect(captured2).toEqual(['metadata', 'values']);
        });

        it('unregistering one sink does not affect others', async () => {
            const captured1: string[] = [];
            const captured2: string[] = [];

            const unregister1 = record.registerSink({
                push(e) {
                    captured1.push(e.eventType);
                },
                close() {},
            });

            record.registerSink({
                push(e) {
                    captured2.push(e.eventType);
                },
                close() {},
            });

            await record.emitEvent({ event: 'metadata', data: {} });
            unregister1();
            await record.emitEvent({ event: 'values', data: {} });

            expect(captured1).toEqual(['metadata']);
            expect(captured2).toEqual(['metadata', 'values']);
        });

        it('delivers emitSSEOnly events to registered sinks', () => {
            const captured: string[] = [];
            record.registerSink({
                push(e) {
                    captured.push(e.eventType);
                },
                close() {},
            });

            record.emitSSEOnly({ event: 'messages', data: { chunk: 'hi' } });
            record.emitSSEOnly({ event: 'messages', data: { chunk: '!' } });

            expect(captured).toEqual(['messages', 'messages']);
        });
    });
});
