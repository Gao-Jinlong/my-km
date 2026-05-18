import { type BusMessage, MessageBus, type MessageHandler } from '../message-bus';

function makeMsg(type: string, clientId = 'c1'): BusMessage {
    return { type, clientId, payload: { content: 'test' } };
}

describe('MessageBus', () => {
    let bus: MessageBus;

    beforeEach(() => {
        bus = new MessageBus();
    });

    it('delivers a message to a matching handler', async () => {
        const received: BusMessage[] = [];
        const handler: MessageHandler = {
            allowedTypes: new Set(['foo']),
            handle: async msg => {
                received.push(msg);
            },
        };

        bus.subscribe(handler);
        await bus.publish(makeMsg('foo'));

        expect(received).toHaveLength(1);
        expect(received[0].type).toBe('foo');
    });

    it('ignores non-matching handler', async () => {
        const received: BusMessage[] = [];
        const handler: MessageHandler = {
            allowedTypes: new Set(['foo']),
            handle: async msg => {
                received.push(msg);
            },
        };

        bus.subscribe(handler);
        await bus.publish(makeMsg('bar'));

        expect(received).toHaveLength(0);
    });

    it('fans out to multiple matching handlers', async () => {
        const count = { a: 0, b: 0 };
        bus.subscribe({
            allowedTypes: new Set(['foo', 'bar']),
            handle: async () => {
                count.a++;
            },
        });
        bus.subscribe({
            allowedTypes: new Set(['foo']),
            handle: async () => {
                count.b++;
            },
        });

        await bus.publish(makeMsg('foo'));

        expect(count.a).toBe(1);
        expect(count.b).toBe(1);
    });

    it('continues to other handlers when one throws', async () => {
        const received: string[] = [];
        bus.subscribe({
            allowedTypes: new Set(['boom']),
            handle: async () => {
                throw new Error('handler error');
            },
        });
        bus.subscribe({
            allowedTypes: new Set(['boom']),
            handle: async () => {
                received.push('second handler ran');
            },
        });

        await expect(bus.publish(makeMsg('boom'))).resolves.not.toThrow();
        expect(received).toContain('second handler ran');
    });

    it('unsubscribes a handler', async () => {
        const received: BusMessage[] = [];
        const handler: MessageHandler = {
            allowedTypes: new Set(['foo']),
            handle: async msg => {
                received.push(msg);
            },
        };

        const unsub = bus.subscribe(handler);
        await bus.publish(makeMsg('foo'));
        expect(received).toHaveLength(1);

        unsub();
        await bus.publish(makeMsg('foo'));
        expect(received).toHaveLength(1); // still 1, not 2
    });

    it('logs warning when no handler matches', async () => {
        const warnSpy = jest.spyOn(bus['logger'], 'warn').mockImplementation(() => {});
        await bus.publish(makeMsg('orphan'));
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('orphan'));
        warnSpy.mockRestore();
    });
});
