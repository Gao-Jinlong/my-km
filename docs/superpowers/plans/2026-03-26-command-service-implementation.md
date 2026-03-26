# CommandService 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现命令服务，提供统一的命令注册和执行能力，支持命令拦截器、权限检查、执行历史和命令面板集成。

**Architecture:** CommandService 依赖 EventBusService 发布命令执行事件。提供命令注册、执行、拦截器、历史记录功能。采用单例模式。

**Tech Stack:** TypeScript, EventBusService, Disposable 模式

---

## 文件结构

```
apps/web/src/platform/command/
├── index.ts                 # 导出所有内容
├── service.ts              # CommandService 实现
├── types.ts                # 类型定义和接口
└── __tests__/
    ├── types.test.ts
    └── service.test.ts
```

---

## 任务分解

### Task 1: 类型定义和接口

**Files:**
- Create: `apps/web/src/platform/command/types.ts`
- Test: `apps/web/src/platform/command/__tests__/types.test.ts`

- [ ] **Step 1: 定义命令上下文和处理器**

```typescript
// apps/web/src/platform/command/types.ts

import { IDisposable } from '@base/common/event';

/**
 * 命令执行上下文
 */
export interface CommandContext {
    /** 命令 ID */
    commandId: string;
    /** 命令参数 */
    args: unknown[];
    /** 触发来源 */
    source?: 'keyboard' | 'menu' | 'api' | 'other';
    /** 当前焦点元素 */
    targetElement?: HTMLElement;
    /** 自定义数据 */
    [key: string]: unknown;
}

/**
 * 命令处理器
 */
export type CommandHandler = (context: CommandContext) => void | Promise<unknown>;

/**
 * 命令元数据
 */
export interface CommandMetadata {
    /** 命令唯一标识 */
    id: string;
    /** 命令显示名称 */
    label?: string;
    /** 命令描述 */
    description?: string;
    /** 命令分类（用于 UI 分组） */
    category?: string;
    /** 默认快捷键 */
    shortcut?: string;
    /** 图标 */
    icon?: string;
    /** 是否可用（用于菜单禁用状态） */
    enabled?: boolean | ((context: CommandContext) => boolean);
    /** 是否可见（用于菜单隐藏） */
    visible?: boolean | ((context: CommandContext) => boolean);
    /** 所需权限 */
    requiresPermission?: string;
}

/**
 * 命令定义
 */
export interface CommandDefinition extends CommandMetadata {
    /** 命令处理器 */
    handler: CommandHandler;
}
```

- [ ] **Step 2: 定义命令拦截器和历史**

```typescript
// 接在 types.ts 后面

/**
 * 命令拦截器
 */
export interface CommandInterceptor {
    /** 执行前钩子（可取消） */
    before?: (context: CommandContext) => void | Promise<boolean | void>;
    /** 执行后钩子 */
    after?: (context: CommandContext, result: unknown) => void;
    /** 错误钩子 */
    onError?: (context: CommandContext, error: Error) => void;
    /** 拦截器优先级（数字越大越先执行） */
    priority?: number;
}

/**
 * 命令执行历史项
 */
export interface CommandHistoryItem {
    /** 命令 ID */
    commandId: string;
    /** 执行时间 */
    timestamp: number;
    /** 参数 */
    args: unknown[];
    /** 来源 */
    source?: string;
    /** 执行结果 */
    result?: unknown;
    /** 是否出错 */
    error?: Error;
    /** 执行耗时（毫秒） */
    duration?: number;
}

/**
 * 命令执行事件
 */
export interface CommandWillExecuteEvent {
    context: CommandContext;
}

export interface CommandDidExecuteEvent {
    context: CommandContext;
    result: unknown;
}

export interface CommandFailedEvent {
    context: CommandContext;
    error: Error;
}
```

- [ ] **Step 3: 定义命令服务接口**

