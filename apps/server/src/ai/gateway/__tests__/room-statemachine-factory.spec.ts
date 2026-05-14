import { RoomStateMachineFactory } from '../room-statemachine-factory';

describe('RoomStateMachineFactory', () => {
    let factory: RoomStateMachineFactory;

    beforeEach(() => {
        factory = new RoomStateMachineFactory();
    });

    it('creates a new state machine instance', () => {
        const emit = jest.fn();
        const sm = factory.create({
            conversationId: 'conv-1',
            clientId: 'client-1',
            emit,
        });

        expect(sm).toBeDefined();
        expect(factory.get('conv-1')).toBe(sm);
    });

    it('throws if session already active', () => {
        const emit = jest.fn();
        factory.create({ conversationId: 'conv-1', clientId: 'client-1', emit });

        expect(() =>
            factory.create({ conversationId: 'conv-1', clientId: 'client-2', emit }),
        ).toThrow('already active');
    });

    it('returns null for unknown conversation', () => {
        expect(factory.get('nope')).toBeNull();
    });

    it('destroys a session', () => {
        const emit = jest.fn();
        factory.create({ conversationId: 'conv-1', clientId: 'client-1', emit });
        factory.destroy('conv-1');
        expect(factory.get('conv-1')).toBeNull();
    });

    it('cleans up all sessions for a client on disconnect', () => {
        const emit = jest.fn();
        factory.create({ conversationId: 'conv-1', clientId: 'client-1', emit });
        factory.create({ conversationId: 'conv-2', clientId: 'client-1', emit });

        factory.destroyByClientId('client-1');

        expect(factory.get('conv-1')).toBeNull();
        expect(factory.get('conv-2')).toBeNull();
    });
});
