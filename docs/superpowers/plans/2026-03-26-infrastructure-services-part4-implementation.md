# 基础设施服务第四批实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现事件总线、命令中心、消息通道三个基础设施服务

**Architecture:** 采用分层架构，EventBusService 作为核心通信基础设施，CommandCenter 和 MessageChannelService 基于 EventBus 实现跨服务通信

**Tech Stack:** TypeScript, Vitest (测试), ServiceBase (服务基类), DI 装饰器, Emitter (事件原语)

**Status**: ✅ 已完成 (2026-03-26)

**Test Results**: 72 个测试全部通过
- EventBusService: 20 个测试
- CommandService: 23 个测试
- MessageChannelService: 29 个测试

**实施说明**:
- 事件总线服务已按计划完成
- 命令服务使用现有 `command` 模块实现（已在之前批次创建）
- 消息通道服务已按计划完成
---

## 文件结构总览

```
apps/web/src/platform/
├── event-bus/
│   ├── index.ts                 # 统一导出
│   ├── service.ts               # EventBusService 实现
│   ├── types.ts                 # 事件类型定义
│   ├── errors.ts                # 事件相关错误
│   └── __tests__/
│       ├── service.test.ts
│       ├── types.test.ts
│       └── errors.test.ts
│
├── command-center/
│   ├── index.ts                 # 统一导出
│   ├── service.ts               # CommandCenter 实现
│   ├── types.ts                 # 命令类型定义
│   ├── errors.ts                # 命令相关错误
│   ├── commands/                # 预定义命令
│   │   ├── file-commands.ts
│   │   ├── editor-commands.ts
│   │   └── view-commands.ts
│   └── __tests__/
│       ├── service.test.ts
│       ├── types.test.ts
│       └── errors.test.ts
│
└── message-channel/
    ├── index.ts                 # 统一导出
    ├── service.ts               # MessageChannelService 实现
    ├── types.ts                 # 消息类型定义
    ├── errors.ts                # 消息相关错误
    ├── adapters/
    │   └── worker-adapter.ts    # Worker 通信适配器
    └── __tests__/
        ├── service.test.ts
        ├── types.test.ts
        └── worker-adapter.test.ts
```

---

## 第一部分：EventBusService

### Task 1: 事件总线 - 类型定义和错误类

**Files:**
- Create: `apps/web/src/platform/event-bus/types.ts`
- Create: `apps/web/src/platform/event-bus/errors.ts`
- Test: `apps/web/src/platform/event-bus/__tests__/types.test.ts`
- Test: `apps/web/src/platform/event-bus/__tests__/errors.test.ts`

- [ ] **Step 1: 创建事件类型定义**

```typescript
// apps/web/src/platform/event-bus/types.ts

import type { EventListener } from './service';

/**
 * 事件定义
 */
export interface EventDefinition<T = unknown> {
    /** 事件类型（唯一标识） */
    type: string;

    /** 事件来源（可选） */
    source?: string;

    /** 事件标签（用于分类过滤） */
    tags?: string[];

    /** 事件数据 */
    payload: T;

    /** 事件时间戳 */
    timestamp: number;

    /** 事件 ID（用于追踪） */
    eventId: string;
}

/**
 * 事件订阅选项
 */
export interface EventSubscriptionOptions {
    /** 事件来源过滤 */
    source?: string;

    /** 事件标签过滤 */
    tags?: string[];

    /** 是否异步投递（默认 true） */
    async?: boolean;

    /** 事件拦截器（可阻止事件传递） */
    intercept?: boolean;

    /** 订阅优先级（数字越大越优先） */
    priority?: number;
}

/**
 * 事件拦截器类型
 */
export type EventInterceptor = (event: EventDefinition) => EventDefinition | null;

/**
 * 事件历史过滤选项
 */
export interface EventHistoryOptions {
    /** 事件类型过滤 */
    type?: string;

    /** 事件来源过滤 */
    source?: string;

    /** 返回数量限制 */
    limit?: number;
}
```

- [ ] **Step 2: 创建预定义事件类型**

```typescript
// apps/web/src/platform/event-bus/types.ts (续)

/**
 * 系统级事件
 */
export namespace SystemEvents {
    export const AppReady = 'system/app/ready';
    export const AppWillShutdown = 'system/app/will_shutdown';
    export const AppDidShutdown = 'system/app/did_shutdown';
    export const UserLogin = 'system/user/login';
    export const UserLogout = 'system/user/logout';
    export const UserSettingsChanged = 'system/user/settings_changed';
}

/**
 * 文件系统事件
 */
export namespace FileSystemEvents {
    export const FileOpened = 'filesystem/file/opened';
    export const FileClosed = 'filesystem/file/closed';
    export const FileSaved = 'filesystem/file/saved';
    export const FileDeleted = 'filesystem/file/deleted';
    export const FileRenamed = 'filesystem/file/renamed';
    export const DirectoryCreated = 'filesystem/directory/created';
    export const DirectoryDeleted = 'filesystem/directory/deleted';
    export const FileChanged = 'filesystem/file/changed';
}

/**
 * 编辑器事件
 */
export namespace EditorEvents {
    export const ContentChanged = 'editor/content/changed';
    export const SelectionChanged = 'editor/selection/changed';
    export const CursorMoved = 'editor/cursor/moved';
    export const CommandExecuted = 'editor/command/executed';
}
```

- [ ] **Step 3: 运行 TypeScript 检查**

```bash
cd apps/web && npx tsc --noEmit src/platform/event-bus/types.ts
```

Expected: 无错误

- [ ] **Step 4: 创建类型测试**

```typescript
// apps/web/src/platform/event-bus/__tests__/types.test.ts
import { describe, it, expect } from 'vitest';
import { SystemEvents, FileSystemEvents, EditorEvents } from '../types';

describe('EventBus Types', () => {
    it('应正确定义系统事件', () => {
        expect(SystemEvents.AppReady).toBe('system/app/ready');
        expect(SystemEvents.AppWillShutdown).toBe('system/app/will_shutdown');
        expect(SystemEvents.AppDidShutdown).toBe('system/app/did_shutdown');
    });

    it('应正确定义文件系统事件', () => {
        expect(FileSystemEvents.FileSaved).toBe('filesystem/file/saved');
        expect(FileSystemEvents.FileDeleted).toBe('filesystem/file/deleted');
    });

    it('应正确定义编辑器事件', () => {
        expect(EditorEvents.ContentChanged).toBe('editor/content/changed');
        expect(EditorEvents.SelectionChanged).toBe('editor/selection/changed');
    });
});
```

- [ ] **Step 5: 运行类型测试**

```bash
cd apps/web && npx vitest run src/platform/event-bus/__tests__/types.test.ts
```

Expected: PASS (3 tests)

- [ ] **Step 6: 创建错误类**

```typescript
// apps/web/src/platform/event-bus/errors.ts

/**
 * 事件总线基础错误
 */
export class EventBusError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'EventBusError';
    }
}

/**
 * 事件未注册错误
 */
export class EventNotRegisteredError extends EventBusError {
    constructor(eventType: string) {
        super(`Event "${eventType}" is not registered`);
        this.name = 'EventNotRegisteredError';
    }
}

/**
 * 事件类型冲突错误
 */
export class EventTypeConflictError extends EventBusError {
    constructor(eventType: string) {
        super(`Event type "${eventType}" already registered with different definition`);
        this.name = 'EventTypeConflictError';
    }
}

/**
 * 事件拦截器错误
 */
export class EventInterceptorError extends EventBusError {
    constructor(interceptorName: string, message: string) {
        super(`Interceptor "${interceptorName}" error: ${message}`);
        this.name = 'EventInterceptorError';
    }
}
```

- [ ] **Step 7: 创建错误类测试**

