# EventBusService 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现事件总线服务，提供全局事件发布/订阅能力，支持事件命名空间隔离、历史回放、节流防抖和事件拦截器。

**Architecture:** EventBusService 基于现有 Emitter 构建，提供全局事件总线。支持精确事件名订阅、通配符模式订阅、事件历史回放、节流防抖、事件拦截器。采用单例模式。

**Tech Stack:** TypeScript, Emitter (现有)

---

## 文件结构

```
apps/web/src/platform/event-bus/
├── index.ts                 # 导出所有内容
├── service.ts              # EventBusService 实现
├── types.ts                # 类型定义和接口
├── matcher.ts              # 事件名模式匹配工具
└── __tests__/
    ├── types.test.ts
    ├── matcher.test.ts
    └── service.test.ts
```

---

## 任务分解

### Task 1: 类型定义和接口

**Files:**
- Create: `apps/web/src/platform/event-bus/types.ts`
- Test: `apps/web/src/platform/event-bus/__tests__/types.test.ts`

- [ ] **Step 1: 定义事件订阅选项**

```typescript
// apps/web/src/platform/event-bus/types.ts

export interface EventSubscribeOptions {
    /** 事件命名空间（用于过滤） */
    namespace?: string;
    /** 是否接收历史事件 */
    replayHistory?: boolean;
    /** 节流间隔（毫秒） */
    throttle?: number;
    /** 防抖间隔（毫秒） */
    debounce?: number;
    /** 只订阅一次 */
    once?: boolean;
    /** 优先级（数字越大越先执行） */
    priority?: number;
}

export interface EventHistoryItem<T = unknown> {
    /** 事件名称 */
    name: string;
    /** 事件数据 */
    payload: T;
    /** 发生时间 */
    timestamp: number;
}
```

- [ ] **Step 2: 定义事件拦截器接口**

```typescript
// 接在 types.ts 后面

export interface EventInterceptor {
    /** 事件名称模式（支持通配符） */
    pattern: string;
    /** 事件前处理（可修改 payload） */
    before?: <T>(name: string, payload: T) => T | void;
    /** 事件后处理 */
    after?: <T>(name: string, payload: T) => void;
    /** 优先级 */
    priority?: number;
}

export interface EventFilterOptions {
    /** 事件名称过滤 */
    name?: string;
    /** 命名空间过滤 */
    namespace?: string;
    /** 数量限制 */
    limit?: number;
    /** 起始时间 */
    since?: number;
}
```

- [ ] **Step 3: 定义事件总线服务接口**

```typescript
// 接在 types.ts 后面

import { Event, IDisposable } from '@base/common/event';

export interface IEventBusService {
    /**
     * 订阅事件
     */
    subscribe<T>(name: string, handler: (payload: T) => void, options?: EventSubscribeOptions): IDisposable;

    /**
     * 订阅事件（通配符模式）
     */
    subscribePattern<T>(pattern: string, handler: (payload: T, name: string) => void): IDisposable;

    /**
     * 订阅一次事件
     */
    once<T>(name: string, handler: (payload: T) => void): IDisposable;

    /**
     * 发布事件
     */
    publish<T>(name: string, payload: T): void;

    /**
     * 异步发布事件
     */
    publishAsync<T>(name: string, payload: T): Promise<void>;

    /**
     * 取消订阅
     */
    unsubscribe(name: string, handler: (payload: unknown) => void): void;

    /**
     * 清空事件
     */
    clear(name?: string): void;

    /**
     * 添加事件拦截器
     */
    addInterceptor(interceptor: EventInterceptor): IDisposable;

    /**
     * 获取事件历史
     */
    getHistory(options?: EventFilterOptions): EventHistoryItem[];

    /**
     * 清空事件历史
     */
    clearHistory(): void;

    /**
     * 获取事件监听器数量
     */
    getListenerCount(name: string): number;
}
```

- [ ] **Step 4: 运行 TypeScript 检查类型定义**

```bash
cd apps/web && npx tsc --noEmit src/platform/event-bus/types.ts
```

Expected: 无错误

- [ ] **Step 5: 创建类型测试文件**

