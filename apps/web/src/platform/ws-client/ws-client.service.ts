/**
 * WSClientService — AI WebSocket 连接管理 Service
 *
 * 使用 socket.io-client 与服务端通信。
 * 通过 acquire()/release() 引用计数自动管理连接生命周期。
 * 当引用计数归零时，启动 idle timer 后自动断开连接。
 */

import { io, type Socket } from 'socket.io-client';
import { Emitter, type Event } from '@/base/common/event';
import type { ServerMessage } from '@/features/ai/types/ai.types';
import { ServiceBase } from '@/platform/base/service-base';
import { Service } from '@/platform/di';

/**
 * WSClientService — 全局单例 WebSocket 连接管理
 *
 * 引用计数机制：
 * - acquire(): refCount++，首次引用时自动连接
 * - release(): refCount--，归零时启动 30s idle timer 后断开
 */
@Service({ singleton: true })
export class WSClientService extends ServiceBase {
    private _socket: Socket | null = null;
    private _idleTimer: ReturnType<typeof setTimeout> | null = null;
    private readonly _IDLE_TIMEOUT_MS = 30_000;
    private readonly _url: string;
    private _refCount = 0;

    // 事件发射器
    private _onStreamChunk = new Emitter<{ content: string }>();
    private _onToolCall = new Emitter<{ id: string; name: string; args: object }>();
    private _onStreamDone = new Emitter<void>();
    private _onError = new Emitter<{ message: string; code: string }>();
    private _onHistory = new Emitter<{ messages: unknown[] }>();
    private _onToolTimeout = new Emitter<{ toolCallId: string; message: string }>();
    private _onConnectionChange = new Emitter<{ connected: boolean }>();
    private _onCreated = new Emitter<{ conversationId: string }>();
    private _onStatus = new Emitter<{ conversationId: string; status: string; message?: string }>();
    private _onDone = new Emitter<{
        conversationId: string;
        finishReason: string;
        error?: string;
    }>();

    constructor(url: string) {
        super();
        this._url = url;
    }

    get refCount(): number {
        return this._refCount;
    }

    get isConnected(): boolean {
        return this._socket?.connected ?? false;
    }

    /**
     * 增加引用计数。首次引用时自动建立连接。
     */
    acquire(): void {
        this._refCount++;
        if (this._refCount === 1) {
            this._connect();
        }
    }

    /**
     * 减少引用计数。归零时启动 idle timer 后自动断开连接。
     */
    release(): void {
        if (this._refCount <= 0) return;
        this._refCount--;
        if (this._refCount === 0) {
            this.startIdleTimer(() => this._disconnect());
        }
    }

    /**
     * 确保已连接。如果已连接则清除 idle timer，否则建立连接。
     */
    async ensureConnected(): Promise<void> {
        if (this.isConnected) {
            this.stopIdleTimer();
            return;
        }
        await this._connect();
    }

