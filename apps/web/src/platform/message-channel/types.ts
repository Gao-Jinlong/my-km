// apps/web/src/platform/message-channel/types.ts

import type { IDisposable } from '@/base/common/event';

/**
 * 消息定义
 */
export interface Message<T = unknown> {
    /** 消息 ID */
    id: string;

    /** 消息类型 */
    type: string;

    /** 消息数据 */
    payload: T;

    /** 发送时间戳 */
    timestamp: number;

    /** 发送来源 */
    source?: string;

    /** 目标（如果是响应消息） */
    target?: string;

    /** 关联的原始消息 ID（用于请求 - 响应模式） */
    correlationId?: string;
}

/**
 * 消息处理器
 */
export type MessageHandler<T = unknown> = (message: Message<T>) => undefined | Promise<unknown>;

/**
 * 消息通道配置
 */
export interface MessageChannelConfig {
    /** 通道名称 */
    name: string;

    /** Worker URL（如果是 Worker 通道） */
    workerUrl?: string;

    /** 是否自动连接 */
    autoConnect?: boolean;

    /** 连接超时（毫秒） */
    timeout?: number;

    /** 重试次数 */
    maxRetries?: number;

    /** 重试间隔（毫秒） */
    retryInterval?: number;
}

/**
 * 消息通道状态
 */
export enum MessageChannelState {
    /** 未连接 */
    Disconnected = 'disconnected',

    /** 连接中 */
    Connecting = 'connecting',

    /** 已连接 */
    Connected = 'connected',

    /** 关闭中 */
    Closing = 'closing',

    /** 已关闭 */
    Closed = 'closed',

    /** 错误状态 */
    Error = 'error',
}

/**
 * 消息通道选项
 */
export interface MessageChannelOptions {
    /** 消息超时时间（毫秒） */
    messageTimeout?: number;

    /** 是否记录日志 */
    logging?: boolean;

    /** 消息拦截器 */
    interceptors?: MessageInterceptor[];
}

/**
 * 消息拦截器
 */
export interface MessageInterceptor {
    /** 发送前钩子 */
    beforeSend?: <T>(message: Message<T>) => Message<T> | null;

    /** 接收前钩子 */
    beforeReceive?: <T>(message: Message<T>) => Message<T> | null;
}

/**
 * 消息通道事件
 */
export interface MessageChannelEvents {
    /** 连接建立 */
    onConnect: () => void;

    /** 连接断开 */
    onDisconnect: () => void;

    /** 发生错误 */
    onError: (error: Error) => void;

    /** 状态变化 */
    onStateChange: (state: MessageChannelState) => void;
}

/**
 * 消息通道接口
 */
export interface IMessageChannel {
    /** 通道名称 */
    readonly name: string;

    /** 当前状态 */
    readonly state: MessageChannelState;

    /** 连接 */
    connect(): Promise<void>;

    /** 断开连接 */
    disconnect(): void;

    /** 发送消息 */
    send<T>(message: Omit<Message<T>, 'id' | 'timestamp'>): Promise<void>;

    /** 发送消息并等待响应 */
    sendAndWait<T, R>(message: Omit<Message<T>, 'id' | 'timestamp'>, timeout?: number): Promise<R>;

    /** 订阅消息 */
    subscribe<T>(messageType: string, handler: MessageHandler<T>): IDisposable;

    /** 取消订阅 */
    unsubscribe(messageType: string, handler: MessageHandler): void;

    /** 清空所有订阅 */
    clearSubscriptions(): void;

    /** 获取通道状态 */
    getStatus(): {
        state: MessageChannelState;
        pendingMessages: number;
        activeHandlers: number;
    };
}

/**
 * Worker 消息包装器
 */
export interface WorkerMessage<T = unknown> {
    /** 消息类型 */
    type: 'message' | 'error' | 'ready';

    /** 消息数据 */
    data?: T;

    /** 错误信息 */
    error?: string;

    /** 消息 ID */
    messageId?: string;

    /** 响应 ID */
    responseId?: string;
}