```typescript
// apps/web/src/platform/event-bus/__tests__/types.test.ts
import { describe, it, expect } from 'vitest';
import type { EventSubscribeOptions, EventHistoryItem, EventInterceptor } from '../types';

describe('EventBusService Types', () => {
    it('应正确定义订阅选项', () => {
        const options: EventSubscribeOptions = {
            namespace: 'file',
            replayHistory: true,
            throttle: 1000,
            debounce: 300,
            once: true,
            priority: 10,
        };
        expect(options.namespace).toBe('file');
        expect(options.throttle).toBe(1000);
    });

    it('应正确定义历史项', () => {
        const item: EventHistoryItem<{ id: number }> = {
            name: 'file.created',
            payload: { id: 123 },
            timestamp: Date.now(),
        };
        expect(item.name).toBe('file.created');
        expect(item.payload.id).toBe(123);
    });

    it('应正确定义拦截器', () => {
        const interceptor: EventInterceptor = {
            pattern: 'file.*',
            before: (name, payload) => ({ ...payload, timestamp: Date.now() }),
            after: (name, payload) => console.log(name, payload),
            priority: 0,
        };
        expect(interceptor.pattern).toBe('file.*');
    });
});
```

- [ ] **Step 6: 运行类型测试**

```bash
cd apps/web && npx vitest run src/platform/event-bus/__tests__/types.test.ts
```

Expected: PASS

- [ ] **Step 7: 提交**

```bash
git add apps/web/src/platform/event-bus/types.ts apps/web/src/platform/event-bus/__tests__/types.test.ts
git commit -m "feat(event-bus): 定义事件总线服务类型和接口"
```

---

### Task 2: 事件名模式匹配工具

**Files:**
- Create: `apps/web/src/platform/event-bus/matcher.ts`
- Test: `apps/web/src/platform/event-bus/__tests__/matcher.test.ts`

- [ ] **Step 1: 实现模式匹配工具**

```typescript
// apps/web/src/platform/event-bus/matcher.ts

/**
 * 检查事件名是否匹配模式
 * 支持通配符 * 匹配任意单个层级
 * 支持 ** 匹配任意多层级
 *
 * @param pattern 模式（如 'file.*', 'file.**.created', '*'）
 * @param eventName 事件名（如 'file.created', 'user.login.success'）
 */
export function matchesPattern(pattern: string, eventName: string): boolean {
    // 精确匹配
    if (pattern === eventName) {
        return true;
    }

    // 全匹配通配符
    if (pattern === '*') {
        return !eventName.includes('.'); // 只匹配单层
    }

    if (pattern === '**') {
        return true; // 匹配所有
    }

    // 转换为正则表达式
    const regexPattern = pattern
        // 先处理 **（匹配任意层级）
        .replace(/\*\*/g, '§§')
        // 转义特殊字符
        .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
        // 恢复 ** 为正则
        .replace(/§§/g, '.*')
        // 处理 *（匹配单层，即不包含.的字符）
        .replace(/\*/g, '[^.]+');

    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(eventName);
}

/**
 * 从事件名提取命名空间（第一段）
 */
export function getNamespace(eventName: string): string {
    const parts = eventName.split('.');
    return parts[0] || '';
}

/**
 * 检查事件名是否在命名空间下
 */
export function isInNamespace(eventName: string, namespace: string): boolean {
    return eventName.startsWith(`${namespace}.`) || eventName === namespace;
}
```

- [ ] **Step 2: 创建匹配器测试**

```typescript
// apps/web/src/platform/event-bus/__tests__/matcher.test.ts
import { describe, it, expect } from 'vitest';
import { matchesPattern, getNamespace, isInNamespace } from '../matcher';

describe('Event Matcher', () => {
    describe('matchesPattern', () => {
        it('应匹配精确模式', () => {
            expect(matchesPattern('file.created', 'file.created')).toBe(true);
            expect(matchesPattern('file.created', 'file.deleted')).toBe(false);
        });

        it('应匹配单层通配符', () => {
            expect(matchesPattern('file.*', 'file.created')).toBe(true);
            expect(matchesPattern('file.*', 'file.deleted')).toBe(true);
            expect(matchesPattern('file.*', 'file.sub.created')).toBe(false);
        });

        it('应匹配多层通配符', () => {
            expect(matchesPattern('file.**', 'file.created')).toBe(true);
            expect(matchesPattern('file.**', 'file.sub.created')).toBe(true);
            expect(matchesPattern('file.**.created', 'file.sub.created')).toBe(true);
        });

        it('应匹配全通配符', () => {
            expect(matchesPattern('*', 'file')).toBe(true);
            expect(matchesPattern('*', 'file.created')).toBe(false);
            expect(matchesPattern('**', 'file.created')).toBe(true);
        });

        it('应匹配复杂模式', () => {
            expect(matchesPattern('*.created', 'file.created')).toBe(true);
            expect(matchesPattern('*.created', 'user.created')).toBe(true);
            expect(matchesPattern('*.created', 'file.deleted')).toBe(false);
        });
    });

    describe('getNamespace', () => {
        it('应提取命名空间', () => {
            expect(getNamespace('file.created')).toBe('file');
            expect(getNamespace('user.login.success')).toBe('user');
            expect(getNamespace('single')).toBe('single');
        });
    });

    describe('isInNamespace', () => {
        it('应检查命名空间', () => {
            expect(isInNamespace('file.created', 'file')).toBe(true);
            expect(isInNamespace('file.deleted', 'file')).toBe(true);
            expect(isInNamespace('user.login', 'file')).toBe(false);
            expect(isInNamespace('file', 'file')).toBe(true);
        });
    });
});
```