    /**
     * 建立 WebSocket 连接
     */
    private _connect(): Promise<void> {
        if (this._socket?.connected) return Promise.resolve();

        return new Promise((resolve, reject) => {
            try {
                console.log(`[AI WS] Connecting to ${this._url}...`);
                this._socket = io(this._url, {
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

    /**
     * 断开 WebSocket 连接
     */
    private _disconnect(): void {
        this.stopIdleTimer();
        this._socket?.disconnect();
        this._socket = null;
    }

    /**
     * 发送原始消息
     */
    send(message: object): void {
        if (!this._socket || !this._socket.connected) {
            throw new Error('WebSocket is not connected');
        }
        this._socket.emit('message', message);
    }

    /**
     * 加入对话房间
     */
    joinConversation(conversationId: string): void {
        console.log(`[AI WS] Joining conversation: ${conversationId}`);
        this._socket?.emit('join', { type: 'join', conversationId });
    }

    /**
     * 创建新对话并发送消息
     */
    sendCreateAndSend(content: string, context: unknown): void {
        if (!this._socket || !this._socket.connected) {
            throw new Error('WebSocket is not connected');
        }
        this._socket.emit('create_and_send', { type: 'create_and_send', content, context });
    }

    /**
     * 加入对话房间（别名方法，与 joinConversation 行为一致）
     */
    sendJoin(conversationId: string): void {
        this._socket?.emit('join', { type: 'join', conversationId });
    }

    /**
     * 发送用户消息
     */
    sendMessage(content: string, context: unknown, conversationId: string): void {
        console.log(`[AI WS] Sending message, length: ${content.length}`);
        this._socket?.emit('message', { type: 'send_message', conversationId, content, context });
    }

    /**
     * 发送工具执行结果
     */
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

    /**
     * 停止 AI 生成
     */
    stopGenerating(conversationId: string): void {
        console.log(`[AI WS] Stop generating`);
        this._socket?.emit('stop', { type: 'stop', conversationId });
    }

    /**
     * 启动 idle timer，超时后执行回调
     */
    startIdleTimer(onIdle: () => void): void {
        this.stopIdleTimer();
        this._idleTimer = setTimeout(onIdle, this._IDLE_TIMEOUT_MS);
    }

    /**
     * 停止 idle timer
     */
    stopIdleTimer(): void {
        if (this._idleTimer) {
            clearTimeout(this._idleTimer);
            this._idleTimer = null;
        }
    }

    // ===== 事件访问器 =====

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
    get onCreated(): Event<{ conversationId: string }> {
        return this._onCreated.event;
    }
    get onStatus(): Event<{ conversationId: string; status: string; message?: string }> {
        return this._onStatus.event;
    }
    get onDone(): Event<{ conversationId: string; finishReason: string; error?: string }> {
        return this._onDone.event;
    }

    // ===== 内部方法 =====

    private _handleMessage(data: unknown): void {
        try {
            const msg = data as ServerMessage;
            switch (msg.type) {
                case 'created':
                    this._onCreated.fire({ conversationId: msg.conversationId });
                    break;
                case 'history':
                    this._onHistory.fire({ messages: msg.messages });
                    break;
                case 'text_chunk':
                    this._onStreamChunk.fire({ content: msg.content });
                    break;
                case 'tool_call':
                    this._onToolCall.fire({
                        id: msg.toolCallId,
                        name: msg.toolName,
                        args: msg.input as object,
                    });
                    break;
                case 'status':
                    this._onStatus.fire({
                        conversationId: msg.conversationId,
                        status: msg.status,
                        message: msg.message,
                    });
                    break;
                case 'done':
                    this._onDone.fire({
                        conversationId: msg.conversationId,
                        finishReason: msg.finishReason,
                        error: msg.error,
                    });
                    this._onStreamDone.fire();
                    break;
                case 'error':
                    this._onError.fire({ message: msg.message, code: msg.code });
                    break;
                // Legacy events
                case 'joined':
                    break;
                case 'tool_timeout':
                    this._onToolTimeout.fire({
                        toolCallId: (msg as any).toolCallId,
                        message: (msg as any).message,
                    });
                    break;
                case 'stream_chunk':
                    this._onStreamChunk.fire({ content: (msg as any).content });
                    break;
                case 'stream_done':
                    this._onStreamDone.fire();
                    break;
            }
        } catch (error) {
            console.error('Failed to parse WebSocket message:', error);
        }
    }

    override dispose(): void {
        // 释放所有引用，触发 idle disconnect
        while (this._refCount > 0) {
            this.release();
        }
        this.stopIdleTimer();
        this._onStreamChunk.dispose();
        this._onToolCall.dispose();
        this._onStreamDone.dispose();
        this._onError.dispose();
        this._onHistory.dispose();
        this._onToolTimeout.dispose();
        this._onConnectionChange.dispose();
        this._onCreated.dispose();
        this._onStatus.dispose();
        this._onDone.dispose();
        super.dispose();
    }
}

/**
 * 工厂函数 — 用于 bootstrap.ts 中手动创建并 registerInstance
 */
export function createWSClientService(url: string): WSClientService {
    return new WSClientService(url);
}
