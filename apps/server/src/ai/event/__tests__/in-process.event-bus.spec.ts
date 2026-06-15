import { type RunStreamEvent, runChannel } from '../event-bus';
import { InProcessEventBus } from '../in-process.event-bus';

describe('runChannel', () => {
    it('formats a channel as run:{runId}', () => {
        expect(runChannel('r_abc')).toBe('run:r_abc');
    });
});

describe('InProcessEventBus', () => {
    let bus: InProcessEventBus;

    beforeEach(() => {
        bus = new InProcessEventBus();
    });

    const ev = (seq: number, eventType = 'values'): RunStreamEvent => ({
        seq,
        eventType,
        payload: { n: seq },
    });

    it('delivers a published event to a subscribed handler', async () => {
        const received: RunStreamEvent[] = [];
        bus.subscribe(runChannel('r1'), e => received.push(e));
        await bus.publish(runChannel('r1'), ev(1));
        expect(received).toEqual([ev(1)]);
    });

    it('delivers to multiple subscribers on the same channel', async () => {
        const a: RunStreamEvent[] = [];
        const b: RunStreamEvent[] = [];
        bus.subscribe(runChannel('r1'), e => a.push(e));
        bus.subscribe(runChannel('r1'), e => b.push(e));
        await bus.publish(runChannel('r1'), ev(1));
        expect(a).toEqual([ev(1)]);
        expect(b).toEqual([ev(1)]);
    });

    it('stops delivering after unsubscribe', async () => {
        const received: RunStreamEvent[] = [];
        const sub = bus.subscribe(runChannel('r1'), e => received.push(e));
        await bus.publish(runChannel('r1'), ev(1));
        sub.unsubscribe();
        await bus.publish(runChannel('r1'), ev(2));
        expect(received).toEqual([ev(1)]);
    });

    it('isolates channels — publish to one does not reach another', async () => {
        const a: RunStreamEvent[] = [];
        bus.subscribe(runChannel('r1'), e => a.push(e));
        await bus.publish(runChannel('r2'), ev(1));
        expect(a).toEqual([]);
    });

    it('does not throw when publishing to a channel with no subscribers', async () => {
        await expect(bus.publish(runChannel('r1'), ev(1))).resolves.toBeUndefined();
    });

    it('is awaitable — handler runs before publish resolves', async () => {
        const seen: number[] = [];
        bus.subscribe(runChannel('r1'), e => seen.push(e.seq));
        await bus.publish(runChannel('r1'), ev(7));
        expect(seen).toEqual([7]);
    });

    it('unsubscribe is idempotent', async () => {
        const received: RunStreamEvent[] = [];
        const sub = bus.subscribe(runChannel('r1'), e => received.push(e));
        sub.unsubscribe();
        expect(() => sub.unsubscribe()).not.toThrow();
        await bus.publish(runChannel('r1'), ev(1));
        expect(received).toEqual([]);
    });

    it('survives a handler unsubscribing itself during dispatch', async () => {
        // 模拟 joinStream 收到 end 事件后自退订（终态关闭场景）
        const received: RunStreamEvent[] = [];
        let sub!: { unsubscribe(): void };
        sub = bus.subscribe(runChannel('r1'), e => {
            received.push(e);
            sub.unsubscribe();
        });
        await bus.publish(runChannel('r1'), ev(1));
        await bus.publish(runChannel('r1'), ev(2)); // 已退订，不应收到
        expect(received).toEqual([ev(1)]);
    });
});
