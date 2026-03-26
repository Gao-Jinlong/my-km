# 基础设施服务设计文档（第四批）

**创建日期**: 2026-03-26
**状态**: 待实现
**批次**: 基础设施层 - 第四批

---

## 1. 概述

本文档描述项目基础设施层三个通信相关服务的设计：
- 事件总线（Event Bus）- 跨服务发布/订阅通信
- 命令中心（Command Center）- 统一命令注册、调度和撤销/重做
- 消息通道（Message Channel）- 进程间/模块间消息传递

这三个服务提供应用内通信、命令调度和消息传递能力。

---

## 2. 事件总线（EventBusService）

### 2.1 职责

- 统一的事件发布/订阅机制
- 支持事件类型管理和自动注册
- 支持事件过滤（按类型、按来源、按标签）
- 支持同步/异步事件投递
- 支持事件拦截和事件修改
- 支持事件历史记录和重放

### 2.2 核心接口

```typescript
/**
 * 事件定义
 */
interface EventDefinition<T = unknown> {
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
 * 事件监听器
 */
type EventListener<T = unknown> = (event: EventDefinition<T>) => void | Promise<void>;

/**
 * 事件订阅选项
 */
interface EventSubscriptionOptions {
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
 * 事件总线服务
 */
@Service({ singleton: true })
class EventBusService extends ServiceBase {
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
    private interceptors: Array<(event: EventDefinition) => EventDefinition | null> = [];

    /** 事件历史（用于重放） */
    private eventHistory: EventDefinition[] = [];
    private readonly historyLimit = 1000;

    /**
     * 注册事件类型
     * @param eventType 事件类型定义
     */
    registerEvent(eventType: { type: string; tags?: string[] }): void;

    /**
     * 订阅事件
     * @param eventType 事件类型
     * @param listener 监听器函数
     * @param options 订阅选项
     * @returns IDisposable 用于取消订阅
     */
    subscribe<T>(
        eventType: string,
        listener: EventListener<T>,
        options?: EventSubscriptionOptions
    ): IDisposable;

    /**
     * 发布事件
     * @param event 事件定义
     * @returns Promise<void>
     */
    publish<T>(event: Omit<EventDefinition<T>, 'timestamp' | 'eventId'>): Promise<void>;

    /**
     * 批量发布事件
     */
    publishBatch<T>(events: Array<Omit<EventDefinition<T>, 'timestamp' | 'eventId'>>): Promise<void>;

    /**
     * 添加事件拦截器
     * @param interceptor 拦截器函数（返回 null 可阻止事件传递）
     */
    addInterceptor(interceptor: (event: EventDefinition) => EventDefinition | null): IDisposable;

    /**
     * 移除所有监听器
     * @param eventType 事件类型，如果不传则清空所有
     */
    clearListeners(eventType?: string): void;

    /**
     * 获取事件历史
     * @param options 过滤选项
     */
    getHistory(options?: { type?: string; source?: string; limit?: number }): EventDefinition[];

    /**
     * 重放历史事件
     * @param predicate 过滤条件
     * @param listener 重放处理函数
     */
    replayHistory(
        predicate: (event: EventDefinition) => boolean,
        listener: EventListener
    ): Promise<void>;

    /**
     * 获取订阅者数量
     */
    getSubscriberCount(eventType: string): number;

    override dispose(): void;
}
```

### 2.3 预定义事件类型