```typescript
// apps/web/src/platform/event-bus/__tests__/errors.test.ts
import { describe, it, expect } from 'vitest';
import {
    EventBusError,
    EventNotRegisteredError,
    EventTypeConflictError,
    EventInterceptorError,
} from '../errors';

describe('EventBus Errors', () => {
    it('EventBusError 应有正确的 name', () => {
        const error = new EventBusError('test');
        expect(error.name).toBe('EventBusError');
    });

    it('EventNotRegisteredError 应包含事件类型', () => {
        const error = new EventNotRegisteredError('test.event');
        expect(error.message).toContain('test.event');
        expect(error.name).toBe('EventNotRegisteredError');
    });

    it('EventTypeConflictError 应包含冲突类型', () => {
        const error = new EventTypeConflictError('test.event');
        expect(error.message).toContain('test.event');
        expect(error.name).toBe('EventTypeConflictError');
    });
});
```

- [ ] **Step 8: 运行错误测试**

```bash
cd apps/web && npx vitest run src/platform/event-bus/__tests__/errors.test.ts
```

Expected: PASS (3 tests)

- [ ] **Step 9: 提交**

```bash
git add apps/web/src/platform/event-bus/types.ts \
        apps/web/src/platform/event-bus/errors.ts \
        apps/web/src/platform/event-bus/__tests__/types.test.ts \
        apps/web/src/platform/event-bus/__tests__/errors.test.ts
git commit -m "feat(event-bus): 定义事件类型和错误类"
```

---

### Task 2: 事件总线 - 核心服务实现

**Files:**
- Create: `apps/web/src/platform/event-bus/service.ts`
- Test: `apps/web/src/platform/event-bus/__tests__/service.test.ts`

- [ ] **Step 1: 实现 EventBusService 核心**

```typescript
// apps/web/src/platform/event-bus/service.ts

import { Service } from '@/platform/di';
import { ServiceBase } from '@/platform/base/service-base';
import { Emitter } from '@/base/common/event';
import type {
    EventDefinition,
    EventSubscriptionOptions,
    EventInterceptor,
    EventHistoryOptions,
} from './types';

type EventListener<T = unknown> = (event: EventDefinition<T>) => void | Promise<void>;

interface Subscription {
    eventType: string;
    listener: EventListener;
    options?: EventSubscriptionOptions;
}

/**
 * 事件总线服务
 */
@Service({ singleton: true })
export class EventBusService extends ServiceBase {
    // 事件发射器
    private readonly _onEventPublished = new Emitter<EventDefinition>();
    private readonly _onEventHandled = new Emitter<{ event: EventDefinition; listeners: number }>();

    /** 事件发布事件 */
    readonly onEventPublished = this._onEventPublished.event;

    /** 事件处理完成事件 */
    readonly onEventHandled = this._onEventHandled.event;

    /** 事件注册表 */
    private eventRegistry = new Map<string, Set<EventListener>>();

    /** 拦截器列表 */
    private interceptors: EventInterceptor[] = [];

    /** 事件历史 */
    private eventHistory: EventDefinition[] = [];
    private readonly historyLimit = 1000;

    /** 订阅列表 */
    private subscriptions = new Map<string, Subscription[]>();

    /**
     * 注册事件类型
     */
    registerEvent(eventType: { type: string; tags?: string[] }): void {
        if (!this.eventRegistry.has(eventType.type)) {
            this.eventRegistry.set(eventType.type, new Set());
        }
    }

    /**
     * 订阅事件
     */
    subscribe<T>(
        eventType: string,
        listener: EventListener<T>,
        options?: EventSubscriptionOptions
    ) {
        const subscription: Subscription = { eventType, listener, options };

        let subs = this.subscriptions.get(eventType);
        if (!subs) {
            subs = [];
            this.subscriptions.set(eventType, subs);
        }
        subs.push(subscription);

        // 确保事件已注册
        this.registerEvent({ type: eventType });

        return {
            dispose: () => {
                const index = subs?.indexOf(subscription);
                if (index !== undefined && index !== -1) {
                    subs?.splice(index, 1);
                }
            },
        };
    }

    /**
     * 发布事件
     */
    async publish<T>(event: Omit<EventDefinition<T>, 'timestamp' | 'eventId'>): Promise<void> {
        // 生成事件 ID 和时间戳
        const fullEvent: EventDefinition<T> = {
            ...event,
            eventId: this._generateEventId(),
            timestamp: Date.now(),
        };

        // 经过拦截器链
        let processedEvent: EventDefinition<T> | null = fullEvent;
        for (const interceptor of this.interceptors) {
            processedEvent = interceptor(processedEvent as EventDefinition);
            if (processedEvent === null) {
                return; // 被拦截器阻止
            }
        }

        // 触发 onEventPublished
        this._onEventPublished.fire(processedEvent);

        // 查找并调用监听器
        const listeners = this._getListenersForEvent(processedEvent);

        // 按优先级排序
        listeners.sort((a, b) => (b.options?.priority ?? 0) - (a.options?.priority ?? 0));

        // 调用监听器
        for (const subscription of listeners) {
            try {
                const result = subscription.listener(processedEvent);
                if (result instanceof Promise) {
                    // 异步监听器，不等待
                    result.catch((err) => {
                        console.error(`[EventBus] Listener error for ${processedEvent.type}:`, err);
                    });
                }
            } catch (err) {
                console.error(`[EventBus] Listener error for ${processedEvent.type}:`, err);
            }
        }

        // 触发 onEventHandled
        this._onEventHandled.fire({ event: processedEvent, listeners: listeners.length });

        // 记录历史
        this._addToHistory(processedEvent);
    }

    /**
     * 添加事件拦截器
     */
    addInterceptor(interceptor: EventInterceptor) {
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
    getHistory(options?: EventHistoryOptions): EventDefinition[] {
        let history = [...this.eventHistory];

        if (options?.type) {
            history = history.filter((e) => e.type === options.type);
        }
        if (options?.source) {
            history = history.filter((e) => e.source === options.source);
        }

        const limit = options?.limit ?? history.length;
        return history.slice(-limit);
    }

    /**
     * 清空历史
     */
    clearHistory(): void {
        this.eventHistory = [];
    }

    /**
     * 获取订阅者数量
     */
    getSubscriberCount(eventType: string): number {
        const subs = this.subscriptions.get(eventType);
        return subs ? subs.length : 0;
    }

    /**
     * 移除所有监听器
     */
    clearListeners(eventType?: string): void {
        if (eventType) {
            this.subscriptions.delete(eventType);
        } else {
            this.subscriptions.clear();
        }
    }

    override dispose(): void {
        this._onEventPublished.dispose();
        this._onEventHandled.dispose();
        this.eventRegistry.clear();
        this.interceptors = [];
        this.eventHistory = [];
        this.subscriptions.clear();
        super.dispose();
    }

    // ===== 私有方法 =====

    private _generateEventId(): string {
        return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    }

    private _getListenersForEvent(event: EventDefinition): Subscription[] {
        const allListeners = this.subscriptions.get(event.type) || [];

        // 应用过滤
        return allListeners.filter((sub) => {
            const opts = sub.options;
            if (!opts) return true;

            // 来源过滤
            if (opts.source && event.source !== opts.source) {
                return false;
            }

            // 标签过滤
            if (opts.tags && opts.tags.length > 0) {
                const eventTags = event.tags || [];
                return opts.tags.some((tag) => eventTags.includes(tag));
            }

            return true;
        });
    }

    private _addToHistory(event: EventDefinition): void {
        this.eventHistory.push(event);
        if (this.eventHistory.length > this.historyLimit) {
            this.eventHistory.shift(); // 移除最早的事件
        }
    }
}
```

- [ ] **Step 2: 创建服务测试**

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
            })
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
        eventBus.addInterceptor((event) => {
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

        eventBus.addInterceptor((event) => ({
            ...event,
            payload: { ...event.payload, modified: true },
        }));

        await eventBus.publish({ type: 'test.event', payload: { value: 'original' } });

        expect(mock).toHaveBeenCalledWith(
            expect.objectContaining({
                payload: expect.objectContaining({ modified: true }),
            })
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
            })
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
            })
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
            await new Promise((resolve) => setTimeout(resolve, 10));
        });

        eventBus.subscribe('test.event', mock);
        await eventBus.publish({ type: 'test.event', payload: {} });

        // 给异步操作一些时间
        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(mock).toHaveBeenCalledTimes(1);
    });
});
```

- [ ] **Step 3: 运行服务测试**

```bash
cd apps/web && npx vitest run src/platform/event-bus/__tests__/service.test.ts
```

Expected: PASS (14 tests)

- [ ] **Step 4: 提交**

```bash
git add apps/web/src/platform/event-bus/service.ts \
        apps/web/src/platform/event-bus/__tests__/service.test.ts
