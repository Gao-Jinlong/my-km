// apps/web/src/platform/event-bus/__tests__/service.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventBusService } from '../service';

describe('EventBusService', () => {
    let eventBus: EventBusService;

    beforeEach(() => {
        eventBus = new EventBusService();
    });

    afterEach(() => {
        eventBus.dispose();
    });

    it('应成功创建实例', () => {
        expect(eventBus).toBeDefined();
    });

    it('应支持基本发布/订阅', async () => {
        const mock = vi.fn();
        const sub = eventBus.subscribe('test.event', mock);

        await eventBus.publish({
            type: 'test.event',
            payload: { value: 'test' },
        });

        expect(mock).toHaveBeenCalledTimes(1);
        expect(mock).toHaveBeenCalledWith(
            expect.objectContaining({
                type: 'test.event',
                payload: { value: 'test' },
            }),
        );

        sub.dispose();
    });

    it('应支持取消订阅', async () => {
        const mock = vi.fn();
        const sub = eventBus.subscribe('test.event', mock);
        sub.dispose();

        await eventBus.publish({
            type: 'test.event',
            payload: {},
        });

        expect(mock).not.toHaveBeenCalled();
    });

    it('应支持优先级订阅', async () => {
        const calls: string[] = [];

        eventBus.subscribe('test.event', () => calls.push('low'), { priority: 10 });
        eventBus.subscribe('test.event', () => calls.push('high'), { priority: 100 });
        eventBus.subscribe('test.event', () => calls.push('medium'), { priority: 50 });

        await eventBus.publish({ type: 'test.event', payload: {} });

        expect(calls).toEqual(['high', 'medium', 'low']);
    });

    it('应支持来源过滤', async () => {
        const mock = vi.fn();

        eventBus.subscribe('test.event', mock, { source: 'allowed' });

        await eventBus.publish({ type: 'test.event', source: 'allowed', payload: {} });
        await eventBus.publish({ type: 'test.event', source: 'not-allowed', payload: {} });

        expect(mock).toHaveBeenCalledTimes(1);
    });

    it('应支持标签过滤', async () => {
        const mock = vi.fn();

        eventBus.subscribe('test.event', mock, { tags: ['important'] });

        await eventBus.publish({ type: 'test.event', tags: ['important', 'other'], payload: {} });
        await eventBus.publish({ type: 'test.event', tags: ['normal'], payload: {} });

        expect(mock).toHaveBeenCalledTimes(1);
    });

    it('应支持事件拦截器', async () => {
        const mock = vi.fn();
        eventBus.subscribe('test.event', mock);

        // 添加拦截器阻止事件
        eventBus.addInterceptor(event => {
            if (event.type === 'test.event') {
                return null; // 阻止
            }
            return event;
        });

        await eventBus.publish({ type: 'test.event', payload: {} });

        expect(mock).not.toHaveBeenCalled();
    });

    it('应支持事件拦截器修改事件', async () => {
        const mock = vi.fn();
        eventBus.subscribe('test.event', mock);

        eventBus.addInterceptor(event => ({
            ...event,
            payload: { ...event.payload, modified: true },
        }));

        await eventBus.publish({ type: 'test.event', payload: { value: 'original' } });

        expect(mock).toHaveBeenCalledWith(
            expect.objectContaining({
                payload: expect.objectContaining({ modified: true }),
            }),
        );
    });

    it('应记录事件历史', async () => {
        await eventBus.publish({ type: 'event1', payload: {} });
        await eventBus.publish({ type: 'event2', payload: {} });
        await eventBus.publish({ type: 'event1', payload: {} });

        const history = eventBus.getHistory();
        expect(history.length).toBe(3);

        const event1History = eventBus.getHistory({ type: 'event1' });
        expect(event1History.length).toBe(2);
    });

    it('应支持清空历史', async () => {
        await eventBus.publish({ type: 'event1', payload: {} });

        eventBus.clearHistory();
        expect(eventBus.getHistory().length).toBe(0);
    });

    it('应触发 onEventPublished 事件', async () => {
        const mock = vi.fn();
        eventBus.onEventPublished(mock);

        await eventBus.publish({ type: 'test.event', source: 'test', payload: {} });

        expect(mock).toHaveBeenCalledWith(
            expect.objectContaining({
                type: 'test.event',
                source: 'test',
            }),
        );
    });

    it('应触发 onEventHandled 事件', async () => {
        const mock = vi.fn();
        eventBus.onEventHandled(mock);

        eventBus.subscribe('test.event', vi.fn());
        await eventBus.publish({ type: 'test.event', payload: {} });

        expect(mock).toHaveBeenCalledWith(
            expect.objectContaining({
                listeners: 1,
            }),
        );
    });

    it('应获取订阅者数量', () => {
        const sub1 = eventBus.subscribe('test.event', vi.fn());
        const sub2 = eventBus.subscribe('test.event', vi.fn());

        expect(eventBus.getSubscriberCount('test.event')).toBe(2);

        sub1.dispose();
        expect(eventBus.getSubscriberCount('test.event')).toBe(1);

        sub2.dispose();
        expect(eventBus.getSubscriberCount('test.event')).toBe(0);
    });

    it('应支持异步监听器', async () => {
        const mock = vi.fn().mockImplementation(async () => {
            await new Promise(resolve => setTimeout(resolve, 10));
        });

        eventBus.subscribe('test.event', mock);
        await eventBus.publish({ type: 'test.event', payload: {} });

        // 给异步操作一些时间
        await new Promise(resolve => setTimeout(resolve, 50));
        expect(mock).toHaveBeenCalledTimes(1);
    });
});