```typescript
/**
 * 系统级事件
 */
namespace SystemEvents {
    // 应用生命周期
    export const AppReady = 'system/app/ready';
    export const AppWillShutdown = 'system/app/will_shutdown';
    export const AppDidShutdown = 'system/app/did_shutdown';

    // 用户相关
    export const UserLogin = 'system/user/login';
    export const UserLogout = 'system/user/logout';
    export const UserSettingsChanged = 'system/user/settingsChanged';

    // 窗口/视图相关
    export const WindowResize = 'system/window/resize';
    export const ViewActivated = 'system/view/activated';
    export const ViewDeactivated = 'system/view/deactivated';
}

/**
 * 文件系统事件
 */
namespace FileSystemEvents {
    export const FileOpened = 'filesystem/file/opened';
    export const FileClosed = 'filesystem/file/closed';
    export const FileSaved = 'filesystem/file/saved';
    export const FileDeleted = 'filesystem/file/deleted';
    export const FileRenamed = 'filesystem/file/renamed';

    export const DirectoryCreated = 'filesystem/directory/created';
    export const DirectoryDeleted = 'filesystem/directory/deleted';

    export const FileChanged = 'filesystem/file/changed';  // 外部修改
}

/**
 * 编辑器事件
 */
namespace EditorEvents {
    export const ContentChanged = 'editor/content/changed';
    export const SelectionChanged = 'editor/selection/changed';
    export const CursorMoved = 'editor/cursor/moved';
    export const CommandExecuted = 'editor/command/executed';
}
```

### 2.4 使用示例

```typescript
// ===== 基本发布/订阅 =====

// 订阅文件保存事件
const subscription = eventBus.subscribe<FileSavedEvent>(
    FileSystemEvents.FileSaved,
    (event) => {
        console.log(`文件已保存：${event.payload.filePath}`);
        // 触发索引更新
        indexService.updateFile(event.payload.filePath);
    }
);

// 发布事件
await eventBus.publish({
    type: FileSystemEvents.FileSaved,
    source: 'fileSystemService',
    payload: { filePath: '/path/to/file.txt', savedAt: Date.now() }
});

// 取消订阅
subscription.dispose();

// ===== 使用标签过滤 =====

// 订阅所有带 'audit' 标签的事件
eventBus.subscribe(
    '*',  // 通配符
    (event) => {
        auditService.log(event);
    },
    { tags: ['audit'] }
);

// 发布带标签的事件
await eventBus.publish({
    type: FileSystemEvents.FileSaved,
    source: 'fileSystemService',
    tags: ['audit', 'filesystem'],
    payload: { ... }
});

// ===== 事件拦截器 =====

// 添加日志拦截器
eventBus.addInterceptor((event) => {
    logger.debug(`[EventBus] ${event.type} from ${event.source}`);
    return event;  // 继续传递
});

// 添加权限拦截器
eventBus.addInterceptor((event) => {
    if (event.type === FileSystemEvents.FileDeleted && !authService.canDelete()) {
        notificationService.error('没有删除权限');
        return null;  // 阻止事件传递
    }
    return event;
});

// ===== 优先级订阅 =====

// 高优先级监听器（优先执行）
eventBus.subscribe(
    EditorEvents.ContentChanged,
    (event) => {
        // 第一时间响应
        statusBarService.showSaving();
    },
    { priority: 100 }
);

// 普通优先级
eventBus.subscribe(
    EditorEvents.ContentChanged,
    (event) => {
        // 后续处理
        syncService.scheduleSync(event.payload.fileId);
    },
    { priority: 10 }
);

// ===== 事件历史重放 =====

// 重放所有文件相关事件
await eventBus.replayHistory(
    (event) => event.type.startsWith('filesystem/'),
    (event) => {
        recoveryService.restoreEvent(event);
    }
);

// ===== 异步等待事件处理完成 =====

const handler = new Promise<void>((resolve) => {
    const sub = eventBus.subscribe(
        SystemEvents.AppReady,
        () => {
            sub.dispose();
            resolve();
        },
        { async: true }
    );
});

await handler;  // 等待应用就绪
```

### 2.5 设计决策

| 决策点 | 选择 | 理由 |
|--------|------|------|
| 事件投递 | 支持同步/异步 | 关键事件同步，UI 事件异步 |
| 事件过滤 | 类型 + 来源 + 标签 | 多维度过滤更灵活 |
| 事件拦截 | 拦截器链模式 | 类似中间件，可扩展 |
| 事件历史 | 内存循环缓冲区 | 简单，重启后自然清空 |
| 优先级 | 数字优先级 | 简单直观 |
| 事件命名 | 域/模块/事件名 | 清晰的层次结构 |