git commit -m "feat(event-bus): 实现事件总线核心服务"
```

---

### Task 3: 事件总线 - 导出和集成

**Files:**
- Create: `apps/web/src/platform/event-bus/index.ts`
- Modify: `apps/web/src/platform/bootstrap.ts`

- [ ] **Step 1: 创建统一导出**

```typescript
// apps/web/src/platform/event-bus/index.ts

// 服务
export { EventBusService } from './service';

// 类型
export type {
    EventDefinition,
    EventSubscriptionOptions,
    EventInterceptor,
    EventHistoryOptions,
} from './types';

// 预定义事件
export {
    SystemEvents,
    FileSystemEvents,
    EditorEvents,
} from './types';

// 错误
export {
    EventBusError,
    EventNotRegisteredError,
    EventTypeConflictError,
    EventInterceptorError,
} from './errors';
```

- [ ] **Step 2: 注册到 bootstrap**

```typescript
// apps/web/src/platform/bootstrap.ts
// 在 import 部分添加
import { EventBusService } from './event-bus';

// 在 AppServices 接口添加
export interface AppServices {
    // ... 现有服务
    eventBusService: EventBusService;
}

// 在 createServiceContainer 注册
export function createServiceContainer(): ServiceContainer {
    const container = new ServiceContainer();

    container.register(EventBusService);
    // ... 其他服务

    return container;
}
```

- [ ] **Step 3: 运行 TypeScript 检查**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: 无错误

- [ ] **Step 4: 运行所有事件总线测试**

```bash
cd apps/web && npx vitest run src/platform/event-bus/__tests__/
```

Expected: PASS (20 tests)

- [ ] **Step 5: 提交**

```bash
git add apps/web/src/platform/event-bus/index.ts \
        apps/web/src/platform/bootstrap.ts
git commit -m "feat(event-bus): 添加导出并注册到容器"
```

---

## 第二部分：CommandCenter

### Task 4: 命令中心 - 类型定义和错误类

**Files:**
- Create: `apps/web/src/platform/command-center/types.ts`
- Create: `apps/web/src/platform/command-center/errors.ts`
- Test: `apps/web/src/platform/command-center/__tests__/types.test.ts`
- Test: `apps/web/src/platform/command-center/__tests__/errors.test.ts`

- [ ] **Step 1: 创建命令类型定义**

```typescript
// apps/web/src/platform/command-center/types.ts

import type { FileNode } from '@/file-system/types';

/**
 * 命令上下文
 */
export interface CommandContext {
    /** 当前激活的文件 */
    activeFile?: FileNode;

    /** 当前选中的内容 */
    selection?: Selection;

    /** 用户权限级别 */
    permissions: string[];

    /** 自定义数据 */
    [key: string]: unknown;
}

/**
 * 选区定义
 */
export interface Selection {
    start: number;
    end: number;
}

/**
 * 命令定义
 */
export interface CommandDefinition {
    /** 命令 ID（唯一标识） */
    id: string;

    /** 命令标签（用于 UI 展示） */
    label?: string;

    /** 命令图标 */
    icon?: string;

    /** 命令分类 */
    category?: string;

    /** 快捷键绑定 */
    keybinding?: string;

    /** 命令是否可用 */
    enabled?: (context: CommandContext) => boolean;

    /** 命令可见性 */
    visible?: (context: CommandContext) => boolean;
}

/**
 * 命令处理器
 */
export interface CommandHandler<T = unknown, R = unknown> {
    /** 执行命令 */
    execute(args: T, context: CommandContext): Promise<R>;

    /** 撤销命令 */
    undo?(result: R, args: T, context: CommandContext): Promise<void>;

    /** 重做命令 */
    redo?(result: R, args: T, context: CommandContext): Promise<void>;
}

/**
 * 命令执行记录
 */
export interface CommandExecutionRecord {
    commandId: string;
    args: unknown;
    result: unknown;
    timestamp: number;
    undoable: boolean;
    undoData?: unknown;
}

/**
 * 命令宏定义
 */
export interface CommandMacro {
    id: string;
    commands: Array<{ id: string; args?: unknown }>;
}
```

- [ ] **Step 2: 创建预定义命令**

```typescript
// apps/web/src/platform/command-center/commands.ts

/**
 * 文件相关命令
 */
export namespace FileCommands {
    export const OPEN_FILE = 'file.open';
    export const SAVE_FILE = 'file.save';
    export const SAVE_ALL = 'file.saveAll';
    export const CLOSE_FILE = 'file.close';
    export const DELETE_FILE = 'file.delete';
    export const RENAME_FILE = 'file.rename';
}

/**
 * 编辑器相关命令
 */
export namespace EditorCommands {
    export const UNDO = 'editor.undo';
    export const REDO = 'editor.redo';
    export const CUT = 'editor.cut';
    export const COPY = 'editor.copy';
    export const PASTE = 'editor.paste';
    export const SELECT_ALL = 'editor.selectAll';
    export const FIND = 'editor.find';
    export const REPLACE = 'editor.replace';
}

/**
 * 视图相关命令
 */
export namespace ViewCommands {
    export const TOGGLE_SIDEBAR = 'view.toggleSidebar';
    export const TOGGLE_PANEL = 'view.togglePanel';
    export const ZOOM_IN = 'view.zoomIn';
    export const ZOOM_OUT = 'view.zoomOut';
    export const RESET_ZOOM = 'view.resetZoom';
}
```

- [ ] **Step 3: 运行 TypeScript 检查**

```bash
cd apps/web && npx tsc --noEmit src/platform/command-center/types.ts
```

Expected: 无错误

- [ ] **Step 4: 创建类型测试**

```typescript
// apps/web/src/platform/command-center/__tests__/types.test.ts
import { describe, it, expect } from 'vitest';
import { FileCommands, EditorCommands, ViewCommands } from '../commands';

describe('CommandCenter Types', () => {
    it('应正确定义文件命令', () => {
        expect(FileCommands.SAVE_FILE).toBe('file.save');
        expect(FileCommands.DELETE_FILE).toBe('file.delete');
    });

    it('应正确定义编辑器命令', () => {
        expect(EditorCommands.UNDO).toBe('editor.undo');
        expect(EditorCommands.REDO).toBe('editor.redo');
    });

    it('应正确定义视图命令', () => {
        expect(ViewCommands.TOGGLE_SIDEBAR).toBe('view.toggleSidebar');
        expect(ViewCommands.ZOOM_IN).toBe('view.zoomIn');
    });
});
```

- [ ] **Step 5: 运行类型测试**

```bash
cd apps/web && npx vitest run src/platform/command-center/__tests__/types.test.ts
```

Expected: PASS (3 tests)

- [ ] **Step 6: 创建错误类**

```typescript
// apps/web/src/platform/command-center/errors.ts

/**
 * 命令中心基础错误
 */
export class CommandCenterError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'CommandCenterError';
    }
}

/**
 * 命令未注册错误
 */
export class CommandNotRegisteredError extends CommandCenterError {
    constructor(commandId: string) {
        super(`Command "${commandId}" is not registered`);
        this.name = 'CommandNotRegisteredError';
    }
}

/**
 * 命令不可用错误
 */
export class CommandNotAvailableError extends CommandCenterError {
    constructor(commandId: string, reason?: string) {
        super(`Command "${commandId}" is not available${reason ? `: ${reason}` : ''}`);
        this.name = 'CommandNotAvailableError';
    }
}

/**
 * 命令执行失败错误
 */
export class CommandExecutionError extends CommandCenterError {
    constructor(commandId: string, cause: Error) {
        super(`Command "${commandId}" execution failed: ${cause.message}`);
        this.name = 'CommandExecutionError';
        this.cause = cause;
    }
}

/**
 * 命令未实现错误（不支持 Undo/Redo）
 */
