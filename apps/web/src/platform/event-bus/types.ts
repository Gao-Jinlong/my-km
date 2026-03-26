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

/**
 * 事件监听器类型
 */
export type EventListener<T = unknown> = (event: EventDefinition<T>) => void | Promise<void>;

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