```typescript
// 接在 types.ts 后面

import { Event } from '@base/common/event';

export interface ICommandService {
    /**
     * 注册命令
     */
    registerCommand(definition: CommandDefinition): IDisposable;

    /**
     * 注销命令
     */
    unregisterCommand(commandId: string): void;

    /**
     * 检查命令是否已注册
     */
    hasCommand(commandId: string): boolean;

    /**
     * 获取命令元数据
     */
    getCommand(commandId: string): CommandMetadata | undefined;

    /**
     * 获取所有已注册命令
     */
    getAllCommands(): CommandMetadata[];

    /**
     * 执行命令
     */
    executeCommand<T>(commandId: string, ...args: unknown[]): Promise<T>;

    /**
     * 带上下文执行命令
     */
    executeCommandWithContext<T>(commandId: string, context: Partial<CommandContext>): Promise<T>;

    /**
     * 注册命令拦截器
     */
    addInterceptor(interceptor: CommandInterceptor): IDisposable;

    /**
     * 获取命令历史
     */
    getHistory(limit?: number): CommandHistoryItem[];

    /**
     * 清空命令历史
     */
    clearHistory(): void;

    /**
     * 获取最近执行的命令
     */
    getLastExecuted(): CommandHistoryItem | null;

    /** 命令即将执行事件 */
    readonly onWillExecuteCommand: Event<CommandWillExecuteEvent>;
    /** 命令已执行事件 */
    readonly onDidExecuteCommand: Event<CommandDidExecuteEvent>;
    /** 命令执行失败事件 */
    readonly onCommandFailed: Event<CommandFailedEvent>;
}
```

- [ ] **Step 4: 运行 TypeScript 检查类型定义**

```bash
cd apps/web && npx tsc --noEmit src/platform/command/types.ts
```

Expected: 无错误

- [ ] **Step 5: 创建类型测试文件**

```typescript
// apps/web/src/platform/command/__tests__/types.test.ts
import { describe, it, expect } from 'vitest';
import type { CommandContext, CommandDefinition, CommandInterceptor } from '../types';

describe('CommandService Types', () => {
    it('应正确定义命令上下文', () => {
        const context: CommandContext = {
            commandId: 'file.save',
            args: ['/path/to/file'],
            source: 'menu',
        };
        expect(context.commandId).toBe('file.save');
        expect(context.source).toBe('menu');
    });

    it('应正确定义命令定义', () => {
        const def: CommandDefinition = {
            id: 'file.save',
            label: '保存文件',
            category: '文件',
            description: '保存当前文件',
            shortcut: 'Ctrl+S',
            handler: async (ctx) => {
                console.log('Saving...', ctx.args);
                return { success: true };
            },
        };
        expect(def.id).toBe('file.save');
        expect(def.label).toBe('保存文件');
    });

    it('应正确定义拦截器', () => {
        const interceptor: CommandInterceptor = {
            before: async (ctx) => {
                console.log('Before:', ctx.commandId);
                return true;
            },
            after: (ctx, result) => {
                console.log('After:', result);
            },
            onError: (ctx, error) => {
                console.error('Error:', error);
            },
            priority: 0,
        };
        expect(interceptor.priority).toBe(0);
    });

    it('应正确定义历史项', () => {
        const history = {
            commandId: 'file.save',
            timestamp: Date.now(),
            args: ['/path'],
            source: 'menu',
            result: { success: true },
            duration: 50,
        };
        expect(history.commandId).toBe('file.save');
        expect(history.duration).toBe(50);
    });
});
```

- [ ] **Step 6: 运行类型测试**

```bash
cd apps/web && npx vitest run src/platform/command/__tests__/types.test.ts
```

Expected: PASS

- [ ] **Step 7: 提交**

```bash
git add apps/web/src/platform/command/types.ts apps/web/src/platform/command/__tests__/types.test.ts
git commit -m "feat(command): 定义命令服务类型和接口"
```

---

### Task 2: CommandService 核心实现

**Files:**
- Create: `apps/web/src/platform/command/service.ts`
- Test: `apps/web/src/platform/command/__tests__/service.test.ts`

- [ ] **Step 1: 实现 CommandService 类**