export class CommandNotImplementedError extends CommandCenterError {
    constructor(commandId: string, operation: 'undo' | 'redo') {
        super(`Command "${commandId}" does not support ${operation}`);
        this.name = 'CommandNotImplementedError';
    }
}
```

- [ ] **Step 7: 创建错误测试**

```typescript
// apps/web/src/platform/command-center/__tests__/errors.test.ts
import { describe, it, expect } from 'vitest';
import {
    CommandCenterError,
    CommandNotRegisteredError,
    CommandNotAvailableError,
    CommandExecutionError,
    CommandNotImplementedError,
} from '../errors';

describe('CommandCenter Errors', () => {
    it('CommandCenterError 应有正确的 name', () => {
        const error = new CommandCenterError('test');
        expect(error.name).toBe('CommandCenterError');
    });

    it('CommandNotRegisteredError 应包含命令 ID', () => {
        const error = new CommandNotRegisteredError('test.cmd');
        expect(error.message).toContain('test.cmd');
        expect(error.name).toBe('CommandNotRegisteredError');
    });

    it('CommandNotAvailableError 应支持可选原因', () => {
        const error1 = new CommandNotAvailableError('test.cmd');
        const error2 = new CommandNotAvailableError('test.cmd', 'no permission');

        expect(error1.name).toBe('CommandNotAvailableError');
        expect(error2.message).toContain('no permission');
    });

    it('CommandExecutionError 应包含原始错误', () => {
        const cause = new Error('original error');
        const error = new CommandExecutionError('test.cmd', cause);

        expect(error.name).toBe('CommandExecutionError');
        expect(error.cause).toBe(cause);
    });

    it('CommandNotImplementedError 应包含操作类型', () => {
        const error = new CommandNotImplementedError('test.cmd', 'undo');
        expect(error.message).toContain('undo');
        expect(error.name).toBe('CommandNotImplementedError');
    });
});
```

- [ ] **Step 8: 运行错误测试**

```bash
cd apps/web && npx vitest run src/platform/command-center/__tests__/errors.test.ts
```

Expected: PASS (5 tests)

- [ ] **Step 9: 提交**

```bash
git add apps/web/src/platform/command-center/types.ts \
        apps/web/src/platform/command-center/commands.ts \
        apps/web/src/platform/command-center/errors.ts \
        apps/web/src/platform/command-center/__tests__/types.test.ts \
        apps/web/src/platform/command-center/__tests__/errors.test.ts
git commit -m "feat(command-center): 定义命令类型和错误类"
```

---

### Task 5: 命令中心 - 核心服务实现

**Files:**
- Create: `apps/web/src/platform/command-center/service.ts`
- Test: `apps/web/src/platform/command-center/__tests__/service.test.ts`

- [ ] **Step 1: 实现 CommandCenter 核心**

```typescript
// apps/web/src/platform/command-center/service.ts

import { Service, Inject } from '@/platform/di';
import { ServiceBase } from '@/platform/base/service-base';
import { Emitter } from '@/base/common/event';
import type {
    CommandDefinition,
    CommandHandler,
    CommandContext,
    CommandExecutionRecord,
    CommandMacro,
} from './types';
import { EventBusService } from '@/platform/event-bus';

@Service({ singleton: true })
export class CommandCenter extends ServiceBase {
    // 事件发射器
    private readonly _onCommandExecuted = new Emitter<{ commandId: string; result: unknown }>();
    private readonly _onWillExecute = new Emitter<{ commandId: string; args: unknown }>();

    /** 命令执行事件 */
    readonly onCommandExecuted = this._onCommandExecuted.event;

    /** 命令即将执行事件 */
    readonly onWillExecute = this._onWillExecute.event;

    /** 命令注册表 */
    private commands = new Map<
        string,
        CommandDefinition & { handler: CommandHandler }
    >();

    /** 命令历史 */
    private commandHistory: CommandExecutionRecord[] = [];
    private readonly historyLimit = 100;

    /** Undo/Redo 栈 */
    private undoStack: CommandExecutionRecord[] = [];
    private redoStack: CommandExecutionRecord[] = [];

    /** 命令宏 */
    private macros = new Map<string, CommandMacro>();

    /** 命令上下文 */
    private context: CommandContext = { permissions: [] };

    constructor(@Inject(EventBusService) private eventBus: EventBusService) {
        super();
    }

    /**
     * 注册命令
     */
    registerCommand<T, R>(
        definition: CommandDefinition,
        handler: CommandHandler<T, R>
    ) {
        this.commands.set(definition.id, {
            ...definition,
            handler: handler as CommandHandler,
        });

        return {
            dispose: () => {
                this.commands.delete(definition.id);
            },
        };
    }

    /**
     * 执行命令
     */
    async executeCommand<T, R>(
        commandId: string,
        args?: T,
        options: { recordHistory?: boolean; fireEvent?: boolean } = {}
    ): Promise<R> {
        const { recordHistory = false, fireEvent = true } = options;

        const command = this.commands.get(commandId);
        if (!command) {
            throw new Error(`Command "${commandId}" is not registered`);
        }

        // 检查命令是否可用
        if (command.enabled && !command.enabled(this.context)) {
            throw new Error(`Command "${commandId}" is not enabled`);
        }

        // 触发 onWillExecute
        if (fireEvent) {
            this._onWillExecute.fire({ commandId, args: args as unknown });
        }

        // 执行命令
        try {
            const result = await command.handler.execute(
                args as T,
                this.context
            );

            // 记录历史（如果可撤销）
            if (recordHistory) {
                const record: CommandExecutionRecord = {
                    commandId,
                    args: args as unknown,
                    result,
                    timestamp: Date.now(),
                    undoable: !!command.handler.undo,
                };
                this.commandHistory.push(record);
                this.undoStack.push(record);
                this.redoStack = []; // 清空 redo 栈

                // 限制历史记录数量
                if (this.commandHistory.length > this.historyLimit) {
                    this.commandHistory.shift();
                }
            }

            // 触发 onCommandExecuted
            if (fireEvent) {
                this._onCommandExecuted.fire({ commandId, result });

                // 发布到事件总线
                this.eventBus.publish({
                    type: 'command/executed',
                    source: 'commandCenter',
                    payload: { commandId, result },
                });
            }

            return result as R;
        } catch (error) {
            throw error;
        }
    }

    /**
     * 撤销
     */
    async undo(): Promise<void> {
        const record = this.undoStack.pop();
        if (!record) {
            return;
        }

        const command = this.commands.get(record.commandId);
        if (!command || !command.handler.undo) {
            return;
        }

        await command.handler.undo(
            record.result as never,
            record.args as never,
            this.context
        );

        this.redoStack.push(record);
    }

    /**
     * 重做
     */
    async redo(): Promise<void> {
        const record = this.redoStack.pop();
        if (!record) {
            return;
        }

        const command = this.commands.get(record.commandId);
        if (!command || !command.handler.redo) {
            // 如果没有 redo，重新执行 execute
            if (command) {
                await command.handler.execute(
                    record.args as never,
                    this.context
                );
            }
            this.undoStack.push(record);
            return;
        }

        await command.handler.redo(
            record.result as never,
            record.args as never,
            this.context
        );

        this.undoStack.push(record);
    }

    /**
     * 获取 Undo 数量
     */
    getUndoCount(): number {
        return this.undoStack.length;
    }

    /**
     * 获取 Redo 数量
     */
    getRedoCount(): number {
        return this.redoStack.length;
    }

    /**
     * 获取命令历史
     */
    getHistory(limit?: number): CommandExecutionRecord[] {
        const lim = limit ?? this.commandHistory.length;
        return this.commandHistory.slice(-lim);
    }

    /**
     * 清空历史
     */
    clearHistory(): void {
        this.commandHistory = [];
        this.undoStack = [];
        this.redoStack = [];
    }

    /**
     * 检查命令是否可用
     */
    isCommandEnabled(commandId: string): boolean {
        const command = this.commands.get(commandId);
        if (!command) return false;
        if (command.enabled) return command.enabled(this.context);
        return true;
    }

    /**
     * 检查命令是否可见
     */
    isCommandVisible(commandId: string): boolean {
        const command = this.commands.get(commandId);
        if (!command) return false;
        if (command.visible) return command.visible(this.context);
        return true;
    }

