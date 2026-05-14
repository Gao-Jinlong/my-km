/**
 * WSClientService — AI WebSocket 连接管理 Service
 *
 * 使用 socket.io-client 与服务端通信。
 * WSClient 只负责通信层面，不关心任何业务消息类型。
 * 消费者通过 subscribe(messageType, cb) 声明自己关注哪些消息。
 *
 * 连接生命周期自动管理：
 * - 首次订阅时自动建立连接
 * - 最后一个订阅 dispose 后启动 30s idle timer 断开连接
 */

import { io, type Socket } from 'socket.io-client';
import { Emitter, type Event } from '@/base/common/event';
import { DisposableStore, type IDisposable, toDisposable } from '@/base/common/lifecycle';
import { ServiceBase } from '@/platform/base/service-base';
import { Service } from '@/platform/di';

@Service({ singleton: true })
export class WSClientService extends ServiceBase {
    private _socket: Socket | null = null;
    private _idleTimer: ReturnType<typeof setTimeout> | null = null;
    private readonly _IDLE_TIMEOUT_MS = 30_000;
    private readonly _url: string;
    private _subscriptionCount = 0;
    private readonly _subscriptions = new DisposableStore();
    private readonly _msgSubscribers = new Map<string, Set<(data: unknown) => void>>();

    // 连接级事件（不属于任何业务消息类型）
    private readonly _onConnectionChange = new Emitter<{ connected: boolean }>();

    constructor(url: string) {
        super();
        this._url = url;
    }

    get isConnected(): boolean {
        return this._socket?.connected ?? false;
    }

    get onConnectionChange(): Event<{ connected: boolean }> {
        return cb => this._registerSubscription(this._onConnectionChange.event(cb));
    }

    /**
     * 订阅指定 message type 的服务端消息。
     * 首次调用时自动建立 WebSocket 连接。
     */
    subscribe(messageType: string, callback: (data: unknown) => void): IDisposable {
        const subs = this._msgSubscribers.get(messageType) ?? new Set<(data: unknown) => void>();
        subs.add(callback);
        if (!this._msgSubscribers.has(messageType)) {
            this._msgSubscribers.set(messageType, subs);
        }

        const wrapped: IDisposable = {
            dispose: () => {
                const s = this._msgSubscribers.get(messageType);
                if (s) {
                    s.delete(callback);
                    if (s.size === 0) this._msgSubscribers.delete(messageType);
                }
            },
        };
        return this._registerSubscription(wrapped);
    }

    /**
     * 注册订阅并自动管理连接生命周期。
     */
    private _registerSubscription(d: IDisposable): IDisposable {
        this._subscriptionCount++;
        if (this._subscriptionCount === 1) {
            this._ensureConnected();
        }
        this._subscriptions.add(d);

        return toDisposable(() => {
            d.dispose();
            this._subscriptionCount--;
            this._stopIdleTimer();
            if (this._subscriptionCount === 0) {
                this._startIdleTimer();
            }
        });
    }

    /**
     * 确保已连接。如果已连接则清除 idle timer，否则建立连接。
     */
    private _ensureConnected(): void {
        if (this.isConnected) {
            this._stopIdleTimer();
            return;
        }
        this._connect();
    }

    /**
     * 建立 WebSocket 连接
     */
    private _connect(): void {
        if (this._socket?.connected) return;

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
        });

        this._socket.on('connect_error', err => {
            console.error(`[AI WS] Connect error: ${err.message}`);
            this._onConnectionChange.fire({ connected: false });
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
            this._dispatchMessage(data);
        });
    }

    /**
     * 按 message.type 动态派发消息到订阅者
     */
    private _dispatchMessage(data: unknown): void {
        try {
            const msg = data as { type: string };
            const subs = this._msgSubscribers.get(msg.type);
            if (!subs) return;
            for (const cb of subs) {
                cb(data);
            }
        } catch (error) {
            console.error('Failed to dispatch WebSocket message:', error);
        }
    }

    /**
     * 断开 WebSocket 连接
     */
    private _disconnect(): void {
        this._stopIdleTimer();
        this._socket?.disconnect();
        this._socket = null;
    }

    /**
     * 启动 idle timer，超时后断开连接
     */
    private _startIdleTimer(): void {
        this._stopIdleTimer();
        this._idleTimer = setTimeout(() => this._disconnect(), this._IDLE_TIMEOUT_MS);
    }

    /**
     * 停止 idle timer
     */
    private _stopIdleTimer(): void {
        if (this._idleTimer) {
            clearTimeout(this._idleTimer);
            this._idleTimer = null;
        }
    }

    // ===== 发送消息方法 =====

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

    override dispose(): void {
        this._stopIdleTimer();
        this._subscriptions.dispose();
        this._msgSubscribers.clear();
        this._socket?.disconnect();
        this._socket = null;
        this._onConnectionChange.dispose();
        super.dispose();
    }
}

/**
 * 工厂函数 — 用于 bootstrap.ts 中手动创建并 registerInstance
 */
export function createWSClientService(url: string): WSClientService {
    return new WSClientService(url);
}
