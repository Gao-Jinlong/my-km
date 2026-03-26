# 基础设施服务设计文档（第一批）

**创建日期**: 2026-03-26
**状态**: 待实现
**批次**: 基础设施层 - 第一批

---

## 1. 概述

本文档描述项目基础设施层两个核心服务的设计：
- 命令服务 (CommandService)
- 事件总线服务 (EventBusService)

这两个服务是应用架构的基石，提供跨模块通信和统一命令调度的能力。

---

## 2. 命令服务 (CommandService)

### 2.1 职责

- 统一注册和管理所有可执行命令
- 提供命令手动执行入口（菜单项、快捷键、API 调用）
- 支持命令拦截器和装饰器
- 支持命令执行历史记录
- 支持命令权限检查
- 支持命令执行前后钩子

### 2.2 核心接口

```typescript
/**
 * 命令执行上下文
 */
interface CommandContext {
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
type CommandHandler = (context: CommandContext) => void | Promise<unknown>;

/**
 * 命令元数据
 */
interface CommandMetadata {
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
interface CommandDefinition extends CommandMetadata {
    /** 命令处理器 */
    handler: CommandHandler;
}

/**
 * 命令拦截器
 */
interface CommandInterceptor {
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
interface CommandHistoryItem {
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
 * 命令服务
 */
@Service({ singleton: true })
class CommandService extends ServiceBase {
    // 事件发射器
    private readonly _onWillExecuteCommand = new Emitter<CommandContext>();
    private readonly _onDidExecuteCommand = new Emitter<{ context: CommandContext; result: unknown }>();
    private readonly _onCommandFailed = new Emitter<{ context: CommandContext; error: Error }>();

    /** 命令即将执行事件 */
    readonly onWillExecuteCommand = this._onWillExecuteCommand.event;

    /** 命令已执行事件 */
    readonly onDidExecuteCommand = this._onDidExecuteCommand.event;

    /** 命令执行失败事件 */
    readonly onCommandFailed = this._onCommandFailed.event;

    /** 命令执行历史 */
    private history: CommandHistoryItem[];

    /** 历史最大长度 */
    readonly historyLimit = 100;

    /**
     * 注册命令
     * @param definition 命令定义
     * @returns IDisposable
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
     * @param commandId 命令 ID
     * @param args 参数
     * @param source 触发来源
     * @returns 命令执行结果
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

    override dispose(): void;
}
```

### 2.3 使用示例

```typescript
// 注册命令
commandService.registerCommand({
    id: 'file.save',
    label: '保存文件',
    category: '文件',
    description: '保存当前编辑的文件',
    shortcut: 'Ctrl+S',
    icon: 'save',
    handler: async (context) => {
        const activeFile = activeFileService.getActive();
        if (!activeFile) {
            throw new Error('没有打开的文件');
        }
        await activeFileService.save(activeFile.path);
        notificationService.success('保存成功');
    },
});

// 注册带权限检查的命令
commandService.registerCommand({
    id: 'file.delete',
    label: '删除文件',
    category: '文件',
    requiresPermission: 'file.delete',
    enabled: (context) => {
        // 只有在有文件选中时才可用
        return fileTreeStore.getSelectedNode() !== null;
    },
    handler: async (context) => {
        const node = fileTreeStore.getSelectedNode();
        if (!node) return;

        const confirmed = await dialogService.confirm({
            type: 'confirm',
            title: '确认删除',
            message: `确定要删除 "${node.name}" 吗？`,
        });

        if (confirmed) {
            await fileSystemService.deleteFile(node.path);
        }
    },
});

// 执行命令（从菜单项）
<Menu.Item
    onClick={() => commandService.executeCommand('file.save')}
    label="保存"
/>

// 执行命令（带参数）
await commandService.executeCommand('file.open', '/path/to/file.md');

// 注册拦截器（用于日志）
commandService.addInterceptor({
    before: async (context) => {
        console.log(`[Command] Will execute: ${context.commandId}`, context.args);
        return true; // 继续执行
    },
    after: (context, result) => {
        console.log(`[Command] Did execute: ${context.commandId}`, result);
    },
    onError: (context, error) => {
        console.error(`[Command] Failed: ${context.commandId}`, error);
    },
    priority: 0,
});

// 注册拦截器（用于权限检查）
commandService.addInterceptor({
    before: async (context) => {
        const command = commandService.getCommand(context.commandId);
        if (command?.requiresPermission) {
            const hasPermission = await permissionService.check(command.requiresPermission);
            if (!hasPermission) {
                notificationService.error('权限不足');
                return false; // 取消执行
            }
        }
        return true;
    },
    priority: 100, // 高优先级，先执行
});

// 获取命令历史
const history = commandService.getHistory(10);
console.log('最近 10 个命令:', history);

// 获取命令列表（用于命令面板）
const commands = commandService.getAllCommands();
const filtered = commands.filter(cmd => cmd.visible !== false);
```