    /**
     * 获取所有已注册命令
     */
    getRegisteredCommands(): CommandDefinition[] {
        return Array.from(this.commands.values());
    }

    /**
     * 获取命令定义
     */
    getCommand(commandId: string): CommandDefinition | undefined {
        return this.commands.get(commandId);
    }

    /**
     * 更新命令上下文
     */
    updateContext(updates: Partial<CommandContext>): void {
        this.context = { ...this.context, ...updates };
    }

    /**
     * 创建宏
     */
    createMacro(macroId: string, commands: Array<{ id: string; args?: unknown }>): void {
        this.macros.set(macroId, { id: macroId, commands });
    }

    /**
     * 执行宏
     */
    async executeMacro(macroId: string): Promise<void> {
        const macro = this.macros.get(macroId);
        if (!macro) {
            throw new Error(`Macro "${macroId}" is not defined`);
        }

        for (const cmd of macro.commands) {
            await this.executeCommand(cmd.id, cmd.args);
        }
    }

    override dispose(): void {
        this._onCommandExecuted.dispose();
        this._onWillExecute.dispose();
        this.commands.clear();
        this.commandHistory = [];
        this.undoStack = [];
        this.redoStack = [];
        this.macros.clear();
        super.dispose();
    }
}
```

- [ ] **Step 2: 创建服务测试**

```typescript
// apps/web/src/platform/command-center/__tests__/service.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CommandCenter } from '../service';
import type { CommandHandler } from '../types';

describe('CommandCenter', () => {
    let commandCenter: CommandCenter;
    let mockEventBus: any;

    beforeEach(() => {
        mockEventBus = {
            publish: vi.fn(),
            dispose: vi.fn(),
        };
        commandCenter = new CommandCenter(mockEventBus);
    });

    afterEach(() => {
        commandCenter.dispose();
    });

    it('应成功创建实例', () => {
        expect(commandCenter).toBeDefined();
    });

    it('应注册和执行命令', async () => {
        const handler: CommandHandler = {
            execute: vi.fn().mockResolvedValue({ success: true }),
        };

        commandCenter.registerCommand({ id: 'test.cmd' }, handler);

        const result = await commandCenter.executeCommand('test.cmd');

        expect(result).toEqual({ success: true });
        expect(handler.execute).toHaveBeenCalled();
    });

    it('应检查命令可用性', async () => {
        const handler: CommandHandler = {
            execute: vi.fn().mockResolvedValue({}),
            enabled: (ctx) => ctx.permissions.includes('test.permission'),
        };

        commandCenter.registerCommand({ id: 'test.cmd' }, handler);

        // 没有权限时不可用
        expect(commandCenter.isCommandEnabled('test.cmd')).toBe(false);

        // 添加权限后可用
        commandCenter.updateContext({ permissions: ['test.permission'] });
        expect(commandCenter.isCommandEnabled('test.cmd')).toBe(true);
    });

    it('应支持 Undo/Redo', async () => {
        let state = 0;

        const handler: CommandHandler = {
            execute: async () => {
                state++;
                return state;
            },
            undo: async () => {
                state--;
            },
            redo: async () => {
                state++;
            },
        };

        commandCenter.registerCommand({ id: 'increment' }, handler);

        await commandCenter.executeCommand('increment', undefined, { recordHistory: true });
        expect(state).toBe(1);
        expect(commandCenter.getUndoCount()).toBe(1);

        await commandCenter.undo();
        expect(state).toBe(0);
        expect(commandCenter.getUndoCount()).toBe(0);
        expect(commandCenter.getRedoCount()).toBe(1);

        await commandCenter.redo();
        expect(state).toBe(1);
        expect(commandCenter.getRedoCount()).toBe(0);
    });

    it('应触发 onWillExecute 事件', async () => {
        const mock = vi.fn();
        commandCenter.onWillExecute(mock);

        const handler: CommandHandler = {
            execute: vi.fn().mockResolvedValue({}),
        };
        commandCenter.registerCommand({ id: 'test.cmd' }, handler);

        await commandCenter.executeCommand('test.cmd', { value: 'test' });

        expect(mock).toHaveBeenCalledWith({
            commandId: 'test.cmd',
            args: { value: 'test' },
        });
    });

    it('应触发 onCommandExecuted 事件', async () => {
        const mock = vi.fn();
        commandCenter.onCommandExecuted(mock);

        const handler: CommandHandler = {
            execute: vi.fn().mockResolvedValue({ result: 'ok' }),
        };
        commandCenter.registerCommand({ id: 'test.cmd' }, handler);

        await commandCenter.executeCommand('test.cmd');

        expect(mock).toHaveBeenCalledWith({
            commandId: 'test.cmd',
            result: { result: 'ok' },
        });
    });

    it'应记录命令历史', async () => {
        const handler: CommandHandler = {
            execute: vi.fn().mockResolvedValue({}),
        };
        commandCenter.registerCommand({ id: 'test.cmd' }, handler);

        await commandCenter.executeCommand('test.cmd', { first: true }, { recordHistory: true });
        await commandCenter.executeCommand('test.cmd', { second: true }, { recordHistory: true });

        const history = commandCenter.getHistory();
        expect(history.length).toBe(2);
    });

    it'应清空历史', async () => {
        const handler: CommandHandler = {
            execute: vi.fn().mockResolvedValue({}),
        };
        commandCenter.registerCommand({ id: 'test.cmd' }, handler);

        await commandCenter.executeCommand('test.cmd', {}, { recordHistory: true });
        commandCenter.clearHistory();

        expect(commandCenter.getHistory().length).toBe(0);
        expect(commandCenter.getUndoCount()).toBe(0);
    });

    it'应创建和执行宏', async () => {
        const cmd1Handler: CommandHandler = { execute: vi.fn().mockResolvedValue({ cmd: 1 }) };
        const cmd2Handler: CommandHandler = { execute: vi.fn().mockResolvedValue({ cmd: 2 }) };

        commandCenter.registerCommand({ id: 'cmd1' }, cmd1Handler);
        commandCenter.registerCommand({ id: 'cmd2' }, cmd2Handler);

        commandCenter.createMacro('testMacro', [
            { id: 'cmd1', args: { value: 1 } },
            { id: 'cmd2', args: { value: 2 } },
        ]);

        await commandCenter.executeMacro('testMacro');

        expect(cmd1Handler.execute).toHaveBeenCalledWith({ value: 1 }, expect.anything());
        expect(cmd2Handler.execute).toHaveBeenCalledWith({ value: 2 }, expect.anything());
    });

    it'应获取已注册命令', () => {
        commandCenter.registerCommand({ id: 'cmd1', label: 'Command 1' }, {
            execute: vi.fn(),
        });

        const commands = commandCenter.getRegisteredCommands();
        expect(commands.length).toBe(1);
        expect(commands[0].id).toBe('cmd1');
    });
});
```

- [ ] **Step 3: 运行服务测试**

```bash
cd apps/web && npx vitest run src/platform/command-center/__tests__/service.test.ts
```

Expected: PASS (10 tests)

- [ ] **Step 4: 提交**

```bash
git add apps/web/src/platform/command-center/service.ts \
        apps/web/src/platform/command-center/__tests__/service.test.ts
git commit -m "feat(command-center): 实现命令中心核心服务"
```

---

### Task 6: 命令中心 - 导出和集成

**Files:**
- Create: `apps/web/src/platform/command-center/index.ts`
- Modify: `apps/web/src/platform/bootstrap.ts`

- [ ] **Step 1: 创建统一导出**

```typescript
// apps/web/src/platform/command-center/index.ts

// 服务
export { CommandCenter } from './service';

// 类型
export type {
    CommandDefinition,
    CommandHandler,
    CommandContext,
    CommandExecutionRecord,
    CommandMacro,
    Selection,
} from './types';

// 预定义命令
export {
    FileCommands,
    EditorCommands,
    ViewCommands,
} from './commands';

// 错误
export {
    CommandCenterError,
    CommandNotRegisteredError,
    CommandNotAvailableError,
    CommandExecutionError,
    CommandNotImplementedError,
} from './errors';
```

- [ ] **Step 2: 注册到 bootstrap**

```typescript
// apps/web/src/platform/bootstrap.ts
// 添加 import
import { CommandCenter } from './command-center';

