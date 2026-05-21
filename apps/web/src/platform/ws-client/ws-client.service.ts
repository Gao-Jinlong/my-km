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
    private readonly _socketListeners = new Map<string, (data: unknown) => void>();

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
        const isFirstForType = !this._msgSubscribers.has(messageType);
        const subs = this._msgSubscribers.get(messageType) ?? new Set<(data: unknown) => void>();
        subs.add(callback);
        if (isFirstForType) {
            this._msgSubscribers.set(messageType, subs);
        }

        // 首次订阅某个消息类型时，在 socket 上注册对应的事件监听
        if (isFirstForType && this._socket) {
            this._registerSocketListener(messageType);
        }

        const wrapped: IDisposable = {
            dispose: () => {
                const s = this._msgSubscribers.get(messageType);
                if (s) {
                    s.delete(callback);
                    if (s.size === 0) {
                        this._msgSubscribers.delete(messageType);
                        this._unregisterSocketListener(messageType);
                    }
                }
            },
        };
        return this._registerSubscription(wrapped);
    }

    /**
     * 在 socket 上注册事件监听，将数据分发给订阅者。
     */
    private _registerSocketListener(eventType: string): void {
        if (!this._socket) return;
        const handler = (data: unknown) => {
            const subs = this._msgSubscribers.get(eventType);
            if (!subs) return;
            for (const cb of subs) {
                cb(data);
            }
        };
        this._socketListeners.set(eventType, handler);
        this._socket.on(eventType, handler);
    }

    /**
     * 注销 socket 上的事件监听。
     */
    private _unregisterSocketListener(eventType: string): void {
        const handler = this._socketListeners.get(eventType);
        if (handler && this._socket) {
            this._socket.off(eventType, handler);
        }
        this._socketListeners.delete(eventType);
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
            // 连接成功后，为已订阅的消息类型注册 socket 监听
            for (const eventType of this._msgSubscribers.keys()) {
                this._registerSocketListener(eventType);
            }
        });

        this._socket.on('connect_error', err => {
            console.error(`[AI WS] Connect error: ${err.message}`);
            this._onConnectionChange.fire({ connected: false });
        });

        this._socket.on('disconnect', reason => {
            console.log(`[AI WS] Disconnected, reason: ${reason}`);
            this._onConnectionChange.fire({ connected: false });
            // 连接断开时清理已注册的 socket 监听器
            for (const eventType of this._msgSubscribers.keys()) {
                this._unregisterSocketListener(eventType);
            }
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
     * 加入房间
     */
    joinRoom(roomId: string): void {
        console.log(`[AI WS] Joining room: ${roomId}`);
        this._socket?.emit('message', { type: 'join', payload: { roomId } });
    }

    /**
     * 创建新房间并发送消息
     */
    sendCreateAndSend(content: string, context: unknown): void {
        if (!this._socket || !this._socket.connected) {
            throw new Error('WebSocket is not connected');
        }
        this._socket.emit('message', { type: 'create_and_send', payload: { content, context } });
    }

    /**
     * 加入房间（别名方法，与 joinRoom 行为一致）
     */
    sendJoin(roomId: string): void {
        this._socket?.emit('message', { type: 'join', payload: { roomId } });
    }

    /**
     * 发送用户消息
     */
    sendMessage(content: string, context: unknown, roomId: string): void {
        console.log(`[AI WS] Sending message, length: ${content.length}`);
        this._socket?.emit('message', {
            type: 'send_message',
            payload: { roomId, content, context },
        });
    }

    /**
     * 发送工具执行结果
     */
    sendToolResult(roomId: string, toolCallId: string, result: unknown, error?: string): void {
        console.log(`[AI WS] Sending tool result: ${toolCallId}`);
        this._socket?.emit('message', {
            type: 'tool_result',
            payload: { roomId, toolCallId, result, error },
        });
    }

    /**
     * 停止 AI 生成
     */
    stopGenerating(roomId: string): void {
        console.log(`[AI WS] Stop generating`);
        this._socket?.emit('message', { type: 'stop', payload: { roomId } });
    }

    override dispose(): void {
        this._stopIdleTimer();
        this._subscriptions.dispose();
        this._socketListeners.clear();
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