### 2.4 设计决策

| 决策点 | 选择 | 理由 |
|--------|------|------|
| 命令 ID 格式 | 命名空间 + 点号 | 如 `file.save`，避免冲突，便于分类 |
| 返回值 | Promise | 支持异步命令，统一处理 |
| 拦截器 | 支持 before/after | 横切关注点（日志、权限） |
| 历史记录 | 内存存储 | 调试和撤销功能需要 |
| 权限检查 | 拦截器模式 | 解耦权限逻辑与命令逻辑 |

### 2.5 与快捷键服务集成

```typescript
// 快捷键服务内部使用 CommandService
shortcutService.register({
    id: 'shortcut.file.save',
    shortcut: 'Ctrl+S',
    handler: async (ctx) => {
        // 委托给 CommandService 执行
        await commandService.executeCommand('file.save');
    },
    when: (ctx) => {
        // 只有在编辑器聚焦时才响应
        return focusService.currentFocus?.zoneId === 'editor';
    },
});

// 这样菜单项和快捷键都使用同一个命令
<Menu.Item
    onClick={() => commandService.executeCommand('file.save')}
    label="保存"
    shortcut="Ctrl+S"
/>
```

### 2.6 命令面板集成

```typescript
// 命令面板搜索和执行的命令源
async function executeSelectedCommand(commandId: string) {
    try {
        await commandService.executeCommand(commandId);
    } catch (error) {
        notificationService.error(`命令执行失败：${error.message}`);
    }
}

function getCommandPaletteItems() {
    const commands = commandService.getAllCommands();
    return commands
        .filter(cmd => cmd.category !== 'debug') // 过滤掉调试命令
        .map(cmd => ({
            id: cmd.id,
            label: cmd.label || cmd.id,
            description: cmd.description,
            category: cmd.category,
            shortcut: cmd.shortcut,
        }));
}
```

---

## 3. 事件总线服务 (EventBusService)

### 3.1 职责

- 提供全局事件发布/订阅能力
- 支持事件命名空间隔离
- 支持事件拦截和转换
- 支持事件回放（新订阅者获取历史事件）
- 支持事件节流和防抖
- 支持跨模块解耦通信

### 3.2 核心接口

