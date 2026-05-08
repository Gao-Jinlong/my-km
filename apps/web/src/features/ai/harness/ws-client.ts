/**
 * WSClient — AI WebSocket 连接管理子模块
 *
 * 使用 socket.io-client 与服务端通信。
 * 通过 Emitter 向 Harness 发事件，不直接调用其他子模块。
 */

import { io, type Socket } from 'socket.io-client';
import { Emitter, type Event } from '@/base/common/event';
import { Disposable } from '@/base/common/lifecycle';
import type { ServerMessage } from '../types/ai.types';

/**
 * WSClient 接口
 */
export interface WSClient {
    connect(url: string): Promise<void>;
    disconnect(): void;
    send(message: object): void;
    joinConversation(conversationId: string): void;
    sendMessage(content: string, context: unknown, conversationId: string): void;
    sendToolResult(
        conversationId: string,
        toolCallId: string,
        result: unknown,
        error?: string,
    ): void;
    stopGenerating(conversationId: string): void;
    get isConnected(): boolean;
    get onConnectionChange(): Event<{ connected: boolean }>;
    get onStreamChunk(): Event<{ content: string }>;
    get onToolCall(): Event<{ id: string; name: string; args: object }>;
    get onStreamDone(): Event<void>;
    get onError(): Event<{ message: string; code: string }>;
    get onHistory(): Event<{ messages: unknown[] }>;
    get onToolTimeout(): Event<{ toolCallId: string; message: string }>;
    dispose(): void;
}

class WSClientImpl extends Disposable implements WSClient {
    private _socket: Socket | null = null;

    // 事件发射器
    private _onStreamChunk = new Emitter<{ content: string }>();
    private _onToolCall = new Emitter<{ id: string; name: string; args: object }>();
    private _onStreamDone = new Emitter<void>();
    private _onError = new Emitter<{ message: string; code: string }>();
    private _onHistory = new Emitter<{ messages: unknown[] }>();
    private _onToolTimeout = new Emitter<{ toolCallId: string; message: string }>();
    private _onConnectionChange = new Emitter<{ connected: boolean }>();

    get isConnected(): boolean {
        return this._socket?.connected ?? false;
    }

    async connect(url: string): Promise<void> {
        return new Promise((resolve, reject) => {
            try {
                console.log(`[AI WS] Connecting to ${url}...`);
                this._socket = io(url, {
                    autoConnect: true,
                    reconnection: true,
                    reconnectionDelay: 3000,
                    transports: ['websocket'],
                });

                this._socket.on('connect', () => {
                    console.log(`[AI WS] Connected, socket id: ${this._socket?.id}`);
                    this._onConnectionChange.fire({ connected: true });
                    resolve();
                });

                this._socket.on('connect_error', err => {
                    console.error(`[AI WS] Connect error: ${err.message}`);
                    this._onError.fire({ message: 'WebSocket connection error', code: 'WS_ERROR' });
                    reject(new Error('WebSocket connection error'));
                });

                this._socket.on('disconnect', reason => {
                    console.log(`[AI WS] Disconnected, reason: ${reason}`);
                    this._onConnectionChange.fire({ connected: false });
                });

                this._socket.on('reconnect', attempt => {
                    console.log(`[AI WS] Reconnected after ${attempt} attempts`);
                });

                this._socket.on('reconnect_error', err => {
                    console.error(`[AI WS] Reconnect error: ${err.message}`);
                });

                this._socket.on('error', err => {
                    console.error(`[AI WS] Error: ${err}`);
                });

                this._socket.on('message', (data: unknown) => {
                    this._handleMessage(data);
                });
            } catch (error) {
                console.error(`[AI WS] Connect exception:`, error);
                reject(error);
            }
        });
    }

    disconnect(): void {
        this._socket?.disconnect();
        this._socket = null;
    }

    send(message: object): void {
        if (!this._socket || !this._socket.connected) {
            throw new Error('WebSocket is not connected');
        }
        this._socket.emit('message', message);
    }

    joinConversation(conversationId: string): void {
        console.log(`[AI WS] Joining conversation: ${conversationId}`);
        this._socket?.emit('join', { type: 'join', conversationId });
    }

    sendMessage(content: string, context: unknown, conversationId: string): void {
        console.log(`[AI WS] Sending message, length: ${content.length}`);
        this._socket?.emit('message', { type: 'message', conversationId, content, context });
    }

    sendToolResult(
        conversationId: string,
        toolCallId: string,
        result: unknown,
        error?: string,
    ): void {
        console.log(`[AI WS] Sending tool result: ${toolCallId}`);
        this._socket?.emit('tool_result', {
            type: 'tool_result',
            conversationId,
            toolCallId,
            result,
            error,
        });
    }

    stopGenerating(conversationId: string): void {
        console.log(`[AI WS] Stop generating`);
        this._socket?.emit('stop', { type: 'stop', conversationId });
    }

    // 事件访问器
    get onConnectionChange(): Event<{ connected: boolean }> {
        return this._onConnectionChange.event;
    }
    get onStreamChunk(): Event<{ content: string }> {
        return this._onStreamChunk.event;
    }
    get onToolCall(): Event<{ id: string; name: string; args: object }> {
        return this._onToolCall.event;
    }
    get onStreamDone(): Event<void> {
        return this._onStreamDone.event;
    }
    get onError(): Event<{ message: string; code: string }> {
        return this._onError.event;
    }
    get onHistory(): Event<{ messages: unknown[] }> {
        return this._onHistory.event;
    }
    get onToolTimeout(): Event<{ toolCallId: string; message: string }> {
        return this._onToolTimeout.event;
    }

    private _handleMessage(data: unknown): void {
        try {
            const msg = data as ServerMessage;
            switch (msg.type) {
                case 'stream_chunk':
                    this._onStreamChunk.fire({ content: msg.content });
                    break;
                case 'tool_call':
                    this._onToolCall.fire({ id: msg.id, name: msg.name, args: msg.arguments });
                    break;
                case 'stream_done':
                    this._onStreamDone.fire();
                    break;
                case 'error':
                    this._onError.fire({ message: msg.message, code: msg.code });
                    this._onStreamDone.fire();
                    break;
                case 'history':
                    this._onHistory.fire({ messages: msg.messages });
                    break;
                case 'tool_timeout':
                    this._onToolTimeout.fire({ toolCallId: msg.toolCallId, message: msg.message });
                    break;
                case 'joined':
                    break;
            }
        } catch (error) {
            console.error('Failed to parse WebSocket message:', error);
        }
    }

    override dispose(): void {
        this.disconnect();
        this._onStreamChunk.dispose();
        this._onToolCall.dispose();
        this._onStreamDone.dispose();
        this._onError.dispose();
        this._onHistory.dispose();
        this._onToolTimeout.dispose();
        this._onConnectionChange.dispose();
        super.dispose();
    }
}

export function createWSClient(): WSClient {
    return new WSClientImpl();
}
