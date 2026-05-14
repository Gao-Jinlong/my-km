/**
 * WSClient subscription-based connection lifecycle tests
 *
 * Tests for the Disposable pattern:
 * - First subscription triggers auto-connect
 * - Last subscription dispose starts idle timer
 * - Idle timeout disconnects
 * - New subscription reconnects
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock socket.io-client
const mockSocket = {
    connected: true,
    id: 'mock-socket-id',
    on: vi.fn(),
    emit: vi.fn(),
    disconnect: vi.fn(),
};

vi.mock('socket.io-client', () => ({
    io: vi.fn(() => mockSocket),
}));

// Must import reflect-metadata before any decorators
import 'reflect-metadata';

// Import after mocks
import { WSClientService } from '@/platform/ws-client';

describe('WSClient subscription lifecycle', () => {
    let client: WSClientService;

    beforeEach(() => {
        vi.useFakeTimers();
        vi.clearAllMocks();
        mockSocket.connected = true;
        client = new WSClientService('http://localhost:3001/ai');
    });

    afterEach(() => {
        vi.useRealTimers();
        client.dispose();
    });

    describe('auto-connect on first subscription', () => {
        it('connects when first subscription is added', () => {
            // Initially not connected (mock socket.io-client returns unconnected)
            mockSocket.connected = false;

            const unsub = client.subscribe('text_chunk', () => {});

            // Connection should be established
            expect(mockSocket.on).toHaveBeenCalledWith('connect', expect.any(Function));
            unsub.dispose();
        });
    });

    describe('idle timer', () => {
        it('starts idle timer when last subscription is disposed', () => {
            const unsub1 = client.subscribe('text_chunk', () => {});
            const unsub2 = client.subscribe('done', () => {});

            unsub1.dispose();
            // Still one subscription, no idle timer
            vi.advanceTimersByTime(30000);
            expect(mockSocket.disconnect).not.toHaveBeenCalled();

            unsub2.dispose();
            // Now zero subscriptions, idle timer starts
            vi.advanceTimersByTime(29999);
            expect(mockSocket.disconnect).not.toHaveBeenCalled();

            vi.advanceTimersByTime(1);
            expect(mockSocket.disconnect).toHaveBeenCalled();
        });

        it('cancels idle timer when new subscription arrives', () => {
            const unsub = client.subscribe('text_chunk', () => {});
            unsub.dispose();

            // Start advancing idle timer
            vi.advanceTimersByTime(15000);

            // New subscription arrives before timeout
            const unsub2 = client.subscribe('done', () => {});

            // Complete the idle timer period
            vi.advanceTimersByTime(30000);
            expect(mockSocket.disconnect).not.toHaveBeenCalled();

            unsub2.dispose();
        });
    });

    describe('dispose cleanup', () => {
        it('cleans up all subscriptions and disconnects', () => {
            const unsub = client.subscribe('text_chunk', () => {});

            client.dispose();

            expect(mockSocket.disconnect).toHaveBeenCalled();
            // Double dispose should not throw
            expect(() => client.dispose()).not.toThrow();

            unsub.dispose();
        });
    });
});