```typescript

/**
 * 事件定义
 */
interface EventDefinition<T = unknown> {
    /** 事件唯一标识（如 'file.created', 'editor.changed'） */
    name: string;

    /** 事件数据 */
    payload: T;
}

/**
 * 事件处理器
 */
type EventHandler<T = unknown> = (payload: T) => void | Promise<void>;

/**
 * 事件订阅选项
 */
interface EventSubscribeOptions {
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

/**
 * 事件历史项
 */
interface EventHistoryItem<T = unknown> {
    /** 事件名称 */
    name: string;

    /** 事件数据 */
    payload: T;

    /** 发生时间 */
    timestamp: number;
}

/**
 * 事件拦截器
 */
interface EventInterceptor {
    /** 事件名称模式（支持通配符） */
    pattern: string;

    /** 事件前处理（可修改 payload） */
    before?: <T>(name: string, payload: T) => T | void;

    /** 事件后处理 */
    after?: <T>(name: string, payload: T) => void;

    /** 优先级 */
    priority?: number;
}

/**
 * 事件总线服务
 */
@Service({ singleton: true })
class EventBusService extends ServiceBase {
    // 内部 Emitter 映射表
    private emitters = new Map<string, Emitter<unknown>>();

    /** 事件历史 */
    private history: EventHistoryItem[] = [];

    /** 历史最大长度 */
    readonly historyLimit = 50;

    /** 事件拦截器 */
    private interceptors: EventInterceptor[] = [];

    /**
     * 订阅事件
     * @param name 事件名称
     * @param handler 处理函数
     * @param options 选项
     * @returns IDisposable
     */
    subscribe<T>(name: string, handler: EventHandler<T>, options?: EventSubscribeOptions): IDisposable;

    /**
     * 订阅事件（通配符模式）
     * @param pattern 事件名称模式（如 'file.*', '*.created'）
     * @param handler 处理函数
     * @returns IDisposable
     */
    subscribePattern<T>(pattern: string, handler: EventHandler<T>): IDisposable;

    /**
     * 订阅一次事件
     */
    once<T>(name: string, handler: EventHandler<T>): IDisposable;

    /**
     * 发布事件
     * @param name 事件名称
     * @param payload 事件数据
     */
    publish<T>(name: string, payload: T): void;

    /**
     * 异步发布事件
     */
    publishAsync<T>(name: string, payload: T): Promise<void>;

    /**
     * 取消订阅
     */
    unsubscribe(name: string, handler: EventHandler<unknown>): void;

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
    getHistory(options?: {
        name?: string;
        namespace?: string;
        limit?: number;
        since?: number;
    }): EventHistoryItem[];

    /**
     * 清空事件历史
     */
    clearHistory(): void;

    /**
     * 获取事件监听器数量
     */
    getListenerCount(name: string): number;

    override dispose(): void;
}
```

### 3.3 使用示例

```typescript
// 发布事件
eventBus.publish('file.created', {
    path: '/docs/new.md',
    type: 'markdown',
    createdAt: Date.now(),
});

// 订阅特定事件
eventBus.subscribe('file.created', (payload) => {
    console.log('文件创建:', payload.path);
    fileTreeStore.refresh();
});

// 订阅命名空间下所有事件
eventBus.subscribePattern('file.*', (payload, name) => {
    console.log(`文件事件 ${name}:`, payload);
});

// 带选项订阅（节流）
eventBus.subscribe('editor.changed', (payload) => {
    // 每秒最多执行一次
    saveAutoBackup(payload);
}, {
    throttle: 1000,
});

// 带选项订阅（防抖）
eventBus.subscribe('search.query', (payload) => {
    // 停止输入 300ms 后才搜索
    performSearch(payload.query);
}, {
    debounce: 300,
});

// 订阅一次
eventBus.once('app.ready', () => {
    console.log('应用已就绪');
});

// 使用命名空间
eventBus.subscribe('file.created', handler, { namespace: 'file' });

// 过滤特定命名空间的事件
const fileEvents = eventBus.getHistory({ namespace: 'file' });

// 添加拦截器（日志）
eventBus.addInterceptor({
    pattern: '*',
    before: (name, payload) => {
        console.log(`[Event] Publishing: ${name}`, payload);
    },
    after: (name, payload) => {
        // 可选：记录到分析系统
    },
});

// 添加拦截器（数据转换）
eventBus.addInterceptor({
    pattern: 'file.*',
    before: (name, payload) => {
        // 统一添加时间戳
        return { ...payload, eventTime: Date.now() };
    },
});

// 带历史回放
eventBus.subscribe('theme.changed', handler, {
    replayHistory: true, // 新订阅者会收到最近一次事件
});

// 这在主题服务中很有用 - 新组件加载时自动获取当前主题
```

### 3.4 设计决策

| 决策点 | 选择 | 理由 |
|--------|------|------|
| 事件命名 | 点号分隔 | 如 `file.created`，层次清晰 |
| 通配符 | 支持 `*` | 灵活订阅一类事件 |
| 历史回放 | 可选 | 新组件可获取最新状态 |
| 节流防抖 | 内置支持 | 减少样板代码 |
| 拦截器 | 支持 before/after | 横切关注点（日志、分析） |

### 3.5 与 Emitter 对比

