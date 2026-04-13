// apps/web/src/platform/message-channel/service.ts

import { container } from '@/platform/bootstrap';
import { Service } from '@/platform/di';
import type { Logger } from '@/platform/monitor';
import { MonitorService } from '@/platform/monitor/service';
import { Emitter, type IDisposable } from '../../base/common/event';
import { ServiceBase } from '../../platform/base/service-base';
import type {
    IMessageChannel,
    Message,
    MessageChannelConfig,
    MessageChannelOptions,
    MessageHandler,
} from './types';
import { MessageChannelState } from './types';

@Service({ singleton: true })
export class MessageChannelService extends ServiceBase {
    /** 通道注册表 */
    private readonly channels = new Map<string, IMessageChannel>();
    private _logger?: Logger;

    /**
     * 惰性获取 logger（避免在容器初始化前访问）
     */
    protected get logger(): Logger {
        if (!this._logger) {
            this._logger = container.get(MonitorService).getLogger('message-channel');
        }
        return this._logger;
    }

    /** 通道配置 */
    private readonly channelConfigs = new Map<string, MessageChannelConfig>();

    /** 默认选项 */
    private readonly defaultOptions: MessageChannelOptions = {
        messageTimeout: 30000,
        logging: false,
    };

    /** 事件发射器 */
    private readonly _onChannelCreated = new Emitter<string>();
    private readonly _onChannelDestroyed = new Emitter<string>();

    /** 公开事件 */
    readonly onChannelCreated = this._onChannelCreated.event;
    readonly onChannelDestroyed = this._onChannelDestroyed.event;

    /**
     * 创建消息通道
     */
    createChannel(config: MessageChannelConfig, options?: MessageChannelOptions): IMessageChannel {
        if (this.channels.has(config.name)) {
            throw new Error(`通道 ${config.name} 已存在`);
        }

        const channel = new MessageChannelImpl(
            config,
            {
                ...this.defaultOptions,
                ...options,
            },
            this.logger,
        );

        this.channels.set(config.name, channel);
        this.channelConfigs.set(config.name, config);

        this._onChannelCreated.fire(config.name);

        return channel;
    }

    /**
     * 获取消息通道
     */
    getChannel(name: string): IMessageChannel | undefined {
        return this.channels.get(name);
    }

    /**
     * 获取或创建消息通道
     */
    getOrCreateChannel(
        config: MessageChannelConfig,
        options?: MessageChannelOptions,
    ): IMessageChannel {
        const existing = this.getChannel(config.name);
        if (existing) {
            return existing;
        }
        return this.createChannel(config, options);
    }

    /**
     * 删除消息通道
     */
    async deleteChannel(name: string): Promise<void> {
        const channel = this.channels.get(name);
        if (channel) {
            channel.disconnect();
            this.channels.delete(name);
            this.channelConfigs.delete(name);
            this._onChannelDestroyed.fire(name);
        }
    }

    /**
     * 清空所有通道
     */
    async clearChannels(): Promise<void> {
        for (const [name] of this.channels) {
            await this.deleteChannel(name);
        }
    }

    /**
     * 获取所有通道名称
     */
    getChannelNames(): string[] {
        return Array.from(this.channels.keys());
    }

    /**
     * 获取通道数量
     */
    getChannelCount(): number {
        return this.channels.size;
    }

    /**
     * 广播消息到所有通道
     */
    async broadcast<T>(message: Omit<Message<T>, 'id' | 'timestamp'>): Promise<void> {
        const promises: Promise<void>[] = [];
        for (const channel of this.channels.values()) {
            if (channel.getStatus().state === 'connected') {
                promises.push(channel.send(message));
            }
        }
        await Promise.all(promises);
    }

    override dispose(): void {
        this._onChannelCreated.dispose();
        this._onChannelDestroyed.dispose();
        this.clearChannels();
        super.dispose();
    }
}

/**
 * 消息通道实现（基础版本）
 */
class MessageChannelImpl implements IMessageChannel {
    readonly name: string;
    private _state: MessageChannelState = MessageChannelState.Disconnected;