```typescript
// apps/web/src/platform/command/service.ts

import { Service, ServiceBase } from '@platform/di';
import { Emitter, Event, DisposableStore, IDisposable } from '@base/common/event';
import type {
    ICommandService,
    CommandDefinition,
    CommandMetadata,
    CommandContext,
    CommandHandler,
    CommandInterceptor,
    CommandHistoryItem,
    CommandWillExecuteEvent,
    CommandDidExecuteEvent,
    CommandFailedEvent,
} from './types';

@Service({ singleton: true })
export class CommandService extends ServiceBase implements ICommandService {
    /** 命令注册表 */
    private readonly commands = new Map<string, CommandDefinition>();

    /** 命令拦截器 */
    private readonly interceptors: CommandInterceptor[] = [];

    /** 命令执行历史 */
    private readonly history: CommandHistoryItem[] = [];
    private readonly historyLimit = 100;

    /** 事件发射器 */
    private readonly _onWillExecuteCommand = new Emitter<CommandWillExecuteEvent>();
    private readonly _onDidExecuteCommand = new Emitter<CommandDidExecuteEvent>();
    private readonly _onCommandFailed = new Emitter<CommandFailedEvent>();

    /** 公开事件 */
    readonly onWillExecuteCommand = this._onWillExecuteCommand.event;
    readonly onDidExecuteCommand = this._onDidExecuteCommand.event;
    readonly onCommandFailed = this._onCommandFailed.event;

    /**
     * 注册命令
     */
    registerCommand(definition: CommandDefinition): IDisposable {
        if (this.commands.has(definition.id)) {
            console.warn(`命令 ${definition.id} 已被注册，将被覆盖`);
        }

        this.commands.set(definition.id, definition);

        return {
            dispose: () => {
                this.unregisterCommand(definition.id);
            },
        };
    }

    /**
     * 注销命令
     */
    unregisterCommand(commandId: string): void {
        this.commands.delete(commandId);
    }

    /**
     * 检查命令是否已注册
     */
    hasCommand(commandId: string): boolean {
        return this.commands.has(commandId);
    }

    /**
     * 获取命令元数据
     */
    getCommand(commandId: string): CommandMetadata | undefined {
        return this.commands.get(commandId);
    }

    /**
     * 获取所有已注册命令
     */
    getAllCommands(): CommandMetadata[] {
        return Array.from(this.commands.values()).map(cmd => ({
            id: cmd.id,
            label: cmd.label,
            description: cmd.description,
            category: cmd.category,
            shortcut: cmd.shortcut,
            icon: cmd.icon,
            enabled: cmd.enabled,
            visible: cmd.visible,
            requiresPermission: cmd.requiresPermission,
        }));
    }

    /**
     * 执行命令
     */
    async executeCommand<T>(commandId: string, ...args: unknown[]): Promise<T> {
        return this.executeCommandWithContext<T>(commandId, {
            args,
            source: 'api',
        });
    }

    /**
     * 带上下文执行命令
     */
    async executeCommandWithContext<T>(commandId: string, context: Partial<CommandContext>): Promise<T> {
        const startTime = Date.now();
        const command = this.commands.get(commandId);

        if (!command) {
            throw new Error(`命令未找到：${commandId}`);
        }

        // 构建完整上下文
        const fullContext: CommandContext = {
            commandId,
            args: context.args || [],
            source: context.source || 'api',
            targetElement: context.targetElement,
            ...context,
        };

        // 执行拦截器 before
        const sortedInterceptors = [...this.interceptors].sort(
            (a, b) => (b.priority ?? 0) - (a.priority ?? 0)
        );

        for (const interceptor of sortedInterceptors) {
            if (interceptor.before) {
                try {
                    const result = await interceptor.before(fullContext);
                    if (result === false) {
                        // 拦截器取消执行
                        return undefined as T;
                    }
                } catch (error) {
                    console.warn(`拦截器 before 执行失败：${error}`);
                    // 继续执行
                }
            }
        }

        // 触发即将执行事件
        this._onWillExecuteCommand.fire({ context: fullContext });

        let result: unknown;
        let error: Error | undefined;

        try {
            // 执行命令处理器
            result = await command.handler(fullContext);
        } catch (e) {
            error = e instanceof Error ? e : new Error(String(e));

            // 触发失败事件
            this._onCommandFailed.fire({ context: fullContext, error });

            // 执行拦截器 onError
            for (const interceptor of sortedInterceptors) {
                if (interceptor.onError) {
                    try {
                        interceptor.onError(fullContext, error);
                    } catch (e) {
                        console.warn(`拦截器 onError 执行失败：${e}`);
                    }
                }
            }

            throw error;
        } finally {
            // 记录历史
            const duration = Date.now() - startTime;
            this.addToHistory({
                commandId,
                timestamp: startTime,
                args: fullContext.args,
                source: fullContext.source,
                result,
                error,
                duration,
            });
        }

        // 触发已执行事件
        this._onDidExecuteCommand.fire({ context: fullContext, result });

        // 执行拦截器 after
        for (const interceptor of sortedInterceptors) {
            if (interceptor.after) {
                try {
                    interceptor.after(fullContext, result);
                } catch (e) {
                    console.warn(`拦截器 after 执行失败：${e}`);
                }
            }
        }

        return result as T;
    }

    /**
     * 注册命令拦截器
     */
    addInterceptor(interceptor: CommandInterceptor): IDisposable {
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
     * 获取命令历史
     */
    getHistory(limit?: number): CommandHistoryItem[] {
        const l = limit ?? this.history.length;
        return this.history.slice(-l);
    }

    /**
     * 清空命令历史
     */
    clearHistory(): void {
        this.history.splice(0, this.history.length);
    }

    /**
     * 获取最近执行的命令
     */
    getLastExecuted(): CommandHistoryItem | null {
        return this.history.length > 0 ? this.history[this.history.length - 1] : null;
    }

    override dispose(): void {
        this._onWillExecuteCommand.dispose();
        this._onDidExecuteCommand.dispose();
        this._onCommandFailed.dispose();
        this.commands.clear();
        this.interceptors.splice(0, this.interceptors.length);
        this.history.splice(0, this.history.length);
    }

    private addToHistory(item: CommandHistoryItem): void {
        this.history.push(item);
        if (this.history.length > this.historyLimit) {
            this.history.shift();
        }
    }
}
```