- [ ] **Step 3: 运行匹配器测试**

```bash
cd apps/web && npx vitest run src/platform/event-bus/__tests__/matcher.test.ts
```

Expected: PASS

- [ ] **Step 4: 提交**

```bash
git add apps/web/src/platform/event-bus/matcher.ts apps/web/src/platform/event-bus/__tests__/matcher.test.ts
git commit -m "feat(event-bus): 实现事件名模式匹配工具"
```

---

### Task 3: EventBusService 核心实现

**Files:**
- Create: `apps/web/src/platform/event-bus/service.ts`
- Test: `apps/web/src/platform/event-bus/__tests__/service.test.ts`

- [ ] **Step 1: 实现 EventBusService 类**

```typescript
// apps/web/src/platform/event-bus/service.ts

import { Service, ServiceBase } from '@platform/di';
import { Emitter, Event, IDisposable, DisposableStore } from '@base/common/event';
import type {
    IEventBusService,
    EventSubscribeOptions,
    EventHistoryItem,
    EventInterceptor,
    EventFilterOptions,
} from './types';
import { matchesPattern, getNamespace, isInNamespace } from './matcher';

@Service({ singleton: true })
export class EventBusService extends ServiceBase implements IEventBusService {
    /** 事件发射器映射表 */
    private readonly emitters = new Map<string, Emitter<unknown>>();

    /** 事件历史 */
    private readonly history: EventHistoryItem[] = [];
    private readonly historyLimit = 50;

    /** 事件拦截器 */
    private readonly interceptors: EventInterceptor[] = [];

    /** 通配符订阅者 */
    private readonly patternSubscribers = new Map<
        string,
        Array<(payload: unknown, name: string) => void>
    >();

    /** 节流/防抖状态跟踪 */
    private readonly throttleTimers = new Map<string, NodeJS.Timeout>();
    private readonly debounceTimers = new Map<string, NodeJS.Timeout>();
    private readonly lastThrottleTime = new Map<string, number>();

    /**
     * 订阅事件
     */
    subscribe<T>(name: string, handler: (payload: T) => void, options?: EventSubscribeOptions): IDisposable {
        const disposableStore = new DisposableStore();

        // 处理历史回放
        if (options?.replayHistory) {
            const historyItems = this.getHistory({ name, limit: 1 });
            if (historyItems.length > 0) {
                const item = historyItems[0];
                setTimeout(() => handler(item.payload as T), 0);
            }
        }

        // 获取或创建 Emitter
        const emitter = this.getOrCreateEmitter(name);

        // 包装处理器以支持 once
        let wrappedHandler = handler;
        if (options?.once) {
            wrappedHandler = (payload: T) => {
                handler(payload);
                disposableStore.dispose();
            };
        }

        // 应用节流
        if (options?.throttle) {
            wrappedHandler = this.createThrottledHandler(name, wrappedHandler, options.throttle);
        }

        // 应用防抖
        if (options?.debounce) {
            wrappedHandler = this.createDebouncedHandler(name, wrappedHandler, options.debounce);
        }

        // 订阅
        const subscription = emitter.event(wrappedHandler as (payload: unknown) => void);
        disposableStore.add(subscription);

        return disposableStore;
    }

    /**
     * 订阅事件（通配符模式）
     */
    subscribePattern<T>(pattern: string, handler: (payload: T, name: string) => void): IDisposable {
        const handlers = this.patternSubscribers.get(pattern) || [];
        handlers.push(handler as (payload: unknown, name: string) => void);
        this.patternSubscribers.set(pattern, handlers);

        return {
            dispose: () => {
                const index = handlers.indexOf(handler as any);
                if (index !== -1) {
                    handlers.splice(index, 1);
                }
            },
        };
    }

    /**
     * 订阅一次事件
     */
    once<T>(name: string, handler: (payload: T) => void): IDisposable {
        return this.subscribe(name, handler, { once: true });
    }

    /**
     * 发布事件
     */
    publish<T>(name: string, payload: T): void {
        // 执行拦截器 before
        let processedPayload: T = payload;
        const sortedInterceptors = [...this.interceptors].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

        for (const interceptor of sortedInterceptors) {
            if (matchesPattern(interceptor.pattern, name)) {
                if (interceptor.before) {
                    const result = interceptor.before(name, processedPayload);
                    if (result !== undefined) {
                        processedPayload = result as T;
                    }
                }
            }
        }

        // 创建历史项
        const historyItem: EventHistoryItem<T> = {
            name,
            payload: processedPayload,
            timestamp: Date.now(),
        };

        // 加入历史
        this.addToHistory(historyItem);

        // 触发精确匹配的 Emitter
        const emitter = this.emitters.get(name);
        if (emitter) {
            emitter.fire(processedPayload);
        }

        // 触发通配符订阅者
        for (const [pattern, handlers] of this.patternSubscribers.entries()) {
            if (matchesPattern(pattern, name)) {
                for (const handler of handlers) {
                    handler(processedPayload, name);
                }
            }
        }

        // 执行拦截器 after
        for (const interceptor of sortedInterceptors) {
            if (matchesPattern(interceptor.pattern, name)) {
                if (interceptor.after) {
                    interceptor.after(name, processedPayload);
                }
            }
        }
    }

    /**
     * 异步发布事件
     */
    async publishAsync<T>(name: string, payload: T): Promise<void> {
        return Promise.resolve().then(() => this.publish(name, payload));
    }

    /**
     * 取消订阅
     */
    unsubscribe(name: string, handler: (payload: unknown) => void): void {
        // 由订阅时返回的 IDisposable 管理，此方法可选
        console.warn('unsubscribe 方法已废弃，请使用订阅返回的 IDisposable');
    }

    /**
     * 清空事件
     */
    clear(name?: string): void {
        if (name) {
            const emitter = this.emitters.get(name);
            if (emitter) {
                emitter.dispose();
                this.emitters.delete(name);
            }
        } else {
            for (const emitter of this.emitters.values()) {
                emitter.dispose();
            }
            this.emitters.clear();
        }
    }

    /**
     * 添加事件拦截器
     */
    addInterceptor(interceptor: EventInterceptor): IDisposable {
        this.interceptors.push(interceptor);

        return {
            dispose: () => {
                const index = this.interceptors.indexOf(interceptor);
                if (index !== -1) {
                    this.interceptors.splice(index, 1);
                }
            },
        };
    }

    /**
     * 获取事件历史
     */
    getHistory(options?: EventFilterOptions): EventHistoryItem[] {
        let items = [...this.history];

        // 过滤名称
        if (options?.name) {
            items = items.filter(item => item.name === options.name);
        }

        // 过滤命名空间
        if (options?.namespace) {
            items = items.filter(item => isInNamespace(item.name, options.namespace!));
        }

        // 过滤时间
        if (options?.since) {
            items = items.filter(item => item.timestamp >= options.since!);
        }

        // 限制数量
        if (options?.limit) {
            items = items.slice(0, options.limit);
        }

        return items;
    }

    /**
     * 清空事件历史
     */
    clearHistory(): void {
        this.history.splice(0, this.history.length);
    }

    /**
     * 获取事件监听器数量
     */
    getListenerCount(name: string): number {
        const emitter = this.emitters.get(name);
        if (!emitter) return 0;

        // 注意：Emitter 需要暴露 listenerCount 属性
        return (emitter as any).listenerCount || 0;
    }

    override dispose(): void {
        this.clear();
        this.history.splice(0, this.history.length);
        this.interceptors.splice(0, this.interceptors.length);
        this.patternSubscribers.clear();

        // 清理定时器
        for (const timer of this.throttleTimers.values()) {
            clearTimeout(timer);
        }
        for (const timer of this.debounceTimers.values()) {
            clearTimeout(timer);
        }
    }

    // ========== 私有方法 ==========

    private getOrCreateEmitter(name: string): Emitter<unknown> {
        let emitter = this.emitters.get(name);
        if (!emitter) {
            emitter = new Emitter<unknown>();
            this.emitters.set(name, emitter);
        }
        return emitter;
    }

    private addToHistory(item: EventHistoryItem): void {
        this.history.push(item);
        if (this.history.length > this.historyLimit) {
            this.history.shift();
        }
    }

    private createThrottledHandler<T>(
        name: string,
        handler: (payload: T) => void,
        limit: number
    ): (payload: T) => void {
        return (payload: T) => {
            const now = Date.now();
            const lastTime = this.lastThrottleTime.get(name) || 0;

            if (now - lastTime >= limit) {
                this.lastThrottleTime.set(name, now);
                handler(payload);
            } else {
                // 在节流窗口外安排一次执行
                const timer = this.throttleTimers.get(name);
                if (timer) clearTimeout(timer);

                const newTimer = setTimeout(() => {
                    this.lastThrottleTime.set(name, Date.now());
                    handler(payload);
                }, limit - (now - lastTime));

                this.throttleTimers.set(name, newTimer);
            }
        };
    }

    private createDebouncedHandler<T>(
        name: string,
        handler: (payload: T) => void,
        delay: number
    ): (payload: T) => void {
        return (payload: T) => {
            const timer = this.debounceTimers.get(name);
            if (timer) clearTimeout(timer);

            const newTimer = setTimeout(() => {
                handler(payload);
            }, delay);

            this.debounceTimers.set(name, newTimer);
        };
    }
}
```