    private readonly _onConnect = new Emitter<void>();
    private readonly _onDisconnect = new Emitter<void>();
    private readonly _onError = new Emitter<Error>();
    private readonly _onStateChange = new Emitter<MessageChannelState>();

    readonly onConnect = this._onConnect.event;
    readonly onDisconnect = this._onDisconnect.event;
    readonly onError = this._onError.event;
    readonly onStateChange = this._onStateChange.event;

    private handlers = new Map<string, Set<MessageHandler>>();
    private pendingMessages = new Map<
        string,
        {
            resolve: (value: unknown) => void;
            reject: (reason: Error) => void;
            timeout: NodeJS.Timeout;
        }
    >();

    private worker?: Worker;
    private readonly config: MessageChannelConfig;
    private readonly options: MessageChannelOptions;
    private readonly logger: Logger;

    constructor(config: MessageChannelConfig, options: MessageChannelOptions, logger: Logger) {
        this.config = config;
        this.options = options;
        this.name = config.name;
        this.logger = logger;
    }

    get state(): MessageChannelState {
        return this._state;
    }

    async connect(): Promise<void> {
        if (this._state === MessageChannelState.Connected) {
            return;
        }

        this.setState(MessageChannelState.Connecting);

        try {
            if (this.config.workerUrl) {
                this.worker = new Worker(new URL(this.config.workerUrl, window.location.href));
                this.worker.onmessage = event => this.handleWorkerMessage(event.data);
                this.worker.onerror = error =>
                    this.handleError(new Error(`Worker error: ${error.message}`));
            }

            this.setState(MessageChannelState.Connected);
            this._onConnect.fire();

            if (this.options.logging) {
                this.logger.info('{name} connected', this.name);
            }
        } catch (error) {
            this.setState(MessageChannelState.Error);
            this._onError.fire(error instanceof Error ? error : new Error(String(error)));
            throw error;
        }
    }

    disconnect(): void {
        if (
            this._state === MessageChannelState.Disconnected ||
            this._state === MessageChannelState.Closed
        ) {
            return;
        }

        this.setState(MessageChannelState.Closing);

        // 清理所有待处理的消息
        for (const [_id, pending] of this.pendingMessages.entries()) {
            clearTimeout(pending.timeout);
            pending.reject(new Error('Channel disconnected'));
        }
        this.pendingMessages.clear();

        // 终止 Worker
        if (this.worker) {
            this.worker.terminate();
            this.worker = undefined;
        }

        this.setState(MessageChannelState.Closed);
        this._onDisconnect.fire();

        if (this.options.logging) {
            this.logger.info('{name} disconnected', this.name);
        }
    }

    async send<T>(message: Omit<Message<T>, 'id' | 'timestamp'>): Promise<void> {
        if (this._state !== MessageChannelState.Connected) {
            throw new Error(`通道未连接：${this.name}`);
        }

        const fullMessage: Message<T> = {
            ...message,
            id: this.generateMessageId(),
            timestamp: Date.now(),
        };

        // 应用发送前拦截器
        const processedMessage = this.applyInterceptors(fullMessage, 'beforeSend');
        if (processedMessage === null) {
            return; // 被拦截器阻止
        }

        if (this.worker) {
            this.worker.postMessage({
                type: 'message',
                data: processedMessage.payload,
                messageId: processedMessage.id,
                messageType: processedMessage.type,
            });
        } else {
            // 如果没有 Worker，直接分发给本地处理器
            this.dispatchMessage(processedMessage);
        }

        if (this.options.logging) {
            this.logger.debug('{name} sent:', this.name, processedMessage);
        }
    }