### 2.6 与其他服务的关系

```
EventBusService 依赖:
├── LoggerService - 记录事件日志
└── 无其他依赖（核心基础设施）

其他服务依赖 EventBusService:
├── FileSystemService - 发布文件变更事件
├── EditorService - 发布编辑器事件
├── UserService - 发布用户事件
└── CommandCenter - 命令执行后发布事件
```

---

## 3. 命令中心（CommandCenter）

### 3.1 职责

- 统一命令注册和管理
- 命令调度和执行
- 命令撤销/重做（Undo/Redo）
- 命令历史记录
- 命令宏（命令组合）
- 命令权限控制

### 3.2 核心接口

```typescript
/**
 * 命令上下文
 */
interface CommandContext {
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
 * 命令定义
 */
interface CommandDefinition {
    /** 命令 ID（唯一标识） */
    id: string;

    /** 命令标签（用于 UI 展示和分类） */
    label?: string;

    /** 命令图标（用于菜单） */
    icon?: string;

    /** 命令分类（用于菜单分组） */
    category?: string;

    /** 快捷键绑定 */
    keybinding?: string;

    /** 命令是否可用（动态检查） */
    enabled?: (context: CommandContext) => boolean;

    /** 命令可见性 */
    visible?: (context: CommandContext) => boolean;
}

/**
 * 命令处理器
 */
interface CommandHandler<T = unknown, R = unknown> {
    /** 执行命令 */
    execute(args: T, context: CommandContext): Promise<R>;

    /** 撤销命令（可选，用于 Undo） */
    undo?(result: R, args: T, context: CommandContext): Promise<void>;

    /** 重做命令（可选，用于 Redo） */
    redo?(result: R, args: T, context: CommandContext): Promise<void>;
}

/**
 * 命令执行记录
 */
interface CommandExecutionRecord {
    /** 命令 ID */
    commandId: string;

    /** 命令参数 */
    args: unknown;

    /** 执行结果 */
    result: unknown;

    /** 执行时间 */
    timestamp: number;

    /** 是否可撤销 */
    undoable: boolean;

    /** 撤销数据（用于 Undo） */
    undoData?: unknown;
}

/**
 * 命令中心服务
 */
@Service({ singleton: true })
class CommandCenter extends ServiceBase {
    // 事件发射器
    private readonly _onCommandExecuted = new Emitter<{ commandId: string; result: unknown }>();
    private readonly _onWillExecute = new Emitter<{ commandId: string; args: unknown }>();

    /** 命令执行事件 */
    readonly onCommandExecuted = this._onCommandExecuted.event;

    /** 命令即将执行事件 */
    readonly onWillExecute = this._onWillExecute.event;

    /** 命令注册表 */
    private commands = new Map<string, CommandDefinition & { handler: CommandHandler }>();

    /** 命令历史（用于 Undo/Redo） */
    private commandHistory: CommandExecutionRecord[] = [];
    private readonly historyLimit = 100;

    /** Undo/Redo 栈 */
    private undoStack: CommandExecutionRecord[] = [];
    private redoStack: CommandExecutionRecord[] = [];

    /** 命令上下文 */
    private context: CommandContext = { permissions: [] };

    /**
     * 注册命令
     * @param definition 命令定义
     * @param handler 命令处理器
     */
    registerCommand<T, R>(
        definition: CommandDefinition,
        handler: CommandHandler<T, R>
    ): IDisposable;

    /**
     * 执行命令
     * @param commandId 命令 ID
     * @param args 命令参数
     * @param options 执行选项
     * @returns Promise<R>
     */
    executeCommand<T, R>(
        commandId: string,
        args?: T,
        options?: {
            /** 是否记录历史（用于 Undo） */
            recordHistory?: boolean;
            /** 是否触发事件 */
            fireEvent?: boolean;
        }
    ): Promise<R>;

    /**
     * 撤销上一个命令
     */
    undo(): Promise<void>;

    /**
     * 重做上一个撤销的命令
     */
    redo(): Promise<void>;

    /**
     * 清空历史记录
     */
    clearHistory(): void;

    /**
     * 获取命令历史
     */
    getHistory(limit?: number): CommandExecutionRecord[];

    /**
     * 获取可用的 Undo 数量
     */
    getUndoCount(): number;

    /**
     * 获取可用的 Redo 数量
     */
    getRedoCount(): number;

    /**
     * 检查命令是否可用
     */
    isCommandEnabled(commandId: string): boolean;

    /**
     * 检查命令是否可见
     */
    isCommandVisible(commandId: string): boolean;

    /**
     * 获取所有已注册的命令
     */
    getRegisteredCommands(): CommandDefinition[];

    /**
     * 获取命令定义
     */
    getCommand(commandId: string): CommandDefinition | undefined;

    /**
     * 更新命令上下文
     */
    updateContext(updates: Partial<CommandContext>): void;

    /**
     * 创建命令宏（命令序列）
     * @param macroId 宏 ID
     * @param commands 命令列表
     */
    createMacro(macroId: string, commands: Array<{ id: string; args?: unknown }>): void;

    /**
     * 执行宏
     */
    executeMacro(macroId: string): Promise<void>;

    override dispose(): void;
}
```