// 添加到 AppServices 接口
export interface AppServices {
    // ... 现有服务
    eventBusService: EventBusService;
    commandCenter: CommandCenter;
}

// 在 createServiceContainer 注册
container.register(CommandCenter);
```

- [ ] **Step 3: 运行 TypeScript 检查**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: 无错误

- [ ] **Step 4: 运行所有命令中心测试**

```bash
cd apps/web && npx vitest run src/platform/command-center/__tests__/
```

Expected: PASS (18 tests)

- [ ] **Step 5: 提交**

```bash
git add apps/web/src/platform/command-center/index.ts \
        apps/web/src/platform/bootstrap.ts
git commit -m "feat(command-center): 添加导出并注册到容器"
```

---

## 第三部分：MessageChannelService

### Task 7: 消息通道 - 类型定义和错误类

**Files:**
- Create: `apps/web/src/platform/message-channel/types.ts`
- Create: `apps/web/src/platform/message-channel/errors.ts`
- Test: `apps/web/src/platform/message-channel/__tests__/types.test.ts`
- Test: `apps/web/src/platform/message-channel/__tests__/errors.test.ts`

- [ ] **Step 1: 创建消息类型定义**

```typescript
// apps/web/src/platform/message-channel/types.ts

/**
 * 消息定义
 */
export interface Message<T = unknown> {
    /** 消息 ID（唯一） */
    id: string;

    /** 消息类型 */
    type: string;

    /** 发送者 ID */
    sender: string;

    /** 接收者 ID */
    receiver: string;

    /** 消息数据 */
    payload: T;

    /** 时间戳 */
    timestamp: number;

    /** 相关消息 ID（用于请求 - 响应关联） */
    correlationId?: string;

    /** 是否需要确认 */
    requireAck?: boolean;

    /** 超时时间（毫秒） */
    timeout?: number;
}

/**
 * 消息响应
 */
export interface MessageResponse<R = unknown> {
    /** 相关消息 ID */
    correlationId: string;

    /** 响应数据 */
    data?: R;

    /** 错误信息 */
    error?: Error;

    /** 响应时间 */
    timestamp: number;
}

/**
 * 消息处理器
 */
export type MessageHandler<T = unknown, R = unknown> = (
    message: Message<T>,
    context: MessageContext
) => Promise<R>;

/**
 * 消息上下文
 */
export interface MessageContext {
    /** 发送者 ID */
    sender: string;

    /** 通道 ID */
    channelId: string;

    /** 自定义数据 */
    [key: string]: unknown;
}

/**
 * 消息通道配置
 */
export interface ChannelConfig {
    /** 通道 ID */
    id: string;

    /** 通道类型 */
    type: 'local' | 'worker' | 'broadcast';

    /** 是否持久化 */
    persistent?: boolean;

    /** 确认超时（毫秒） */
    ackTimeout?: number;

    /** 重试次数 */
    maxRetries?: number;
}
```

- [ ] **Step 2: 运行 TypeScript 检查**

```bash
cd apps/web && npx tsc --noEmit src/platform/message-channel/types.ts
```

Expected: 无错误

- [ ] **Step 3: 创建类型测试**

```typescript
// apps/web/src/platform/message-channel/__tests__/types.test.ts
import { describe, it, expect } from 'vitest';
import type { Message, ChannelConfig } from '../types';

describe('MessageChannel Types', () => {
    it'应正确定义消息结构', () => {
        const message: Message = {
            id: 'msg-1',
            type: 'test.message',
            sender: 'sender-1',
            receiver: 'receiver-1',
            payload: { value: 'test' },
            timestamp: Date.now(),
        };

        expect(message.id).toBe('msg-1');
        expect(message.type).toBe('test.message');
    });

    it'应正确定义通道配置', () => {
        const config: ChannelConfig = {
            id: 'test-channel',
            type: 'local',
            persistent: false,
            ackTimeout: 5000,
            maxRetries: 3,
        };

        expect(config.id).toBe('test-channel');
        expect(config.type).toBe('local');
    });
});
```

- [ ] **Step 4: 运行类型测试**

```bash
cd apps/web && npx vitest run src/platform/message-channel/__tests__/types.test.ts
```

Expected: PASS (2 tests)

- [ ] **Step 5: 创建错误类**

```typescript
// apps/web/src/platform/message-channel/errors.ts

/**
 * 消息通道基础错误
 */
export class MessageChannelError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'MessageChannelError';
    }
}

/**
 * 通道不存在错误
 */
export class ChannelNotFoundError extends MessageChannelError {
    constructor(channelId: string) {
        super(`Channel "${channelId}" not found`);
        this.name = 'ChannelNotFoundError';
    }
}

/**
 * 消息超时错误
 */
export class MessageTimeoutError extends MessageChannelError {
    constructor(messageId: string, timeout: number) {
        super(`Message "${messageId}" timed out after ${timeout}ms`);
        this.name = 'MessageTimeoutError';
    }
}

/**
 * 消息发送失败错误
 */
export class MessageSendError extends MessageChannelError {
    constructor(messageId: string, reason: string) {
        super(`Failed to send message "${messageId}": ${reason}`);
        this.name = 'MessageSendError';
    }
}

/**
 * 接收者不存在错误
 */
export class ReceiverNotFoundError extends MessageChannelError {
    constructor(receiverId: string) {
        super(`Receiver "${receiverId}" not found`);
        this.name = 'ReceiverNotFoundError';
    }
}
```

- [ ] **Step 6: 创建错误测试**

```typescript
// apps/web/src/platform/message-channel/__tests__/errors.test.ts
import { describe, it, expect } from 'vitest';
import {
    MessageChannelError,
    ChannelNotFoundError,
    MessageTimeoutError,
    MessageSendError,
    ReceiverNotFoundError,
} from '../errors';

describe('MessageChannel Errors', () => {
    it('MessageChannelError 应有正确的 name', () => {
        const error = new MessageChannelError('test');
        expect(error.name).toBe('MessageChannelError');
    });

    it('ChannelNotFoundError 应包含通道 ID', () => {
        const error = new ChannelNotFoundError('test-channel');
        expect(error.message).toContain('test-channel');
        expect(error.name).toBe('ChannelNotFoundError');
    });

    it('MessageTimeoutError 应包含超时信息', () => {
        const error = new MessageTimeoutError('msg-1', 5000);
        expect(error.message).toContain('5000ms');
        expect(error.name).toBe('MessageTimeoutError');
    });

    it('MessageSendError 应包含失败原因', () => {
        const error = new MessageSendError('msg-1', 'network error');
        expect(error.message).toContain('network error');
        expect(error.name).toBe('MessageSendError');
    });

    it('ReceiverNotFoundError 应包含接收者 ID', () => {
        const error = new ReceiverNotFoundError('receiver-1');
        expect(error.message).toContain('receiver-1');
        expect(error.name).toBe('ReceiverNotFoundError');
    });
});
```

- [ ] **Step 7: 运行错误测试**

```bash
cd apps/web && npx vitest run src/platform/message-channel/__tests__/errors.test.ts
```

Expected: PASS (5 tests)

- [ ] **Step 8: 提交**

```bash
git add apps/web/src/platform/message-channel/types.ts \
        apps/web/src/platform/message-channel/errors.ts \
        apps/web/src/platform/message-channel/__tests__/types.test.ts \
        apps/web/src/platform/message-channel/__tests__/errors.test.ts
git commit -m "feat(message-channel): 定义消息类型和错误类"
```

---

### Task 8: 消息通道 - 核心服务实现

**Files:**
- Create: `apps/web/src/platform/message-channel/service.ts`
- Create: `apps/web/src/platform/message-channel/adapters/worker-adapter.ts`
- Test: `apps/web/src/platform/message-channel/__tests__/service.test.ts`
- Test: `apps/web/src/platform/message-channel/__tests__/worker-adapter.test.ts`

- [ ] **Step 1: 实现 MessageChannelService 核心**

```typescript
// apps/web/src/platform/message-channel/service.ts