- [ ] **Step 2: 创建 EventBusService 测试**

```typescript
// apps/web/src/platform/event-bus/__tests__/service.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventBusService } from '../service';

describe('EventBusService', () => {
    let eventBus: EventBusService;

    beforeEach(() => {
        eventBus = new EventBusService();
    });

    afterEach(() => {
        eventBus.dispose();
    });

    it('应发布和订阅事件', () => {
        const handler = vi.fn();
        eventBus.subscribe('test.event', handler);

        eventBus.publish('test.event', { data: 'test' });

        expect(handler).toHaveBeenCalledWith({ data: 'test' });
    });

    it'应支持通配符订阅', () => {
        const handler = vi.fn();
        eventBus.subscribePattern('file.*', handler);

        eventBus.publish('file.created', { id: 1 });
        eventBus.publish('file.deleted', { id: 2 });
        eventBus.publish('user.login', { id: 3 }); // 不应触发

        expect(handler).toHaveBeenCalledTimes(2);
        expect(handler).toHaveBeenCalledWith({ id: 1 }, 'file.created');
        expect(handler).toHaveBeenCalledWith({ id: 2 }, 'file.deleted');
    });

    it'应支持 once 订阅', () => {
        const handler = vi.fn();
        eventBus.once('test.event', handler);

        eventBus.publish('test.event', 1);
        eventBus.publish('test.event', 2);

        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler).toHaveBeenCalledWith(1);
    });

    it'应支持历史回放', () => {
        eventBus.publish('state.changed', { value: 'initial' });

        const handler = vi.fn();
        eventBus.subscribe('state.changed', handler, { replayHistory: true });

        expect(handler).toHaveBeenCalledWith({ value: 'initial' });
    });

    it'应支持节流', async () => {
        const handler = vi.fn();
        eventBus.subscribe('fast.event', handler, { throttle: 100 });

        // 快速发布多次
        eventBus.publish('fast.event', 1);
        eventBus.publish('fast.event', 2);
        eventBus.publish('fast.event', 3);

        // 等待节流窗口
        await new Promise(resolve => setTimeout(resolve, 150));

        // 至少执行一次（第一次立即，后续节流）
        expect(handler).toHaveBeenCalledTimes(1);
    });

    it'应支持防抖', async () => {
        const handler = vi.fn();
        eventBus.subscribe('debounce.event', handler, { debounce: 50 });

        // 快速发布多次
        eventBus.publish('debounce.event', 1);
        eventBus.publish('debounce.event', 2);
        eventBus.publish('debounce.event', 3);

        // 等待防抖窗口
        await new Promise(resolve => setTimeout(resolve, 100));

        // 只执行最后一次
        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler).toHaveBeenCalledWith(3);
    });

    it'应支持拦截器 before', () => {
        const handler = vi.fn();
        eventBus.subscribe('test.event', handler);

        eventBus.addInterceptor({
            pattern: 'test.*',
            before: (name, payload) => ({ ...payload, modified: true }),
        });

        eventBus.publish('test.event', { original: 'data' });

        expect(handler).toHaveBeenCalledWith({ original: 'data', modified: true });
    });

    it'应支持拦截器 after', () => {
        const afterHandler = vi.fn();
        eventBus.addInterceptor({
            pattern: 'test.*',
            after: afterHandler,
        });

        eventBus.publish('test.event', { data: 'test' });

        expect(afterHandler).toHaveBeenCalledWith('test.event', { data: 'test' });
    });

    it'应获取事件历史', () => {
        eventBus.publish('event1', { id: 1 });
        eventBus.publish('event2', { id: 2 });
        eventBus.publish('event1', { id: 3 });

        const history = eventBus.getHistory({ name: 'event1' });
        expect(history).toHaveLength(2);
    });

    it'应获取命名空间历史', () => {
        eventBus.publish('file.created', {});
        eventBus.publish('file.deleted', {});
        eventBus.publish('user.login', {});

        const history = eventBus.getHistory({ namespace: 'file' });
        expect(history).toHaveLength(2);
    });

    it'应清空历史', () => {
        eventBus.publish('test.event', {});
        eventBus.clearHistory();

        const history = eventBus.getHistory();
        expect(history).toHaveLength(0);
    });

    it'应支持 IDisposable 取消订阅', () => {
        const handler = vi.fn();
        const disposable = eventBus.subscribe('test.event', handler);

        eventBus.publish('test.event', 1);
        disposable.dispose();
        eventBus.publish('test.event', 2);

        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler).toHaveBeenCalledWith(1);
    });
});
```

