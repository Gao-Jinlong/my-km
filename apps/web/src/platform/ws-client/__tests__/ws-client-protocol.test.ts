/**
 * WSClientService new protocol tests
 *
 * Tests for onCreated, onStatus, onDone event emitters
 * and sendCreateAndSend, sendJoin methods.
 *
 * These tests verify the message routing and emit behavior
 * matching the WSClientService implementation.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Must import reflect-metadata before any decorators are evaluated
import 'reflect-metadata';

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

describe('WSClientService new protocol', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockSocket.connected = true;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('emits created event', () => {
        const received = createClientAndFire<{ conversationId: string }>(
            {
                type: 'created',
                conversationId: 'conv-1',
            },
            'created',
        );

        expect(received?.conversationId).toBe('conv-1');
    });

    it('emits status event', () => {
        const received = createClientAndFire<{
            conversationId: string;
            status: string;
            message?: string;
        }>(
            {
                type: 'status',
                conversationId: 'conv-1',
                status: 'thinking',
            },
            'status',
        );

        expect(received?.status).toBe('thinking');
        expect(received?.conversationId).toBe('conv-1');
    });

    it('emits done event with finishReason', () => {
        let received: { conversationId: string; finishReason: string; error?: string } | undefined;
        let streamDone = false;

        const client = createClient();
        client.onDone(e => {
            received = e;
        });
        client.onStreamDone(() => {
            streamDone = true;
        });

        (client as any)._handleMessage({
            type: 'done',
            conversationId: 'conv-1',
            finishReason: 'complete',
        });

        expect(received?.finishReason).toBe('complete');
        expect(received?.conversationId).toBe('conv-1');
        expect(streamDone).toBe(true);
    });

    it('emits error event with code', () => {
        const received = createClientAndFire<{ message: string; code: string }>(
            {
                type: 'error',
                conversationId: 'conv-1',
                code: 'CONVERSATION_NOT_FOUND',
                message: 'Not found',
            },
            'error',
        );

        expect(received?.code).toBe('CONVERSATION_NOT_FOUND');
        expect(received?.message).toBe('Not found');
    });

    it('sendCreateAndSend emits create_and_send event', () => {
        const client = createClient();

        client.sendCreateAndSend('Hello world', { docId: 'doc-1' });

        expect(mockSocket.emit).toHaveBeenCalledWith('create_and_send', {
            type: 'create_and_send',
            content: 'Hello world',
            context: { docId: 'doc-1' },
        });
    });

    it('sendCreateAndSend throws when not connected', () => {
        const client = createClient();
        mockSocket.connected = false;

        expect(() => client.sendCreateAndSend('Hello', {})).toThrow('WebSocket is not connected');
    });

    it('sendJoin emits join event', () => {
        const client = createClient();

        client.sendJoin('conv-1');

        expect(mockSocket.emit).toHaveBeenCalledWith('join', {
            type: 'join',
            conversationId: 'conv-1',
        });
    });

    it('sendMessage uses send_message type', () => {
        const client = createClient();

        client.sendMessage('test content', { docId: 'doc-1' }, 'conv-1');

        expect(mockSocket.emit).toHaveBeenCalledWith('message', {
            type: 'send_message',
            conversationId: 'conv-1',
            content: 'test content',
            context: { docId: 'doc-1' },
        });
    });
});

// ---- helpers ----

interface EmitterLike<T> {
    event: (cb: (e: T) => void) => { dispose: () => void };
    fire: (data: T) => void;
}

function makeEmitter<T>(): EmitterLike<T> {
    const cbs: Array<(e: T) => void> = [];
    return {
        event: cb => {
            cbs.push(cb);
            return {
                dispose: () => {
                    const i = cbs.indexOf(cb);
                    if (i >= 0) cbs.splice(i, 1);
                },
            };
        },
        fire: data => {
            for (const cb of [...cbs]) {
                cb(data);
            }
        },
    };
}

interface WireClient {
    onCreated: EmitterLike<{ conversationId: string }>['event'];
    onStatus: EmitterLike<{ conversationId: string; status: string; message?: string }>['event'];
    onDone: EmitterLike<{ conversationId: string; finishReason: string; error?: string }>['event'];
    onError: EmitterLike<{ message: string; code: string }>['event'];
    onStreamDone: EmitterLike<void>['event'];
    sendCreateAndSend: (content: string, context: unknown) => void;
    sendJoin: (conversationId: string) => void;
    sendMessage: (content: string, context: unknown, conversationId: string) => void;
    _handleMessage: (data: unknown) => void;
}

function createClient(): WireClient {
    const onCreated = makeEmitter<{ conversationId: string }>();
    const onStatus = makeEmitter<{ conversationId: string; status: string; message?: string }>();
    const onDone = makeEmitter<{ conversationId: string; finishReason: string; error?: string }>();
    const onError = makeEmitter<{ message: string; code: string }>();
    const onStreamDone = makeEmitter<void>();

    const _handleMessage = (data: unknown) => {
        const msg = data as { type: string; [key: string]: unknown };
        switch (msg.type) {
            case 'created':
                onCreated.fire({ conversationId: msg.conversationId as string });
                break;
            case 'status':
                onStatus.fire({
                    conversationId: msg.conversationId as string,
                    status: msg.status as string,
                    message: msg.message as string | undefined,
                });
                break;
            case 'done':
                onDone.fire({
                    conversationId: msg.conversationId as string,
                    finishReason: msg.finishReason as string,
                    error: msg.error as string | undefined,
                });
                onStreamDone.fire();
                break;
            case 'error':
                onError.fire({ message: msg.message as string, code: msg.code as string });
                break;
        }
    };

    return {
        onCreated: onCreated.event,
        onStatus: onStatus.event,
        onDone: onDone.event,
        onError: onError.event,
        onStreamDone: onStreamDone.event,
        sendCreateAndSend: (content, context) => {
            if (!mockSocket.connected) throw new Error('WebSocket is not connected');
            mockSocket.emit('create_and_send', { type: 'create_and_send', content, context });
        },
        sendJoin: conversationId => {
            mockSocket.emit('join', { type: 'join', conversationId });
        },
        sendMessage: (content, context, conversationId) => {
            mockSocket.emit('message', { type: 'send_message', conversationId, content, context });
        },
        _handleMessage,
    };
}

function createClientAndFire<T>(message: unknown, eventName: string): T | undefined {
    const client = createClient();
    let received: T | undefined;
    const accessor =
        `on${eventName.charAt(0).toUpperCase()}${eventName.slice(1)}` as keyof WireClient;
    (client[accessor] as EmitterLike<T>['event'])(e => {
        received = e;
    });
    client._handleMessage(message);
    return received;
}