### 3.3 预定义命令

```typescript
/**
 * 文件相关命令
 */
namespace FileCommands {
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
namespace EditorCommands {
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
namespace ViewCommands {
    export const TOGGLE_SIDEBAR = 'view.toggleSidebar';
    export const TOGGLE_PANEL = 'view.togglePanel';
    export const ZOOM_IN = 'view.zoomIn';
    export const ZOOM_OUT = 'view.zoomOut';
    export const RESET_ZOOM = 'view.resetZoom';
}
```

### 3.4 命令处理器实现示例

```typescript
// 文件保存命令处理器
class SaveFileHandler implements CommandHandler<SaveFileArgs, SaveFileResult> {
    constructor(
        private fileSystemService: FileSystemService,
        private eventBus: EventBusService
    ) {}

    async execute(args: SaveFileArgs, context: CommandContext): Promise<SaveFileResult> {
        const result = await this.fileSystemService.saveFile(args.filePath, args.content);

        // 发布事件
        this.eventBus.publish({
            type: FileSystemEvents.FileSaved,
            source: 'commandCenter',
            payload: { filePath: args.filePath, savedAt: Date.now() }
        });

        return result;
    }

    async undo(result: SaveFileResult, args: SaveFileArgs): Promise<void> {
        // 恢复到保存前的内容
        if (result.previousContent) {
            await this.fileSystemService.saveFile(args.filePath, result.previousContent);
        }
    }
}

// 注册命令
commandCenter.registerCommand(
    {
        id: FileCommands.SAVE_FILE,
        label: '保存文件',
        category: '文件',
        keybinding: 'Ctrl+S',
        enabled: (ctx) => !!ctx.activeFile
    },
    saveFileHandler
);
```

### 3.5 使用示例