- [ ] **Step 3: 运行 EventBusService 测试**

```bash
cd apps/web && npx vitest run src/platform/event-bus/__tests__/service.test.ts
```

Expected: PASS

- [ ] **Step 4: 提交**

```bash
git add apps/web/src/platform/event-bus/service.ts apps/web/src/platform/event-bus/__tests__/service.test.ts
git commit -m "feat(event-bus): 实现事件总线服务核心功能"
```

---

### Task 4: 导出和索引

**Files:**
- Create: `apps/web/src/platform/event-bus/index.ts`

- [ ] **Step 1: 创建统一导出文件**

```typescript
// apps/web/src/platform/event-bus/index.ts

// 服务
export { EventBusService } from './service';

// 类型
export type {
    EventSubscribeOptions,
    EventHistoryItem,
    EventInterceptor,
    EventFilterOptions,
    IEventBusService,
} from './types';

// 工具
export { matchesPattern, getNamespace, isInNamespace } from './matcher';
```

- [ ] **Step 2: 运行 TypeScript 检查所有导出**

```bash
cd apps/web && npx tsc --noEmit src/platform/event-bus/index.ts
```

Expected: 无错误

- [ ] **Step 3: 提交**

```bash
git add apps/web/src/platform/event-bus/index.ts
git commit -m "feat(event-bus): 添加统一导出文件"
```

---

### Task 5: 最终验证

- [ ] **Step 1: 运行所有事件总线测试**

```bash
cd apps/web && npx vitest run src/platform/event-bus/__tests__/
```

Expected: 所有测试 PASS

- [ ] **Step 2: 检查 TypeScript 类型**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: 无错误

- [ ] **Step 3: 提交最终版本**

```bash
git add apps/web/src/platform/event-bus/
git commit -m "docs(event-bus): 完成事件总线服务实现"
```

---

## 提交历史摘要

1. `feat(event-bus): 定义事件总线服务类型和接口`
2. `feat(event-bus): 实现事件名模式匹配工具`
3. `feat(event-bus): 实现事件总线服务核心功能`
4. `feat(event-bus): 添加统一导出文件`
5. `docs(event-bus): 完成事件总线服务实现`

---

## 测试覆盖目标

- [ ] 类型定义正确
- [ ] 模式匹配工具正确
- [ ] 基本发布订阅正确
- [ ] 通配符订阅正确
- [ ] 节流防抖正确
- [ ] 历史回放正确
- [ ] 拦截器正确
- [ ] TypeScript 类型检查通过