- [ ] **Step 2: 创建 CommandService 测试**

```typescript
// apps/web/src/platform/command/__tests__/service.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CommandService } from '../service';

describe('CommandService', () => {
    let commandService: CommandService;

    beforeEach(() => {
        commandService = new CommandService();
    });

    afterEach(() => {
        commandService.dispose();
    });

    it('应成功注册命令', () => {
        const handler = vi.fn();
        const disposable = commandService.registerCommand({
            id: 'test.cmd',
            handler,
        });

        expect(commandService.hasCommand('test.cmd')).toBe(true);
        disposable.dispose();
        expect(commandService.hasCommand('test.cmd')).toBe(false);
    });

    it('应执行命令', async () => {
        const handler = vi.fn().mockResolvedValue({ success: true });
        commandService.registerCommand({
            id: 'test.cmd',
            handler,
        });

        const result = await commandService.executeCommand('test.cmd', 'arg1');

        expect(handler).toHaveBeenCalledWith(
            expect.objectContaining({
                commandId: 'test.cmd',
                args: ['arg1'],
            })
        );
        expect(result).toEqual({ success: true });
    });

    it'应支持命令拦截器', async () => {
        const beforeMock = vi.fn(() => true);
        const afterMock = vi.fn();

        commandService.addInterceptor({
            before: beforeMock,
            after: afterMock,
        });

        commandService.registerCommand({
            id: 'test.cmd',
            handler: vi.fn(),
        });

        await commandService.executeCommand('test.cmd');

        expect(beforeMock).toHaveBeenCalled();
        expect(afterMock).toHaveBeenCalled();
    });

    it'应支持拦截器取消执行', async () => {
        commandService.addInterceptor({
            before: () => false, // 取消执行
            priority: 100,
        });

        const handler = vi.fn();
        commandService.registerCommand({
            id: 'test.cmd',
            handler,
        });

        const result = await commandService.executeCommand('test.cmd');

        expect(handler).not.toHaveBeenCalled();
        expect(result).toBeUndefined();
    });

    it'应记录命令历史', async () => {
        commandService.registerCommand({
            id: 'test.cmd',
            handler: vi.fn(),
        });

        await commandService.executeCommand('test.cmd', 'arg1');

        const history = commandService.getHistory();
        expect(history).toHaveLength(1);
        expect(history[0].commandId).toBe('test.cmd');
        expect(history[0].args).toEqual(['arg1']);
    });

    it'应触发即将执行事件', async () => {
        const onWillExecute = vi.fn();
        commandService.onWillExecuteCommand(onWillExecute);

        commandService.registerCommand({
            id: 'test.cmd',
            handler: vi.fn(),
        });

        await commandService.executeCommand('test.cmd');

        expect(onWillExecute).toHaveBeenCalledWith(
            expect.objectContaining({
                context: expect.objectContaining({
                    commandId: 'test.cmd',
                }),
            })
        );
    });

    it'应触发已执行事件', async () => {
        const onDidExecute = vi.fn();
        commandService.onDidExecuteCommand(onDidExecute);

        commandService.registerCommand({
            id: 'test.cmd',
            handler: vi.fn().mockResolvedValue({ result: 'ok' }),
        });

        await commandService.executeCommand('test.cmd');

        expect(onDidExecute).toHaveBeenCalledWith(
            expect.objectContaining({
                result: { result: 'ok' },
            })
        );
    });

    it'应触发失败事件', async () => {
        const onFailed = vi.fn();
        commandService.onCommandFailed(onFailed);

        commandService.registerCommand({
            id: 'test.cmd',
            handler: vi.fn().mockRejectedValue(new Error('Test error')),
        });

        await expect(commandService.executeCommand('test.cmd')).rejects.toThrow('Test error');

        expect(onFailed).toHaveBeenCalledWith(
            expect.objectContaining({
                error: expect.any(Error),
            })
        );
    });

    it'应获取所有命令', () => {
        commandService.registerCommand({ id: 'cmd1', label: 'Command 1', category: 'Test' });
        commandService.registerCommand({ id: 'cmd2', label: 'Command 2', category: 'Test' });

        const commands = commandService.getAllCommands();
        expect(commands).toHaveLength(2);
        expect(commands.map(c => c.id)).toContain('cmd1');
        expect(commands.map(c => c.id)).toContain('cmd2');
    });

    it'应获取最近执行的命令', async () => {
        commandService.registerCommand({
            id: 'test.cmd',
            handler: vi.fn(),
        });

        await commandService.executeCommand('test.cmd');

        const last = commandService.getLastExecuted();
        expect(last).not.toBeNull();
        expect(last?.commandId).toBe('test.cmd');
    });

    it'应抛出错误对于未注册命令', async () => {
        await expect(commandService.executeCommand('nonexistent')).rejects.toThrow('命令未找到');
    });
});
```