| 特性 | Emitter | EventBusService |
|------|---------|-----------------|
| 作用域 | 类/模块内部 | 全局跨模块 |
| 类型安全 | 泛型强类型 | 动态事件名 |
| 生命周期 | 随类销毁 | 应用级生命周期 |
| 使用场景 | 内部状态通知 | 跨模块通信 |

**建议模式**：
- 模块内部：使用 `Emitter`（类型安全）
- 跨模块通信：使用 `EventBusService`（解耦）

### 3.6 典型应用场景

```typescript
// ===== 场景 1: 文件操作通知 =====
// 文件服务发布事件
class FileSystemService {
    async createFile(path: string, content: string) {
        // ...创建文件逻辑
        eventBus.publish('file.created', { path, content });
    }

    async deleteFile(path: string) {
        // ...删除逻辑
        eventBus.publish('file.deleted', { path });
    }
}

// 文件树订阅并刷新
eventBus.subscribePattern('file.*', () => {
    fileTreeStore.refresh();
});

// 面包屑订阅并更新
eventBus.subscribe('file.deleted', ({ path }) => {
    breadcrumbStore.removePath(path);
});

// ===== 场景 2: 编辑器状态同步 =====
eventBus.subscribe('editor.focus', ({ editorId }) => {
    activeFileService.activate(editorId);
});

eventBus.subscribe('theme.changed', () => {
    // 所有编辑器重新渲染
    editorContainer.rethemeAll();
});

// ===== 场景 3: 应用生命周期 =====
// 应用启动时
eventBus.publish('app.initialized', { version: '1.0.0' });

// 模块监听取执行初始化
eventBus.once('app.initialized', () => {
    moduleA.initialize();
});
```

---

## 4. 数据流

### 4.1 命令执行流程

```
用户触发动作（点击菜单/按快捷键）
    │
    ▼
CommandService.executeCommand('file.save')
    │
    ▼
执行拦截器 before（权限检查等）
    │
    ├──► 权限不足 → 返回 false → 终止
    │
    ▼
触发 onWillExecuteCommand 事件
    │
    ▼
执行命令 handler
    │
    ├──► 成功 → 记录历史 → 触发 onDidExecuteCommand
    │
    └──► 失败 → 触发 onCommandFailed → 抛出错误
    │
    ▼
执行拦截器 after（日志记录）
```

### 4.2 事件发布流程

```
模块调用 eventBus.publish('file.created', payload)
    │
    ▼
执行拦截器 before（可修改 payload）
    │
    ▼
查找匹配的订阅者（精确匹配 + 通配符）
    │
    ▼
按优先级调用所有监听器
    │
    ▼
加入事件历史（如果配置）
    │
    ▼
执行拦截器 after
```

---

## 5. 错误处理

### 5.1 命令服务

| 错误场景 | 处理方式 |
|----------|----------|
| 命令未注册 | 抛出 Error: Command not found |
| handler 执行失败 | 触发 onCommandFailed，重新抛出 |
| 拦截器 before 返回 false | 取消执行，不抛错 |
| 拦截器执行失败 | 记录日志，继续执行 |

### 5.2 事件总线

| 错误场景 | 处理方式 |
|----------|----------|
| 监听器执行失败 | 记录日志，不影响其他监听器 |
| 事件名格式无效 | 警告日志，不阻止发布 |
| 历史溢出 | 移除最早的事件 |
| 拦截器失败 | 记录日志，继续执行 |

---

## 6. 测试策略

### 6.1 单元测试

