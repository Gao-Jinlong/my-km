// apps/web/src/platform/message-channel/__tests__/types.test.ts
import { describe, expect, it } from 'vitest';
import type {
    Message,
    MessageChannelConfig,
    MessageChannelOptions,
    MessageHandler,
    MessageInterceptor,
    WorkerMessage,
} from '../types';
import { MessageChannelState } from '../types';

describe('MessageChannel Types', () => {
    it('应正确定义消息', () => {
        const message: Message<{ value: string }> = {
            id: 'msg-123',
            type: 'test.message',
            payload: { value: 'hello' },
            timestamp: Date.now(),
            source: 'main',
            target: 'worker',
        };
        expect(message.id).toBe('msg-123');
        expect(message.type).toBe('test.message');
        expect(message.payload.value).toBe('hello');
    });

    it('应正确定义消息处理器', () => {
        const handler: MessageHandler<{ data: string }> = message => {
            console.log('Received:', message.payload.data);
            return { processed: true };
        };
        expect(typeof handler).toBe('function');
    });

    it('应正确定义通道配置', () => {
        const config: MessageChannelConfig = {
            name: 'test-channel',
            workerUrl: '/workers/test.worker.ts',
            autoConnect: true,
            timeout: 5000,
            maxRetries: 3,
            retryInterval: 1000,
        };
        expect(config.name).toBe('test-channel');
        expect(config.autoConnect).toBe(true);
    });

    it('应正确定义通道状态', () => {
        expect(MessageChannelState.Disconnected).toBe('disconnected');
        expect(MessageChannelState.Connecting).toBe('connecting');
        expect(MessageChannelState.Connected).toBe('connected');
        expect(MessageChannelState.Closing).toBe('closing');
        expect(MessageChannelState.Closed).toBe('closed');
        expect(MessageChannelState.Error).toBe('error');
    });

    it('应正确定义通道选项', () => {
        const options: MessageChannelOptions = {
            messageTimeout: 30000,
            logging: true,
        };
        expect(options.messageTimeout).toBe(30000);
        expect(options.logging).toBe(true);
    });

    it('应正确定义消息拦截器', () => {
        const interceptor: MessageInterceptor = {
            beforeSend: message => ({
                ...message,
                payload: { ...message.payload, timestamp: Date.now() },
            }),
            beforeReceive: message => message,
        };
        expect(typeof interceptor.beforeSend).toBe('function');
        expect(typeof interceptor.beforeReceive).toBe('function');
    });

    it('应正确定义 Worker 消息', () => {
        const workerMsg: WorkerMessage<{ result: number }> = {
            type: 'message',
            data: { result: 42 },
            messageId: 'msg-456',
        };
        expect(workerMsg.type).toBe('message');
        expect(workerMsg.data?.result).toBe(42);
    });

    it('应正确定义错误 Worker 消息', () => {
        const errorWorkerMsg: WorkerMessage = {
            type: 'error',
            error: 'Something went wrong',
            messageId: 'msg-789',
        };
        expect(errorWorkerMsg.type).toBe('error');
        expect(errorWorkerMsg.error).toBe('Something went wrong');
    });
});
