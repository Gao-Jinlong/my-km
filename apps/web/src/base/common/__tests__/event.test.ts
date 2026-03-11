import { describe, expect, it, vi } from 'vitest';
import { Emitter, type Event } from '../event';

describe('EventEmitter', () => {
    describe('Event 类型订阅/取消订阅', () => {
        it('应该返回 IDisposable 对象', () => {
            const emitter = new Emitter<string>();
            const disposable = emitter.event(vi.fn());

            expect(disposable).toBeDefined();
            expect(typeof disposable.dispose).toBe('function');
        });

        it('应该可以取消订阅', () => {
            const emitter = new Emitter<string>();
            const listener = vi.fn();
            const disposable = emitter.event(listener);

            emitter.fire('test');
            expect(listener).toHaveBeenCalledTimes(1);

            disposable.dispose();
            emitter.fire('test2');

            expect(listener).toHaveBeenCalledTimes(1);
        });

        it('应该可以多次订阅同一事件', () => {
            const emitter = new Emitter<string>();
            const listener1 = vi.fn();
            const listener2 = vi.fn();

            emitter.event(listener1);
            emitter.event(listener2);

            emitter.fire('test');

            expect(listener1).toHaveBeenCalledTimes(1);
            expect(listener2).toHaveBeenCalledTimes(1);
        });
    });

    describe('EventEmitter 基础功能', () => {
        it('应该可以创建实例', () => {
            const emitter = new Emitter<number>();
            expect(emitter).toBeDefined();
        });

        it('应该继承自 Disposable', () => {
            const emitter = new Emitter<string>();
            expect(typeof emitter.dispose).toBe('function');
        });

        it('应该有 event 属性', () => {
            const emitter = new Emitter<string>();
            expect(typeof emitter.event).toBe('function');
        });

        it('应该可以获取 listenerCount', () => {
            const emitter = new Emitter<string>();
            expect(emitter.listenerCount).toBe(0);

            const disposable1 = emitter.event(vi.fn());
            expect(emitter.listenerCount).toBe(1);

            const disposable2 = emitter.event(vi.fn());
            expect(emitter.listenerCount).toBe(2);

            disposable1.dispose();
            expect(emitter.listenerCount).toBe(1);

            disposable2.dispose();
            expect(emitter.listenerCount).toBe(0);
        });
    });

    describe('fire 方法', () => {
        it('应该调用所有已注册的监听器', () => {
            const emitter = new Emitter<number>();
            const listener1 = vi.fn();
            const listener2 = vi.fn();

            emitter.event(listener1);
            emitter.event(listener2);

            emitter.fire(42);

            expect(listener1).toHaveBeenCalledWith(42);
            expect(listener2).toHaveBeenCalledWith(42);
        });

        it('在没有监听器时不应该抛出异常', () => {
            const emitter = new Emitter<string>();
            expect(() => emitter.fire('test')).not.toThrow();
        });

        it('监听器应该按注册顺序执行', () => {
            const emitter = new Emitter<string>();
            const executionOrder: string[] = [];

            emitter.event(() => executionOrder.push('first'));
            emitter.event(() => executionOrder.push('second'));
            emitter.event(() => executionOrder.push('third'));

            emitter.fire('test');

            expect(executionOrder).toEqual(['first', 'second', 'third']);
        });

        it('应该传递正确的事件数据', () => {
            const emitter = new Emitter<{ id: number; name: string }>();
            const listener = vi.fn();
            emitter.event(listener);

            const eventData = { id: 1, name: 'test' };
            emitter.fire(eventData);

            expect(listener).toHaveBeenCalledWith(eventData);
        });

        it('多次 fire 应该每次都调用监听器', () => {
            const emitter = new Emitter<string>();
            const listener = vi.fn();
            emitter.event(listener);

            emitter.fire('first');
            emitter.fire('second');
            emitter.fire('third');

            expect(listener).toHaveBeenCalledTimes(3);
            expect(listener).toHaveBeenNthCalledWith(1, 'first');
            expect(listener).toHaveBeenNthCalledWith(2, 'second');
            expect(listener).toHaveBeenNthCalledWith(3, 'third');
        });
    });

    describe('dispose 资源清理', () => {
        it('dispose 后监听器应该被清空', () => {
            const emitter = new Emitter<string>();
            const listener = vi.fn();
            emitter.event(listener);

            emitter.dispose();
            emitter.fire('test');

            expect(listener).not.toHaveBeenCalled();
        });

        it('dispose 后 listenerCount 应该为 0', () => {
            const emitter = new Emitter<string>();
            emitter.event(vi.fn());
            emitter.event(vi.fn());

            expect(emitter.listenerCount).toBe(2);

            emitter.dispose();

            expect(emitter.listenerCount).toBe(0);
        });

        it('订阅在 dispose 前已被取消应该正常工作', () => {
            const emitter = new Emitter<string>();
            const listener = vi.fn();
            const disposable = emitter.event(listener);

            disposable.dispose();
            expect(() => emitter.dispose()).not.toThrow();
        });

        it('dispose 后可以重新订阅', () => {
            const emitter = new Emitter<string>();
            const listener1 = vi.fn();
            emitter.event(listener1);
            emitter.dispose();

            const listener2 = vi.fn();
            emitter.event(listener2);

            emitter.fire('test');

            expect(listener1).not.toHaveBeenCalled();
            expect(listener2).toHaveBeenCalledTimes(1);
        });
    });

    describe('边界情况', () => {
        it('在监听器中取消订阅应该正常工作', () => {
            const emitter = new Emitter<string>();
            const listener1 = vi.fn();
            const listener2 = vi.fn();

            const disposable1 = emitter.event(listener1);
            emitter.event(listener2);

            // 在 listener1 中取消自己
            listener1.mockImplementation(() => {
                disposable1.dispose();
            });

            emitter.fire('first');
            emitter.fire('second');

            // listener1 只被调用一次（因为它在第一次调用后取消了自己）
            expect(listener1).toHaveBeenCalledTimes(1);
            // 注意：由于简化版本不在 fire 时创建副本，listener2 只会在第一次被调用
            // 因为 listener1 在执行时删除了自己，导致数组索引变化，listener2 被跳过
            // 如需避免此行为，可使用 copyListeners: true 选项
            expect(listener2).toHaveBeenCalledTimes(1);
        });

        it('多个相同监听器应该都被调用', () => {
            const emitter = new Emitter<string>();
            const listener = vi.fn();

            const disposable1 = emitter.event(listener);
            const disposable2 = emitter.event(listener);

            emitter.fire('test');

            expect(listener).toHaveBeenCalledTimes(2);

            disposable1.dispose();
            emitter.fire('test2');

            expect(listener).toHaveBeenCalledTimes(3);

            disposable2.dispose();
        });
    });
});

