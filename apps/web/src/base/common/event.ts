import type { IDisposable } from './lifecycle';
import { Disposable, toDisposable } from './lifecycle';

// 重新导出 IDisposable 和 toDisposable
export { toDisposable };
export type { IDisposable };

// TODO: 增加事件交付队列，用于解决两个关键问题：
// 重入问题（Reentrancy） - 监听器中再次触发同一个 emitter
// 跨 Emitter 有序交付 - 多个 emitter 共享队列时保证顺序

/**
 * 表示一个监听器函数类型
 */
export type Listener<T> = (e: T) => void;

/**
 * Event 是一个泛型函数类型，接受一个监听器函数并返回一个 IDisposable 用于取消订阅。
 */
export type Event<T> = (listener: Listener<T>) => IDisposable;

/**
 * EmitterOptions 配置选项
 */
export interface EmitterOptions {
    /**
     * 是否在 fire 时创建监听器数组的副本
     * 如果监听器中可能会添加/移除监听器，应设置为 true
     */
    copyListeners?: boolean;
}

/**
 * Emitter 是一个泛型类，继承自 Disposable，用于管理特定类型事件的发布和订阅。
 *
 * @typeParam T - 事件数据的类型
 *
 * @example
 * ```typescript
 * // 创建一个字符串类型的 emitter
 * const emitter = new Emitter<string>();
 *
 * // 订阅事件
 * const disposable = emitter.event((data) => {
 *     console.log('收到事件:', data);
 * });
 *
 * // 触发事件
 * emitter.fire('Hello, World!');
 *
 * // 取消订阅
 * disposable.dispose();
 *
 * // 清理资源
 * emitter.dispose();
 * ```
 */
export class Emitter<T> extends Disposable {
    private _listeners: Array<Listener<T>> = [];
    private _options: EmitterOptions;

    constructor(options?: EmitterOptions) {
        super();
        this._options = options || {};
    }

    /**
     * 获取事件的订阅函数
     * 用于订阅事件，返回一个 IDisposable 用于取消订阅
     */
    get event(): Event<T> {
        return (listener: Listener<T>): IDisposable => {
            this._listeners.push(listener);
            return toDisposable(() => {
                this._removeListener(listener);
            });
        };
    }

    /**
     * 触发事件，将所有已注册的监听器以同步方式调用
     * @param data - 事件数据
     */
    fire(data: T): void {
        if (this._listeners.length === 0) {
            return;
        }

        // 根据选项决定是否创建副本
        const listeners = this._options.copyListeners ? this._listeners.slice() : this._listeners;

        for (const listener of listeners) {
            listener(data);
        }
    }

    /**
     * 获取当前监听器数量
     */
    get listenerCount(): number {
        return this._listeners.length;
    }

    /**
     * 清理资源，移除所有监听器
     */
    override dispose(): void {
        this._listeners = [];
        super.dispose();
    }

    private _removeListener(listener: Listener<T>): void {
        const index = this._listeners.indexOf(listener);
        if (index !== -1) {
            this._listeners.splice(index, 1);
        }
    }
}
