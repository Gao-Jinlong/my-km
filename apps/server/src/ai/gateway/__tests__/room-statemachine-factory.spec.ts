import { RoomState } from '../room-statemachine.types';
import { RoomStateMachineFactory } from '../room-statemachine-factory';

describe('RoomStateMachineFactory', () => {
    let factory: RoomStateMachineFactory;

    const mockEmit = jest.fn();

    beforeEach(() => {
        factory = new RoomStateMachineFactory();
    });

    describe('destroyByClientId', () => {
        it('destroys all FSMs for a given client', () => {
            factory.create({
                roomId: 'room-1',
                clientId: 'client-1',
                emit: mockEmit,
            });
            factory.create({
                roomId: 'room-2',
                clientId: 'client-1',
                emit: mockEmit,
            });
            factory.create({
                roomId: 'room-3',
                clientId: 'client-2',
                emit: mockEmit,
            });

            factory.destroyByClientId('client-1');

            expect(factory.get('room-1')).toBeNull();
            expect(factory.get('room-2')).toBeNull();
            // client-2's FSM should still exist
            expect(factory.get('room-3')).not.toBeNull();
        });

        it('aborts active sessions', () => {
            const sm = factory.create({
                roomId: 'room-1',
                clientId: 'client-1',
                emit: mockEmit,
            });

            // Simulate active state
            sm.state = RoomState.Processing;

            factory.destroyByClientId('client-1');

            expect(sm.abortController.signal.aborted).toBe(true);
        });

        it('does not throw when client has no FSMs', () => {
            expect(() => {
                factory.destroyByClientId('nonexistent-client');
            }).not.toThrow();
        });

        it('cleans up the byClientId map entry', () => {
            factory.create({
                roomId: 'room-1',
                clientId: 'client-1',
                emit: mockEmit,
            });

            factory.destroyByClientId('client-1');

            // After cleanup, creating a new FSM for the same client should work fresh
            const sm = factory.create({
                roomId: 'room-4',
                clientId: 'client-1',
                emit: mockEmit,
            });

            expect(sm).not.toBeNull();
            expect(factory.get('room-4')).not.toBeNull();
        });
    });
});
