import { SocketRegistry } from '../../../ws/socket-registry';

describe('SocketRegistry', () => {
    let registry: SocketRegistry;
    let mockSocket: { emit: jest.Mock; id: string };

    beforeEach(() => {
        registry = new SocketRegistry();
        mockSocket = { emit: jest.fn(), id: 'sock-1' };
    });

    it('registers and retrieves a socket', () => {
        registry.register('client-1', mockSocket as any);
        expect(registry.getSocket('client-1')).toBe(mockSocket);
    });

    it('returns null for unregistered client', () => {
        expect(registry.getSocket('nope')).toBeNull();
    });

    it('unregisters a socket', () => {
        registry.register('client-1', mockSocket as any);
        registry.unregister('client-1');
        expect(registry.getSocket('client-1')).toBeNull();
    });

    it('emits to a specific client', () => {
        registry.register('client-1', mockSocket as any);
        registry.emitToClient('client-1', 'event', { data: true });
        expect(mockSocket.emit).toHaveBeenCalledWith('event', { data: true });
    });

    it('no-ops emit to unregistered client', () => {
        expect(() => registry.emitToClient('nope', 'event', {})).not.toThrow();
    });

    it('checks if client is online', () => {
        registry.register('client-1', mockSocket as any);
        expect(registry.isOnline('client-1')).toBe(true);
        expect(registry.isOnline('nope')).toBe(false);
    });
});