- [ ] **Step 3: 运行 CommandService 测试**

```bash
cd apps/web && npx vitest run src/platform/command/__tests__/service.test.ts
```

Expected: PASS

- [ ] **Step 4: 提交**

```bash
git add apps/web/src/platform/command/service.ts apps/web/src/platform/command/__tests__/service.test.ts
git commit -m "feat(command): 实现命令服务核心功能"
```

---

### Task 3: 导出和索引

**Files:**
- Create: `apps/web/src/platform/command/index.ts`

- [ ] **Step 1: 创建统一导出文件**

```typescript
// apps/web/src/platform/command/index.ts

// 服务
export { CommandService } from './service';

// 类型
export type {
    CommandContext,
    CommandHandler,
    CommandMetadata,
    CommandDefinition,
    CommandInterceptor,
    CommandHistoryItem,
    CommandWillExecuteEvent,
    CommandDidExecuteEvent,
    CommandFailedEvent,
    ICommandService,
} from './types';
```

- [ ] **Step 2: 运行 TypeScript 检查所有导出**

```bash
cd apps/web && npx tsc --noEmit src/platform/command/index.ts
```

Expected: 无错误

- [ ] **Step 3: 提交**

```bash
git add apps/web/src/platform/command/index.ts
git commit -m "feat(command): 添加统一导出文件"
```

---

### Task 4: 最终验证

- [ ] **Step 1: 运行所有命令服务测试**

```bash
cd apps/web && npx vitest run src/platform/command/__tests__/
```

Expected: 所有测试 PASS

- [ ] **Step 2: 检查 TypeScript 类型**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: 无错误

- [ ] **Step 3: 提交最终版本**

```bash
git add apps/web/src/platform/command/
git commit -m "docs(command): 完成命令服务实现"
```

---

## 提交历史摘要

1. `feat(command): 定义命令服务类型和接口`
2. `feat(command): 实现命令服务核心功能`
3. `feat(command): 添加统一导出文件`
4. `docs(command): 完成命令服务实现`

---

## 测试覆盖目标

- [ ] 类型定义正确
- [ ] 命令注册和注销正确
- [ ] 命令执行正确
- [ ] 拦截器 before/after/onError 正确
- [ ] 事件触发正确
- [ ] 历史记录正确
- [ ] TypeScript 类型检查通过