```typescript
// ===== 基本命令执行 =====

// 执行保存命令
await commandCenter.executeCommand(FileCommands.SAVE_FILE, {
    filePath: '/path/to/file.txt',
    content: 'Hello, World!'
});

// ===== Undo/Redo =====

// 执行可撤销的命令
await commandCenter.executeCommand(
    FileCommands.DELETE_FILE,
    { filePath: '/path/to/file.txt' },
    { recordHistory: true }
);

// 撤销
await commandCenter.undo();

// 重做
await commandCenter.redo();

// 获取 Undo/Redo 状态
console.log(`可撤销：${commandCenter.getUndoCount()} 个操作`);
console.log(`可重做：${commandCenter.getRedoCount()} 个操作`);

// ===== 命令宏 =====

// 创建保存并关闭宏
commandCenter.createMacro('file.saveAndClose', [
    { id: FileCommands.SAVE_FILE },
    { id: FileCommands.CLOSE_FILE }
]);

// 执行宏
await commandCenter.executeMacro('file.saveAndClose');

// ===== 命令上下文 =====

// 更新上下文
commandCenter.updateContext({
    activeFile: currentFile,
    permissions: ['file.read', 'file.write']
});

// 命令根据上下文自动启用/禁用
const canSave = commandCenter.isCommandEnabled(FileCommands.SAVE_FILE);

// ===== 监听命令执行 =====

commandCenter.onCommandExecuted(({ commandId, result }) => {
    logger.info(`命令执行：${commandId}`);

    // 记录到操作日志
    auditService.log({
        command: commandId,
        timestamp: Date.now(),
        result
    });
});
```

### 3.6 设计决策

| 决策点 | 选择 | 理由 |
|--------|------|------|
| 命令注册 | 集中式注册 | 统一管理，便于查询 |
| Undo/Redo | 命令模式 | 每个命令负责自己的撤销逻辑 |
| 命令历史 | 限制数量 | 防止内存泄漏 |
| 命令上下文 | 集中管理 | 统一的权限和状态检查 |
| 命令宏 | 序列组合 | 支持复杂操作复用 |
| 快捷键绑定 | 命令绑定 | 与 UI 解耦 |

### 3.7 与事件总线的关系

```
命令执行流程:
1. 用户触发命令（快捷键/菜单）
2. CommandCenter.executeCommand()
3. 触发 onWillExecute 事件
4. 执行 handler.execute()
5. 记录历史（如果可撤销）
6. 触发 onCommandExecuted 事件
7. EventBus 发布相关领域事件
```

---

## 4. 消息通道（MessageChannelService）

### 4.1 职责

- 模块间点对点消息传递
- 进程间通信（Web Worker 通信）
- 消息路由和分发
- 请求 - 响应模式支持
- 消息持久化（可选）
- 消息确认和重试

### 4.2 与事件总线的区别

| 特性 | 事件总线 | 消息通道 |
|------|----------|----------|
| 模式 | 发布/订阅（一对多） | 点对点/请求响应（一对一） |
| 发送者 | 不关心接收者 | 明确指定接收者 |
| 响应 | 无响应（fire-and-forget） | 支持请求 - 响应 |
| 持久化 | 短期历史 | 可选持久化 |
| 使用场景 | 状态同步、通知 | RPC、数据传递 |

### 4.3 核心接口

```typescript
/**
 * 消息定义
 */
interface Message<T = unknown> {
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
interface MessageResponse<R = unknown> {
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
type MessageHandler<T = unknown, R = unknown> = (
    message: Message<T>,
    context: MessageContext
) => Promise<R>;

/**
 * 消息上下文
 */
interface MessageContext {
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
interface ChannelConfig {
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

/**
 * 消息通道服务
 */
@Service({ singleton: true })
class MessageChannelService extends ServiceBase {
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
    private pendingRequests = new Map<string, {
        resolve: (response: unknown) => void;
        reject: (error: Error) => void;
        timeout: number;
    }>();

    /** 本地消息队列 */
    private messageQueue: Message[] = [];
    private readonly queueLimit = 1000;

    /**
     * 创建通道
     * @param config 通道配置
     */
    createChannel(config: ChannelConfig): IDisposable;

    /**
     * 注册消息处理器
     * @param messageType 消息类型
     * @param handler 处理函数
     */
    registerHandler<T, R>(
        messageType: string,
        handler: MessageHandler<T, R>
    ): IDisposable;

    /**
     * 发送消息（不等待响应）
     * @param message 消息定义
     */
    send<T>(message: Omit<Message<T>, 'id' | 'timestamp'>): void;

    /**
     * 发送消息并等待响应
     * @param message 消息定义
     * @returns Promise<R>
     */
    request<T, R>(message: Omit<Message<T>, 'id' | 'timestamp'>): Promise<R>;

    /**
     * 回复消息
     * @param originalMessage 原始消息
     * @param response 响应数据
     */
    reply<R>(originalMessage: Message, response: R): void;

    /**
     * 广播消息（所有通道）
     */
    broadcast<T>(message: Omit<Message<T>, 'id' | 'timestamp' | 'receiver'>): void;

    /**
     * 获取消息历史
     */
    getHistory(options?: {
        sender?: string;
        receiver?: string;
        type?: string;
        limit?: number
    }): Message[];

    /**
     * 清理过期的待处理请求
     */
    cleanupPendingRequests(): void;

    override dispose(): void;
}
```

