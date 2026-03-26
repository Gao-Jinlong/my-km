// apps/web/src/platform/message-channel/__tests__/service.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MessageChannelService } from '../service';
import { type Message, MessageChannelState } from '../types';

describe('MessageChannelService', () => {
    let service: MessageChannelService;

    beforeEach(() => {
        service = new MessageChannelService();
    });

    afterEach(() => {
        service.dispose();
    });

    it('应成功创建实例', () => {
        expect(service).toBeDefined();
        expect(service.getChannelCount()).toBe(0);
    });

    it('应创建消息通道', () => {
        const channel = service.createChannel({
            name: 'test-channel',
            autoConnect: false,
        });

        expect(channel).toBeDefined();
        expect(channel.name).toBe('test-channel');
        expect(service.getChannelCount()).toBe(1);
    });

    it('应获取已创建的通道', () => {
        service.createChannel({ name: 'test-channel' });

        const channel = service.getChannel('test-channel');
        expect(channel).toBeDefined();
        expect(channel?.name).toBe('test-channel');
    });

    it('应返回 undefined 对于不存在的通道', () => {
        const channel = service.getChannel('nonexistent');
        expect(channel).toBeUndefined();
    });

    it('应获取或创建通道', () => {
        const channel1 = service.getOrCreateChannel({ name: 'test' });
        const channel2 = service.getOrCreateChannel({ name: 'test' });

        expect(channel1).toBe(channel2);
        expect(service.getChannelCount()).toBe(1);
    });

    it('应删除通道', async () => {
        service.createChannel({ name: 'test-channel' });
        expect(service.getChannelCount()).toBe(1);

        await service.deleteChannel('test-channel');
        expect(service.getChannelCount()).toBe(0);
        expect(service.getChannel('test-channel')).toBeUndefined();
    });

    it('应清空所有通道', async () => {
        service.createChannel({ name: 'channel1' });
        service.createChannel({ name: 'channel2' });
        service.createChannel({ name: 'channel3' });

        await service.clearChannels();
        expect(service.getChannelCount()).toBe(0);
    });

    it('应获取所有通道名称', () => {
        service.createChannel({ name: 'channel1' });
        service.createChannel({ name: 'channel2' });

        const names = service.getChannelNames();
        expect(names).toHaveLength(2);
        expect(names).toContain('channel1');
        expect(names).toContain('channel2');
    });

    it('应触发 onChannelCreated 事件', () => {
        const onCreated = vi.fn();
        service.onChannelCreated(onCreated);

        service.createChannel({ name: 'test-channel' });

        expect(onCreated).toHaveBeenCalledWith('test-channel');
    });

    it('应触发 onChannelDestroyed 事件', async () => {
        service.createChannel({ name: 'test-channel' });

        const onDestroyed = vi.fn();
        service.onChannelDestroyed(onDestroyed);

        await service.deleteChannel('test-channel');

        expect(onDestroyed).toHaveBeenCalledWith('test-channel');
    });

    it('应支持通道连接和断开', async () => {
        const channel = service.createChannel({
            name: 'test-channel',
            autoConnect: false,
        });

        expect(channel.state).toBe(MessageChannelState.Disconnected);

        await channel.connect();
        expect(channel.state).toBe(MessageChannelState.Connected);

        channel.disconnect();
        expect(channel.state).toBe(MessageChannelState.Closed);
    });

    it('应支持订阅和取消订阅', async () => {
        const channel = service.createChannel({ name: 'test-channel' });
        await channel.connect();

        const handler = vi.fn();
        const subscription = channel.subscribe('test.message', handler);

        await channel.send({
            type: 'test.message',
            payload: { data: 'test' },
        });

        // 给异步操作一些时间
        await new Promise(resolve => setTimeout(resolve, 10));

        expect(handler).toHaveBeenCalledTimes(1);

        subscription.dispose();

        await channel.send({
            type: 'test.message',
            payload: { data: 'test2' },
        });

        // 给异步操作一些时间
        await new Promise(resolve => setTimeout(resolve, 10));

        expect(handler).toHaveBeenCalledTimes(1); // 不应再被调用
    });

    it('应获取通道状态', async () => {
        const channel = service.createChannel({ name: 'test-channel' });
        await channel.connect();

        const handler = vi.fn();
        channel.subscribe('test.message', handler);

        const status = channel.getStatus();
        expect(status.state).toBe(MessageChannelState.Connected);
        expect(status.activeHandlers).toBe(1);
        expect(status.pendingMessages).toBe(0);
    });

    it('应清除所有订阅', async () => {
        const channel = service.createChannel({ name: 'test-channel' });
        await channel.connect();

        const handler1 = vi.fn();
        const handler2 = vi.fn();

        channel.subscribe('test.message', handler1);
        channel.subscribe('test.message', handler2);

        channel.clearSubscriptions();

        await channel.send({
            type: 'test.message',
            payload: { data: 'test' },
        });

        await new Promise(resolve => setTimeout(resolve, 10));

        expect(handler1).not.toHaveBeenCalled();
        expect(handler2).not.toHaveBeenCalled();
    });

    it('应抛出错误对于重复创建同名通道', () => {
        service.createChannel({ name: 'test-channel' });

        expect(() => {
            service.createChannel({ name: 'test-channel' });
        }).toThrow('通道 test-channel 已存在');
    });

    it('应支持消息拦截器', async () => {
        const interceptor = {
            beforeSend: vi.fn(<T>(message: Message<T>) => ({
                ...message,
                payload: { ...message.payload, modified: true } as T,
            })),
        };

        const channel = service.createChannel(
            { name: 'test-channel' },
            { interceptors: [interceptor], logging: true },
        );
        await channel.connect();

        const handler = vi.fn();
        channel.subscribe('test.message', handler);

        await channel.send({
            type: 'test.message',
            payload: { data: 'original' },
        });

        await new Promise(resolve => setTimeout(resolve, 10));

        expect(interceptor.beforeSend).toHaveBeenCalled();
        expect(handler).toHaveBeenCalledWith(
            expect.objectContaining({
                payload: expect.objectContaining({
                    modified: true,
                }),
            }),
        );
    });
});
