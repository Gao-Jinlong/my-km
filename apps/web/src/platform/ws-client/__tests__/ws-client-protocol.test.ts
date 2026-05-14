/**
 * WSClientService subscribe() and message routing tests
 *
 * Tests for subscribe(messageType, cb), dynamic dispatch,
 * and connection lifecycle management.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Must import reflect-metadata before any decorators are evaluated
import 'reflect-metadata';

import type { IDisposable } from '@/base/common/lifecycle';
import { WSClientService } from '@/platform/ws-client';

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

interface TestableWSClient {
    subscribe(messageType: string, callback: (data: unknown) => void): IDisposable;
    sendCreateAndSend(content: string, context: unknown): void;
    sendJoin(conversationId: string): void;
    sendMessage(content: string, context: unknown, conversationId: string): void;
    dispose(): void;
    _dispatchMessage(data: unknown): void;
}

describe('WSClientService subscribe and routing', () => {
    let client: TestableWSClient;

    beforeEach(() => {
        vi.useFakeTimers();
        vi.clearAllMocks();
        mockSocket.connected = true;
        client = new WSClientService('http://localhost:3001/ai') as unknown as TestableWSClient;
    });

    afterEach(() => {
        vi.useRealTimers();
        client.dispose();
    });

    describe('subscribe routing', () => {
        it('routes created message to subscribers', () => {
            const received: unknown[] = [];
            client.subscribe('created', data => received.push(data));

            client._dispatchMessage({ type: 'created', conversationId: 'conv-1' });

            expect(received).toHaveLength(1);
            expect((received[0] as { conversationId: string }).conversationId).toBe('conv-1');
        });

        it('routes status message to subscribers', () => {
            const received: unknown[] = [];
            client.subscribe('status', data => received.push(data));

            client._dispatchMessage({
                type: 'status',
                conversationId: 'conv-1',
                status: 'thinking',
            });

            expect(received).toHaveLength(1);
            expect((received[0] as { status: string }).status).toBe('thinking');
        });

        it('routes done message to subscribers', () => {
            const received: unknown[] = [];
            client.subscribe('done', data => received.push(data));

            client._dispatchMessage({
                type: 'done',
                conversationId: 'conv-1',
                finishReason: 'complete',
            });

            expect(received).toHaveLength(1);
            expect((received[0] as { finishReason: string }).finishReason).toBe('complete');
        });

        it('routes error message to subscribers', () => {
            const received: unknown[] = [];
            client.subscribe('error', data => received.push(data));

            client._dispatchMessage({
                type: 'error',
                conversationId: 'conv-1',
                code: 'CONVERSATION_NOT_FOUND',
                message: 'Not found',
            });

            expect(received).toHaveLength(1);
            expect((received[0] as { code: string }).code).toBe('CONVERSATION_NOT_FOUND');
        });

        it('routes text_chunk to subscribers', () => {
            const received: unknown[] = [];
            client.subscribe('text_chunk', data => received.push(data));

            client._dispatchMessage({
                type: 'text_chunk',
                conversationId: 'conv-1',
                content: 'Hello world',
            });

            expect(received).toHaveLength(1);
            expect((received[0] as { content: string }).content).toBe('Hello world');
        });

        it('supports multiple subscribers for same message type', () => {
            const received1: unknown[] = [];
            const received2: unknown[] = [];
            client.subscribe('done', data => received1.push(data));
            client.subscribe('done', data => received2.push(data));

            client._dispatchMessage({
                type: 'done',
                conversationId: 'conv-1',
                finishReason: 'stop',
            });

            expect(received1).toHaveLength(1);
            expect(received2).toHaveLength(1);
        });

        it('unsubscribe removes callback', () => {
            const received: unknown[] = [];
            const unsub = client.subscribe('done', data => received.push(data));

            client._dispatchMessage({ type: 'done', conversationId: '1', finishReason: 'a' });
            expect(received).toHaveLength(1);

            unsub.dispose();

            client._dispatchMessage({ type: 'done', conversationId: '2', finishReason: 'b' });
            expect(received).toHaveLength(1); // still 1
        });

        it('ignores messages with no subscribers', () => {
            // Should not throw even with no subscribers
            expect(() => {
                client._dispatchMessage({ type: 'unknown_type', foo: 'bar' });
            }).not.toThrow();
        });
    });

    describe('send methods', () => {
        it('sendCreateAndSend emits create_and_send event', () => {
            // Need to subscribe first to establish connection
            const unsub = client.subscribe('done', () => {});
            client.sendCreateAndSend('Hello world', { docId: 'doc-1' });

            expect(mockSocket.emit).toHaveBeenCalledWith('create_and_send', {
                type: 'create_and_send',
                content: 'Hello world',
                context: { docId: 'doc-1' },
            });
            unsub.dispose();
        });

        it('sendCreateAndSend throws when not connected', () => {
            mockSocket.connected = false;

            expect(() => client.sendCreateAndSend('Hello', {})).toThrow(
                'WebSocket is not connected',
            );
        });

        it('sendJoin emits join event', () => {
            // Need to subscribe first to establish connection
            const unsub = client.subscribe('done', () => {});
            client.sendJoin('conv-1');

            expect(mockSocket.emit).toHaveBeenCalledWith('join', {
                type: 'join',
                conversationId: 'conv-1',
            });
            unsub.dispose();
        });

        it('sendMessage uses send_message type', () => {
            // Need to subscribe first to establish connection
            const unsub = client.subscribe('done', () => {});
            client.sendMessage('test content', { docId: 'doc-1' }, 'conv-1');

            expect(mockSocket.emit).toHaveBeenCalledWith('message', {
                type: 'send_message',
                conversationId: 'conv-1',
                content: 'test content',
                context: { docId: 'doc-1' },
            });
            unsub.dispose();
        });
    });

    describe('connection lifecycle', () => {
        it('connects on first subscribe', () => {
            mockSocket.connected = false;

            client.subscribe('done', () => {});

            expect(mockSocket.on).toHaveBeenCalledWith('connect', expect.any(Function));
        });

        it('starts idle timer when last subscription is disposed', () => {
            const unsub1 = client.subscribe('done', () => {});
            const unsub2 = client.subscribe('text_chunk', () => {});

            unsub1.dispose();
            vi.advanceTimersByTime(30000);
            expect(mockSocket.disconnect).not.toHaveBeenCalled();

            unsub2.dispose();
            vi.advanceTimersByTime(29999);
            expect(mockSocket.disconnect).not.toHaveBeenCalled();

            vi.advanceTimersByTime(1);
            expect(mockSocket.disconnect).toHaveBeenCalled();
        });

        it('cancels idle timer on new subscription', () => {
            const unsub = client.subscribe('done', () => {});
            unsub.dispose();

            vi.advanceTimersByTime(15000);

            // New subscription before timeout
            const unsub2 = client.subscribe('text_chunk', () => {});

            vi.advanceTimersByTime(30000);
            expect(mockSocket.disconnect).not.toHaveBeenCalled();

            unsub2.dispose();
        });
    });
});