```typescript
// CommandService 测试
describe('CommandService', () => {
    it('应成功注册和执行命令', async () => {
        const handler = vi.fn();
        service.registerCommand({
            id: 'test.cmd',
            handler,
        });

        await service.executeCommand('test.cmd', 'arg1');
        expect(handler).toHaveBeenCalledWith(
            expect.objectContaining({ args: ['arg1'] })
        );
    });

    it'应支持命令拦截器', async () => {
        const beforeMock = vi.fn(() => true);
        const afterMock = vi.fn();

        service.addInterceptor({
            before: beforeMock,
            after: afterMock,
        });

        await service.executeCommand('test.cmd');
        expect(beforeMock).toHaveBeenCalled();
        expect(afterMock).toHaveBeenCalled();
    });

    it'应记录命令历史', async () => {
        service.registerCommand({ id: 'test.cmd', handler: vi.fn() });

        await service.executeCommand('test.cmd');

        const history = service.getHistory();
        expect(history[0].commandId).toBe('test.cmd');
    });

    it'应支持拦截器取消执行', async () => {
        service.addInterceptor({
            before: () => false, // 取消执行
        });

        const handler = vi.fn();
        service.registerCommand({ id: 'test.cmd', handler });

        await service.executeCommand('test.cmd');
        expect(handler).not.toHaveBeenCalled();
    });
});

// EventBusService 测试
describe('EventBusService', () => {
    it('应发布和订阅事件', () => {
        const handler = vi.fn();
        service.subscribe('test.event', handler);

        service.publish('test.event', { data: 'test' });

        expect(handler).toHaveBeenCalledWith({ data: 'test' });
    });

    it'应支持通配符订阅', () => {
        const handler = vi.fn();
        service.subscribePattern('file.*', handler);

        service.publish('file.created', {});
        service.publish('file.deleted', {});
        service.publish('user.login', {}); // 不应触发

        expect(handler).toHaveBeenCalledTimes(2);
    });

    it'应支持节流', () => {
        const handler = vi.fn();
        service.subscribe('fast.event', handler, { throttle: 100 });

        // 快速发布多次
        service.publish('fast.event', 1);
        service.publish('fast.event', 2);
        service.publish('fast.event', 3);

        // 等待节流窗口
        advanceTimersByTime(150);

        expect(handler).toHaveBeenCalledTimes(1); // 只有一次
    });

    it'应支持历史回放', () => {
        service.publish('state.changed', { value: 'initial' });

        const handler = vi.fn();
        service.subscribe('state.changed', handler, { replayHistory: true });

        expect(handler).toHaveBeenCalledWith({ value: 'initial' });
    });
});
```

---

## 7. 与其他服务关系

```
CommandService ─┬──► ShortcutService（快捷键触发命令）
                ├──► DialogService（命令中显示对话框）
                ├──► NotificationService（命令结果通知）
                ├──► PermissionService（权限检查）
                └──► EventBusService（记录命令事件）

EventBusService ─┬──► 所有服务（作为通信基础设施）
                 └──► Emitter（内部使用）
```

---

## 8. 实施顺序

1. **EventBusService** - 作为基础设施，其他服务可能依赖
2. **CommandService** - 依赖 EventBusService 发布事件

---

## 9. 待决策事项

| 事项 | 状态 | 建议 |
|------|------|------|
| 命令历史存储 | 待确认 | 内存存储，100 条限制 |
| 事件历史存储 | 待确认 | 内存存储，50 条限制 |
| 拦截器异常处理 | 待确认 | 捕获并记录，不影响主流程 |
| 通配符语法 | 待确认 | 简单 `*` 匹配，不支持复杂模式 |

---

## 10. 与后续批次的关系

### 依赖本服务的模块
- **快捷键冲突检测** → 依赖 CommandService
- **菜单系统** → 依赖 CommandService
- **命令面板** → 依赖 CommandService
- **所有跨模块通信** → 依赖 EventBusService

### 本服务依赖
- **EventBusService** → CommandService 用它发布执行事件
- **无其他依赖** → 这是基础设施层

---

## 11. 扩展建议

### 未来可扩展功能

1. **命令宏录制**
   ```typescript
   commandService.startMacro('myMacro');
   // ...用户执行多个命令...
   commandService.stopMacro();
   // 之后可以 commandService.executeMacro('myMacro')
   ```

2. **命令撤销/重做**
   ```typescript
   commandService.registerUndoableCommand({
       id: 'block.insert',
       handler: ...,
       undo: ...,
   });
   ```

3. **事件持久化**
   ```typescript
   eventBus.persistTo('indexed-db'); // 事件持久化到 DB
   ```

4. **事件溯源**
   ```typescript
   eventBus.enableSourcing(); // 支持状态重建
   ```
