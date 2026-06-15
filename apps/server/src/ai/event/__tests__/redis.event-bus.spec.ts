import { EventEmitter } from 'node:events';
import { type RunStreamEvent, runChannel } from '../event-bus';
import { RedisEventBus } from '../redis.event-bus';

/**
 * FakeRedis —— 最小 Redis Pub/Sub 测试替身（结构满足 RedisPubSubLike）。
 * publish 记录调用；message 经 EventEmitter.emit 路由到 subscriber 监听器；
 * subscribe/unsubscribe 记录 channel 调用以便验证懒订阅。
 */
class FakeRedis extends EventEmitter {
    published: Array<{ channel: string; message: string }> = [];
    subscribed: string[] = [];
    unsubscribed: string[] = [];
    quitCount = 0;

    async publish(channel: string, message: string): Promise<number> {
        this.published.push({ channel, message });
        return 1;
    }

    async subscribe(...channels: string[]): Promise<number> {
        this.subscribed.push(...channels);
        return channels.length;
    }

    async unsubscribe(...channels: string[]): Promise<number> {
        this.unsubscribed.push(...channels);
        return channels.length;
    }

    async quit(): Promise<string> {
        this.quitCount++;
        return 'OK';
    }
}

describe('RedisEventBus', () => {
    let publisher: FakeRedis;
    let subscriber: FakeRedis;
    let bus: RedisEventBus;

    beforeEach(() => {
        publisher = new FakeRedis();
        subscriber = new FakeRedis();
        bus = new RedisEventBus(publisher, subscriber);
    });

    const ev = (seq: number, eventType = 'values'): RunStreamEvent => ({
        seq,
        eventType,
        payload: { n: seq },
    });

    it('publishes a JSON-serialized event on the channel', async () => {
        await bus.publish(runChannel('r1'), ev(1));
        expect(publisher.published).toEqual([
            { channel: 'run:r1', message: JSON.stringify(ev(1)) },
        ]);
    });

    it('delivers a subscriber message to a handler (parsed)', () => {
        const handler = jest.fn();
        bus.subscribe(runChannel('r1'), handler);
        subscriber.emit('message', 'run:r1', JSON.stringify(ev(2)));
        expect(handler).toHaveBeenCalledWith(ev(2));
    });

    it('delivers to multiple handlers on the same channel', () => {
        const a = jest.fn();
        const b = jest.fn();
        bus.subscribe(runChannel('r1'), a);
        bus.subscribe(runChannel('r1'), b);
        subscriber.emit('message', 'run:r1', JSON.stringify(ev(3)));
        expect(a).toHaveBeenCalledWith(ev(3));
        expect(b).toHaveBeenCalledWith(ev(3));
    });

    it('stops delivering after unsubscribe', () => {
        const handler = jest.fn();
        const sub = bus.subscribe(runChannel('r1'), handler);
        subscriber.emit('message', 'run:r1', JSON.stringify(ev(1)));
        sub.unsubscribe();
        subscriber.emit('message', 'run:r1', JSON.stringify(ev(2)));
        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler).toHaveBeenCalledWith(ev(1));
    });

    it('isolates channels — message on one does not reach another', () => {
        const handler = jest.fn();
        bus.subscribe(runChannel('r1'), handler);
        subscriber.emit('message', 'run:r2', JSON.stringify(ev(1)));
        expect(handler).not.toHaveBeenCalled();
    });

    it('lazily subscribes a channel once for multiple handlers', () => {
        bus.subscribe(runChannel('r1'), jest.fn());
        bus.subscribe(runChannel('r1'), jest.fn());
        expect(subscriber.subscribed.filter(c => c === 'run:r1')).toHaveLength(1);
    });

    it('unsubscribes the channel only when the last handler leaves', () => {
        const sub1 = bus.subscribe(runChannel('r1'), jest.fn());
        const sub2 = bus.subscribe(runChannel('r1'), jest.fn());
        sub1.unsubscribe();
        expect(subscriber.unsubscribed).not.toContain('run:r1');
        sub2.unsubscribe();
        expect(subscriber.unsubscribed).toContain('run:r1');
    });

    it('unsubscribe is idempotent after channel teardown', () => {
        const sub = bus.subscribe(runChannel('r1'), jest.fn());
        sub.unsubscribe();
        expect(() => sub.unsubscribe()).not.toThrow();
        expect(subscriber.unsubscribed.filter(c => c === 'run:r1')).toHaveLength(1);
    });

    it('discards an unparseable message without throwing', () => {
        const handler = jest.fn();
        bus.subscribe(runChannel('r1'), handler);
        expect(() => subscriber.emit('message', 'run:r1', '{not json')).not.toThrow();
        expect(handler).not.toHaveBeenCalled();
    });

    it('quits both connections on module destroy', async () => {
        await bus.onModuleDestroy();
        expect(publisher.quitCount).toBe(1);
        expect(subscriber.quitCount).toBe(1);
    });
});