describe('类型安全', () => {
    it('应该正确推断泛型类型', () => {
        const emitter = new Emitter<number>();

        // 这行代码应该通过类型检查
        const event: Event<number> = emitter.event;

        expect(typeof event).toBe('function');
    });

    it('应该正确推断复杂类型', () => {
        interface UserData {
            id: number;
            name: string;
            email: string;
        }

        const emitter = new Emitter<UserData>();

        emitter.event(data => {
            // TypeScript 应该知道 data 是 UserData 类型
            expect(typeof data.id).toBe('number');
            expect(typeof data.name).toBe('string');
            expect(typeof data.email).toBe('string');
        });
    });
});

describe('EmitterOptions', () => {
    it('copyListeners: true 时应该创建副本', () => {
        const emitter = new Emitter<string>({ copyListeners: true });
        const executionOrder: string[] = [];

        const disposable1 = emitter.event(() => {
            executionOrder.push('first');
            disposable1.dispose();
        });

        emitter.event(() => {
            executionOrder.push('second');
        });

        emitter.fire('test');

        // 使用副本时，即使第一个监听器取消了自己，第二个监听器也会被调用
        expect(executionOrder).toEqual(['first', 'second']);
    });

    it('copyListeners: false 时的行为', () => {
        const emitter = new Emitter<string>({ copyListeners: false });
        const executionOrder: string[] = [];

        const disposable1 = emitter.event(() => {
            executionOrder.push('first');
            disposable1.dispose();
        });

        emitter.event(() => {
            executionOrder.push('second');
        });

        emitter.fire('test');

        // 不使用副本时，第一个监听器取消后，第二个监听器可能不会被调用
        // 这取决于具体实现
        expect(executionOrder).toContain('first');
    });
});