import { Service, Inject } from '@/platform/di';
import { ServiceBase } from '@/platform/base/service-base';
import { Emitter } from '@/base/common/event';
import type {
    Message,
    MessageResponse,
    MessageHandler,
    MessageContext,
    ChannelConfig,
} from './types';
import { EventBusService } from '@/platform/event-bus';

type PendingRequest = {
    resolve: (response: unknown) => void;
    reject: (error: Error) => void;
    timeout: number;
};

@Service({ singleton: true })
export class MessageChannelService extends ServiceBase {
    // 事件发射器
    private readonly _onMessageReceived = new Emitter<Message>();
    private readonly _onMessageSent = new Emitter<Message>();

    /** 消息接收事件 */
    readonly onMessageReceived = this._onMessageReceived.event;

    /** 消息发送事件 */
    readonly onMessageSent = this._onMessageSent.event;

    /** 通道注册表 */
    private channels = new Map<string, ChannelConfig>();

    /** 消息处理器注册表 */
    private handlers = new Map<string, MessageHandler>();

    /** 待处理的请求 */
    private pendingRequests = new Map<string, PendingRequest>();

    /** 消息队列 */
    private messageQueue: Message[] = [];
    private readonly queueLimit = 1000;

    constructor(@Inject(EventBusService) private eventBus: EventBusService) {
        super();
    }

    /**
     * 创建通道
     */
    createChannel(config: ChannelConfig) {
        this.channels.set(config.id, config);

        return {
            dispose: () => {
                this.channels.delete(config.id);
            },
        };
    }

    /**
     * 注册消息处理器
     */
    registerHandler<T, R>(messageType: string, handler: MessageHandler<T, R>) {
        this.handlers.set(messageType, handler as MessageHandler);

        return {
            dispose: () => {
                this.handlers.delete(messageType);
            },
        };
    }

    /**
     * 发送消息（不等待响应）
     */
    send<T>(message: Omit<Message<T>, 'id' | 'timestamp'>) {
        const fullMessage: Message<T> = {
            ...message,
            id: this._generateMessageId(),
            timestamp: Date.now(),
        };

        // 添加到队列
        this._addToQueue(fullMessage);

        // 触发本地处理器
        this._dispatchToLocalHandler(fullMessage);

        // 触发 onMessageSent
        this._onMessageSent.fire(fullMessage as Message);

        return fullMessage;
    }

    /**
     * 发送消息并等待响应
     */
    request<T, R>(message: Omit<Message<T>, 'id' | 'timestamp'>): Promise<R> {
        const fullMessage = this.send(message);

        return new Promise((resolve, reject) => {
            const timeout = message.timeout ?? 30000;

            // 注册待处理请求
            this.pendingRequests.set(fullMessage.id, {
                resolve,
                reject,
                timeout,
            });

            // 设置超时
            setTimeout(() => {
                const pending = this.pendingRequests.get(fullMessage.id);
                if (pending) {
                    this.pendingRequests.delete(fullMessage.id);
                    reject(new Error(`Request timeout after ${timeout}ms`));
                }
            }, timeout);
        });
    }

    /**
     * 回复消息
     */
    reply<R>(originalMessage: Message, response: R) {
        const replyMessage: Message<MessageResponse<R>> = {
            id: this._generateMessageId(),
            type: `${originalMessage.type}/response`,
            sender: originalMessage.receiver,
            receiver: originalMessage.sender,
            correlationId: originalMessage.id,
            payload: {
                correlationId: originalMessage.id,
                data: response,
                timestamp: Date.now(),
            },
            timestamp: Date.now(),
        };

        this.send(replyMessage);
    }

    /**
     * 广播消息
     */
    broadcast<T>(message: Omit<Message<T>, 'id' | 'timestamp' | 'receiver'>) {
        for (const [channelId] of this.channels) {
            this.send({
                ...message,
                receiver: channelId,
            });
        }
    }

    /**
     * 获取消息历史
     */
    getHistory(options?: {
        sender?: string;
        receiver?: string;
        type?: string;
        limit?: number;
    }): Message[] {
        let history = [...this.messageQueue];

        if (options?.sender) {
            history = history.filter((m) => m.sender === options.sender);
        }
        if (options?.receiver) {
            history = history.filter((m) => m.receiver === options.receiver);
        }
        if (options?.type) {
            history = history.filter((m) => m.type === options.type);
        }

        const limit = options?.limit ?? history.length;
        return history.slice(-limit);
    }

    /**
     * 清理过期请求
     */
    cleanupPendingRequests(): void {
        const now = Date.now();
        for (const [id, request] of this.pendingRequests.entries()) {
            if (now > request.timeout) {
                this.pendingRequests.delete(id);
                request.reject(new Error('Request timeout'));
            }
        }
    }

    override dispose(): void {
        this._onMessageReceived.dispose();
        this._onMessageSent.dispose();
        this.channels.clear();
        this.handlers.clear();
        this.pendingRequests.clear();
        this.messageQueue = [];
        super.dispose();
    }

    // ===== 私有方法 =====