### 4.4 Worker 通信适配器

```typescript
/**
 * Worker 通信适配器
 * 用于与 Web Worker 进行消息通信
 */
class WorkerAdapter {
    private worker: Worker;
    private channelId: string;

    constructor(worker: Worker, channelId: string, messageChannel: MessageChannelService) {
        this.worker = worker;
        this.channelId = channelId;

        // 监听 Worker 消息
        this.worker.onmessage = (event) => {
            const message = event.data as Message;
            messageChannel.send({
                type: message.type,
                sender: this.channelId,
                receiver: 'main',
                payload: message.payload
            });
        };
    }

    postMessage<T>(message: Message<T>): void {
        this.worker.postMessage(message);
    }

    terminate(): void {
        this.worker.terminate();
    }
}
```

### 4.5 使用示例

```typescript
// ===== 本地模块间通信 =====

// 模块 A - 发送请求
const result = await messageChannel.request<FileContentRequest, FileContent>(
    {
        type: 'file/getContent',
        sender: 'editorModule',
        receiver: 'fileModule',
        payload: { filePath: '/path/to/file.txt' },
        requireAck: true,
        timeout: 5000
    }
);

// 模块 B - 处理请求
messageChannel.registerHandler('file/getContent', async (message) => {
    const content = await fileSystemService.readFile(message.payload.filePath);
    return { content };
});

// ===== Worker 通信 =====

// 主线程 - 发送计算任务
const searchResult = await messageChannel.request<SearchRequest, SearchResult>(
    {
        type: 'search/execute',
        sender: 'main',
        receiver: 'worker-search',
        payload: { query: 'hello', documents: largeArray },
        timeout: 30000
    }
);

// Worker - 处理搜索请求
messageChannel.registerHandler('search/execute', async (message) => {
    const { query, documents } = message.payload;
    const results = performSearch(query, documents);
    return { results };
});

// ===== 广播消息 =====

// 向所有模块广播配置变更
messageChannel.broadcast({
    type: 'config/changed',
    sender: 'configService',
    payload: { key: 'theme', value: 'dark' }
});

// ===== 消息确认 =====

// 发送需要确认的消息
messageChannel.send({
    type: 'notification/show',
    sender: 'main',
    receiver: 'notificationModule',
    payload: { title: '完成', message: '操作成功' },
    requireAck: true
});

// 监听消息发送成功
messageChannel.onMessageSent((message) => {
    if (message.requireAck) {
        logger.info(`消息已发送：${message.id}`);
    }
});

// ===== 消息历史 =====

// 获取与特定模块的消息历史
const history = messageChannel.getHistory({
    sender: 'editorModule',
    receiver: 'fileModule',
    limit: 50
});

// 审计所有消息
messageChannel.onMessageReceived((message) => {
    auditService.log({
        type: 'message',
        from: message.sender,
        to: message.receiver,
        messageType: message.type,
        timestamp: message.timestamp
    });
});
```

### 4.6 设计决策

