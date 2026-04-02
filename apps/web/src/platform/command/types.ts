// apps/web/src/platform/command/types.ts

import type { Event } from '@/base/common/event';
import type { IDisposable } from '@/base/common/lifecycle';

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
export type CommandHandler = (context: CommandContext) => undefined | Promise<unknown>;

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

/**
 * 命令拦截器
 */
export interface CommandInterceptor {
    /** 执行前钩子（可取消） */
    before?: (context: CommandContext) => undefined | Promise<boolean | undefined>;

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

/**
 * 命令服务接口
 */
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