    async sendAndWait<T, R>(
        message: Omit<Message<T>, 'id' | 'timestamp'>,
        timeout?: number,
    ): Promise<R> {
        const correlationId = this.generateMessageId();
        const messageTimeout = timeout ?? this.options.messageTimeout ?? 30000;

        return new Promise<R>((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                this.pendingMessages.delete(correlationId);
                reject(new Error(`Message timeout: ${message.type}`));
            }, messageTimeout);

            this.pendingMessages.set(correlationId, {
                resolve: value => {
                    clearTimeout(timeoutId);
                    resolve(value as R);
                },
                reject,
                timeout: timeoutId,
            });

            this.send<T>({
                ...message,
                correlationId,
            }).catch(reject);
        });
    }

    subscribe<T>(messageType: string, handler: MessageHandler<T>): IDisposable {
        let handlerSet = this.handlers.get(messageType);
        if (!handlerSet) {
            handlerSet = new Set();
            this.handlers.set(messageType, handlerSet);
        }
        handlerSet.add(handler as MessageHandler);

        return {
            dispose: () => {
                this.unsubscribe(messageType, handler as MessageHandler);
            },
        };
    }

    unsubscribe(messageType: string, handler: MessageHandler): void {
        const handlerSet = this.handlers.get(messageType);
        if (handlerSet) {
            handlerSet.delete(handler);
            if (handlerSet.size === 0) {
                this.handlers.delete(messageType);
            }
        }
    }

    clearSubscriptions(): void {
        this.handlers.clear();
    }

    getStatus(): {
        state: MessageChannelState;
        pendingMessages: number;
        activeHandlers: number;
    } {
        let handlerCount = 0;
        for (const set of this.handlers.values()) {
            handlerCount += set.size;
        }

        return {
            state: this._state,
            pendingMessages: this.pendingMessages.size,
            activeHandlers: handlerCount,
        };
    }

    dispose(): void {
        this.disconnect();
        this._onConnect.dispose();
        this._onDisconnect.dispose();
        this._onError.dispose();
        this._onStateChange.dispose();
        this.handlers.clear();
    }

    private setState(newState: MessageChannelState): void {
        this._state = newState;
        this._onStateChange.fire(newState);
    }

    private handleWorkerMessage(data: unknown): void {
        const message: Message = {
            id: (data as { messageId?: string }).messageId || this.generateMessageId(),
            type: (data as { messageType?: string }).messageType || 'unknown',
            payload: (data as { data?: unknown }).data,
            timestamp: Date.now(),
        };

        this.dispatchMessage(message);
    }

    private dispatchMessage(message: Message): void {
        // 应用接收前拦截器
        const processedMessage = this.applyInterceptors(message, 'beforeReceive');
        if (processedMessage === null) {
            return; // 被拦截器阻止
        }

        // 检查是否是响应消息
        if (processedMessage.correlationId) {
            const pending = this.pendingMessages.get(processedMessage.correlationId);
            if (pending) {
                this.pendingMessages.delete(processedMessage.correlationId);
                pending.resolve(processedMessage.payload);
                return;
            }
        }

        // 分发给处理器
        const handlerSet = this.handlers.get(processedMessage.type);
        if (handlerSet) {
            for (const handler of handlerSet) {
                try {
                    const result = handler(processedMessage);
                    if (result instanceof Promise) {
                        result.catch(error => {
                            this.logger.error(
                                'Handler error for {type}:',
                                processedMessage.type,
                                error,
                            );
                        });
                    }
                } catch (error) {
                    this.logger.error('Handler error for {type}:', processedMessage.type, error);
                }
            }
        }

        if (this.options.logging) {
            this.logger.debug('{name} received:', this.name, processedMessage);
        }
    }

    private handleError(error: Error): void {
        this._onError.fire(error);
        if (this.options.logging) {
            this.logger.error('{name} error:', this.name, error);
        }
    }

    private applyInterceptors<T>(
        message: Message<T>,
        hook: 'beforeSend' | 'beforeReceive',
    ): Message<T> | null {
        const interceptors = this.options.interceptors || [];
        let processedMessage: Message<T> | null = message;

        for (const interceptor of interceptors) {
            const hookFn = interceptor[hook];
            if (hookFn) {
                const result = hookFn(processedMessage as Message<unknown>);
                if (result === null) {
                    return null;
                }
                if (result) {
                    processedMessage = result as Message<T>;
                }
            }
        }

        return processedMessage;
    }

    private generateMessageId(): string {
        return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    }
}