| 决策点 | 选择 | 理由 |
|--------|------|------|
| 消息 ID | 自动生成 UUID | 全局唯一，便于追踪 |
| 请求 - 响应 | correlationId 关联 | 支持并发请求 |
| 确认机制 | 可选 | 重要消息才需要确认 |
| 超时处理 | 每个消息独立 | 灵活控制 |
| 持久化 | 可选 | 按需启用 |
| Worker 通信 | 统一消息抽象 | 与本地通信 API 一致 |

### 4.7 与 WorkerPoolService 的关系

```
MessageChannelService 与 WorkerPoolService 协作:

WorkerPoolService 负责:
- Worker 的创建和生命周期管理
- 任务队列和调度
- Worker 扩缩容

MessageChannelService 负责:
- 与 Worker 的消息通信协议
- 请求 - 响应模式封装
- 消息路由

典型使用:
workerPool.submit({
    type: 'search',
    payload: {...}
});

// 底层使用 MessageChannelService 与 Worker 通信
```

---

## 5. 数据流

### 5.1 事件总线数据流

```
发布事件
    │
    ▼
事件拦截器链
    │
    ├──► 拦截器 1（日志）
    ├──► 拦截器 2（权限）
    └──► 拦截器 N
    │
    ▼
事件通过？──否──► 终止
    │
   是
    ▼
查找订阅者
    │
    ├──► 同步监听器（按优先级）
    │
    └──► 异步监听器（按优先级）
    │
    ▼
记录事件历史
    │
    ▼
触发 onEventHandled
```

### 5.2 命令中心数据流

```
用户触发命令
    │
    ▼
检查命令是否注册
    │
    ├──► 未注册 ──► 抛出错误
    │
   已注册
    │
    ▼
检查命令是否可用 (enabled)
    │
    ├──► 不可用 ──► 忽略或提示
    │
   可用
    │
    ▼
触发 onWillExecute
    │
    ▼
执行 handler.execute()
    │
    ├──► 成功 ──► 记录历史 ──► 触发 onCommandExecuted
    │
    └──► 失败 ──► 抛出错误
```

### 5.3 消息通道数据流

```
发送消息
    │
    ▼
生成消息 ID
    │
    ▼
添加到消息队列
    │
    ▼
路由到接收者
    │
    ├──► 本地模块 ──► 直接调用 handler
    │
    ├──► Worker ──► postMessage
    │
    └──► 广播 ──► 所有通道
    │
    ▼
是否需要响应？
    │
    ├──► 否 ──► 完成
    │
    └──► 是 ──► 等待响应 ──► 超时处理
```

---

## 6. 错误处理

### 6.1 事件总线

| 错误场景 | 处理方式 |
|----------|----------|
| 监听器抛出异常 | 捕获异常，记录日志，继续执行其他监听器 |
| 事件拦截器异常 | 终止事件传递，记录日志 |
| 事件历史溢出 | 移除最早的事件（FIFO） |

### 6.2 命令中心

| 错误场景 | 处理方式 |
|----------|----------|
| 命令未注册 | 抛出 CommandNotFoundError |
| 命令执行失败 | 抛出异常，不记录历史 |
| Undo 失败 | 记录错误，尝试补偿操作 |
| 命令历史溢出 | 移除最早的历史记录 |

### 6.3 消息通道

| 错误场景 | 处理方式 |
|----------|----------|
| 接收者不存在 | 丢弃消息，记录警告 |
| 请求超时 | reject Promise，清理 pending 请求 |
| Worker 崩溃 | 重新创建 Worker，重试消息（如果 maxRetries > 0） |
| 消息队列溢出 | 丢弃最早的消息 |

---

## 7. 测试策略

### 7.1 单元测试