    private _generateMessageId(): string {
        return `msg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    }

    private _addToQueue(message: Message): void {
        this.messageQueue.push(message);
        if (this.messageQueue.length > this.queueLimit) {
            this.messageQueue.shift();
        }
    }

    private _dispatchToLocalHandler(message: Message): void {
        const handler = this.handlers.get(message.type);
        if (!handler) {
            return;
        }

        const context: MessageContext = {
            sender: message.sender,
            channelId: message.receiver,
        };

        Promise.resolve()
            .then(() => handler(message, context))
            .then((result) => {
                // 如果有 correlationId，说明是请求 - 响应模式
                if (message.correlationId) {
                    this._resolvePendingRequest(message.correlationId, result);
                }
            })
            .catch((error) => {
                if (message.correlationId) {
                    this._rejectPendingRequest(message.correlationId, error);
                }
                console.error(`[MessageChannel] Handler error for ${message.type}:`, error);
            });

        // 触发 onMessageReceived
        this._onMessageReceived.fire(message);
    }

    private _resolvePendingRequest(messageId: string, result: unknown): void {
        const pending = this.pendingRequests.get(messageId);
        if (pending) {
            this.pendingRequests.delete(messageId);
            pending.resolve(result);
        }
    }

    private _rejectPendingRequest(messageId: string, error: Error): void {
        const pending = this.pendingRequests.get(messageId);
        if (pending) {
            this.pendingRequests.delete(messageId);
            pending.reject(error);
        }
    }
}
```

- [ ] **Step 2: 创建 Worker 适配器**

```typescript
// apps/web/src/platform/message-channel/adapters/worker-adapter.ts

import type { Message } from '../types';

/**
 * Worker 通信适配器
 */
export class WorkerAdapter {
    private worker: Worker;
    private channelId: string;
    private onMessageCallback?: (message: Message) => void;

    constructor(worker: Worker, channelId: string) {
        this.worker = worker;
        this.channelId = channelId;

        // 监听 Worker 消息
        this.worker.onmessage = (event) => {
            const message = event.data as Message;
            this.onMessageCallback?.(message);
        };
    }

    /**
     * 设置消息回调
     */
    onMessage(callback: (message: Message) => void): void {
        this.onMessageCallback = callback;
    }

    /**
     * 发送消息到 Worker
     */
    postMessage<T>(message: Message<T>): void {
        this.worker.postMessage(message);
    }

    /**
     * 终止 Worker
     */
    terminate(): void {
        this.worker.terminate();
    }
}
```

- [ ] **Step 3: 创建服务测试**

```typescript
// apps/web/src/platform/message-channel/__tests__/service.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MessageChannelService } from '../service';

describe('MessageChannelService', () => {
    let service: MessageChannelService;
    let mockEventBus: any;

    beforeEach(() => {
        mockEventBus = {
            publish: vi.fn(),
            dispose: vi.fn(),
        };
        service = new MessageChannelService(mockEventBus);
    });

    afterEach(() => {
        service.dispose();
    });

    it('应成功创建实例', () => {
        expect(service).toBeDefined();
    });

    it('应创建通道', () => {
        const disposable = service.createChannel({
            id: 'test-channel',
            type: 'local',
        });

        expect(disposable).toBeDefined();
        disposable.dispose();
    });

    it('应注册消息处理器', () => {
        const handler = vi.fn().mockResolvedValue({ result: 'ok' });
        const disposable = service.registerHandler('test.message', handler);

        expect(disposable).toBeDefined();
        disposable.dispose();
    });

    it('应发送消息', () => {
        const mock = vi.fn();
        service.onMessageReceived(mock);

        service.registerHandler('test.message', vi.fn().mockResolvedValue({}));

        service.send({
            type: 'test.message',
            sender: 'test',
            receiver: 'main',
            payload: {},
        });

        expect(mock).toHaveBeenCalledWith(
            expect.objectContaining({
                type: 'test.message',
            })
        );
    });

    it'应支持请求 - 响应', async () => {
        service.registerHandler('echo', async (msg) => ({
            echo: msg.payload,
        }));

        const response = await service.request({
            type: 'echo',
            sender: 'test',
            receiver: 'main',
            payload: { value: 'hello' },
        });

        expect(response).toEqual({ echo: { value: 'hello' } });
    });

    it'应处理请求超时', async () => {
        service.registerHandler('slow', async () => {
            await new Promise((r) => setTimeout(r, 100));
            return {};
        });

        await expect(
            service.request({
                type: 'slow',
                sender: 'test',
                receiver: 'main',
                payload: {},
                timeout: 10,
            })
        ).rejects.toThrow('timeout');
    });

    it'应支持消息历史', () => {
        service.send({ type: 'msg1', sender: 'a', receiver: 'b', payload: {} });
        service.send({ type: 'msg2', sender: 'a', receiver: 'b', payload: {} });
        service.send({ type: 'msg1', sender: 'c', receiver: 'b', payload: {} });

        const history = service.getHistory({ type: 'msg1' });
        expect(history.length).toBe(2);

        const senderHistory = service.getHistory({ sender: 'a' });
        expect(senderHistory.length).toBe(2);
    });

    it'应触发 onMessageSent 事件', () => {
        const mock = vi.fn();
        service.onMessageSent(mock);

        service.send({
            type: 'test.message',
            sender: 'test',
            receiver: 'main',
            payload: {},
        });

        expect(mock).toHaveBeenCalledWith(
            expect.objectContaining({
                type: 'test.message',
            })
        );
    });
});
```

- [ ] **Step 4: 运行服务测试**

```bash
cd apps/web && npx vitest run src/platform/message-channel/__tests__/service.test.ts
```

Expected: PASS (8 tests)

- [ ] **Step 5: 创建 Worker 适配器测试**

```typescript
// apps/web/src/platform/message-channel/__tests__/worker-adapter.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WorkerAdapter } from '../adapters/worker-adapter';

describe('WorkerAdapter', () => {
    let mockWorker: any;
    let adapter: WorkerAdapter;

    beforeEach(() => {
        mockWorker = {
            postMessage: vi.fn(),
            terminate: vi.fn(),
            onmessage: null as ((event: any) => void) | null,
        };
        adapter = new WorkerAdapter(mockWorker, 'test-worker');
    });

    it('应成功创建实例', () => {
        expect(adapter).toBeDefined();
    });

    it'应设置消息回调', () => {
        const mock = vi.fn();
        adapter.onMessage(mock);

        // 模拟 Worker 消息
        mockWorker.onmessage?.({ data: { type: 'test', payload: {} } });

        expect(mock).toHaveBeenCalledWith({ type: 'test', payload: {} });
    });

    it'应发送消息到 Worker', () => {
        adapter.postMessage({
            id: 'msg-1',
            type: 'test.message',
            sender: 'main',
            receiver: 'worker',
            payload: { value: 'test' },
            timestamp: Date.now(),
        });

        expect(mockWorker.postMessage).toHaveBeenCalled();
    });

    it'应终止 Worker', () => {
        adapter.terminate();
        expect(mockWorker.terminate).toHaveBeenCalled();
    });
});
```

- [ ] **Step 6: 运行 Worker 适配器测试**

```bash
cd apps/web && npx vitest run src/platform/message-channel/__tests__/worker-adapter.test.ts
```

Expected: PASS (4 tests)

- [ ] **Step 7: 提交**

```bash
git add apps/web/src/platform/message-channel/service.ts \
        apps/web/src/platform/message-channel/adapters/worker-adapter.ts \
        apps/web/src/platform/message-channel/__tests__/service.test.ts \
        apps/web/src/platform/message-channel/__tests__/worker-adapter.test.ts
git commit -m "feat(message-channel): 实现消息通道核心服务"
```

---

### Task 9: 消息通道 - 导出和集成

**Files:**
- Create: `apps/web/src/platform/message-channel/index.ts`
- Modify: `apps/web/src/platform/bootstrap.ts`

- [ ] **Step 1: 创建统一导出**

```typescript
// apps/web/src/platform/message-channel/index.ts

// 服务
export { MessageChannelService } from './service';

// 适配器
export { WorkerAdapter } from './adapters/worker-adapter';

// 类型
export type {
    Message,
    MessageResponse,
    MessageHandler,
    MessageContext,
    ChannelConfig,
} from './types';

// 错误
export {
    MessageChannelError,
    ChannelNotFoundError,
    MessageTimeoutError,
    MessageSendError,
    ReceiverNotFoundError,
} from './errors';
```

- [ ] **Step 2: 注册到 bootstrap**

```typescript
// apps/web/src/platform/bootstrap.ts
// 添加 import
import { MessageChannelService } from './message-channel';

// 添加到 AppServices 接口
export interface AppServices {
    // ... 现有服务
    eventBusService: EventBusService;
    commandCenter: CommandCenter;
    messageChannelService: MessageChannelService;
}

// 在 createServiceContainer 注册
container.register(MessageChannelService);
```

- [ ] **Step 3: 运行 TypeScript 检查**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: 无错误

- [ ] **Step 4: 运行所有消息通道测试**

```bash
cd apps/web && npx vitest run src/platform/message-channel/__tests__/
```

Expected: PASS (12 tests)

- [ ] **Step 5: 提交**

```bash
git add apps/web/src/platform/message-channel/index.ts \
        apps/web/src/platform/bootstrap.ts
git commit -m "feat(message-channel): 添加导出并注册到容器"
```

---

## 最终验证

- [ ] **Step 1: 运行所有新服务测试**

```bash
cd apps/web && npx vitest run src/platform/event-bus/__tests__/ \
                     src/platform/command-center/__tests__/ \
                     src/platform/message-channel/__tests__/
```

Expected: PASS (50 tests)

- [ ] **Step 2: 运行 TypeScript 全量检查**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: 无错误

- [ ] **Step 3: 运行 Biome 代码检查**

```bash
cd apps/web && npx biome check --write src/platform/event-bus/ \
                                  src/platform/command-center/ \
                                  src/platform/message-channel/
```

Expected: 无错误

- [ ] **Step 4: 提交最终版本**

```bash
git add apps/web/src/platform/
git commit -m "feat(infra): 完成基础设施服务第四批实现"
```

---

## 提交历史摘要

### EventBusService
1. `feat(event-bus): 定义事件类型和错误类`
2. `feat(event-bus): 实现事件总线核心服务`
3. `feat(event-bus): 添加导出并注册到容器`

### CommandCenter
4. `feat(command-center): 定义命令类型和错误类`
5. `feat(command-center): 实现命令中心核心服务`
6. `feat(command-center): 添加导出并注册到容器`

### MessageChannelService
7. `feat(message-channel): 定义消息类型和错误类`
8. `feat(message-channel): 实现消息通道核心服务`
9. `feat(message-channel): 添加导出并注册到容器`

### Final
10. `feat(infra): 完成基础设施服务第四批实现`

---

## 测试覆盖目标

- [ ] 事件总线基本发布/订阅
- [ ] 事件总线优先级订阅
- [ ] 事件总线过滤（来源/标签）
- [ ] 事件总线拦截器
- [ ] 事件总线历史记录
- [ ] 命令中心注册和执行
- [ ] 命令中心 Undo/Redo
- [ ] 命令中心宏
- [ ] 消息通道发送/接收
- [ ] 消息通道请求 - 响应
- [ ] 消息通道超时处理
- [ ] Worker 适配器