```typescript
// EventBusService 测试
describe('EventBusService', () => {
    it('应支持基本发布/订阅', async () => {
        const mock = vi.fn();
        const sub = eventBus.subscribe('test.event', mock);

        await eventBus.publish({ type: 'test.event', payload: {} });

        expect(mock).toHaveBeenCalled();
        sub.dispose();
    });

    it('应支持事件拦截', async () => {
        const mock = vi.fn();
        eventBus.subscribe('test.event', mock);

        eventBus.addInterceptor((event) => {
            if (event.type === 'test.event') return null;  // 阻止
            return event;
        });

        await eventBus.publish({ type: 'test.event', payload: {} });
        expect(mock).not.toHaveBeenCalled();
    });

    it('应支持优先级订阅', async () => {
        const calls: string[] = [];

        eventBus.subscribe('test.event', () => calls.push('low'), { priority: 10 });
        eventBus.subscribe('test.event', () => calls.push('high'), { priority: 100 });

        await eventBus.publish({ type: 'test.event', payload: {} });

        expect(calls).toEqual(['high', 'low']);
    });
});

// CommandCenter 测试
describe('CommandCenter', () => {
    it('应注册和执行命令', async () => {
        const handler: CommandHandler = {
            execute: vi.fn().mockResolvedValue({ success: true })
        };

        commandCenter.registerCommand({ id: 'test.cmd' }, handler);

        const result = await commandCenter.executeCommand('test.cmd');
        expect(result).toEqual({ success: true });
    });

    it('应支持 Undo/Redo', async () => {
        let state = 0;

        const handler: CommandHandler = {
            execute: async () => { state++; return state; },
            undo: async () => { state--; }
        };

        commandCenter.registerCommand({ id: 'increment' }, handler);

        await commandCenter.executeCommand('increment', undefined, { recordHistory: true });
        expect(state).toBe(1);

        await commandCenter.undo();
        expect(state).toBe(0);

        await commandCenter.redo();
        expect(state).toBe(1);
    });
});

// MessageChannelService 测试
describe('MessageChannelService', () => {
    it('应支持本地消息传递', async () => {
        const mock = vi.fn();
        messageChannel.registerHandler('test.msg', mock);

        messageChannel.send({
            type: 'test.msg',
            sender: 'test',
            receiver: 'main',
            payload: {}
        });

        await new Promise(r => setTimeout(r, 10));
        expect(mock).toHaveBeenCalled();
    });

    it('应支持请求 - 响应', async () => {
        messageChannel.registerHandler('echo', async (msg) => ({
            echo: msg.payload
        }));

        const response = await messageChannel.request({
            type: 'echo',
            sender: 'test',
            receiver: 'main',
            payload: { value: 'hello' }
        });

        expect(response).toEqual({ echo: { value: 'hello' } });
    });

    it('应处理请求超时', async () => {
        messageChannel.registerHandler('slow', async () => {
            await new Promise(r => setTimeout(r, 1000));
            return {};
        });

        await expect(
            messageChannel.request({
                type: 'slow',
                sender: 'test',
                receiver: 'main',
                payload: {},
                timeout: 50
            })
        ).rejects.toThrow('Request timeout');
    });
});
```

---

## 8. 实施顺序

1. **EventBusService** - 最基础，其他服务依赖
2. **CommandCenter** - 依赖 EventBus 发布命令事件
3. **MessageChannelService** - 相对独立，可并行开发

---

## 9. 与其他服务关系

```
EventBusService ─┬──► LoggerService（记录事件）
                 └──► 无其他依赖

CommandCenter ─┬──► EventBusService（发布命令事件）
               └──► LoggerService（记录命令日志）

MessageChannelService ─┬──► LoggerService（记录消息日志）
                       ├──► WorkerPoolService（Worker 通信）
                       └──► 无其他强依赖
```

---

## 10. 总结

本批次三个服务提供应用内通信和调度能力：

| 服务 | 价值 | 复杂度 |
|------|------|--------|
| EventBusService | 解耦服务间通信 | 中 |
| CommandCenter | 统一命令管理和 Undo/Redo | 中高 |
| MessageChannelService | 进程间/模块间通信 | 中 |

这三个服务与已有的 LoggerService、StorageService 等一起构成完整的基础设施层。
