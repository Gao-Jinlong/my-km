// apps/web/src/platform/logger/types.ts

export enum LogLevel {
    /** 调试信息，仅在开发模式显示 */
    DEBUG = 0,
    /** 普通信息 */
    INFO = 1,
    /** 警告信息 */
    WARN = 2,
    /** 错误信息 */
    ERROR = 3,
    /** 不输出任何日志 */
    NONE = 4,
}

export function LogLevelToString(level: LogLevel): string {
    switch (level) {
        case LogLevel.DEBUG:
            return 'DEBUG';
        case LogLevel.INFO:
            return 'INFO';
        case LogLevel.WARN:
            return 'WARN';
        case LogLevel.ERROR:
            return 'ERROR';
        case LogLevel.NONE:
            return 'NONE';
        default:
            return 'UNKNOWN';
    }
}

export function parseLogLevel(level: string | number): LogLevel {
    if (typeof level === 'number') {
        return level;
    }
    switch (level.toUpperCase()) {
        case 'DEBUG':
            return LogLevel.DEBUG;
        case 'INFO':
            return LogLevel.INFO;
        case 'WARN':
            return LogLevel.WARN;
        case 'ERROR':
            return LogLevel.ERROR;
        case 'NONE':
            return LogLevel.NONE;
        default:
            return LogLevel.INFO;
    }
}

export interface LogEntry {
    /** 日志级别 */
    level: LogLevel;
    /** 日志分类（如 'storage', 'command', 'event-bus'） */
    category: string;
    /** 日志消息 */
    message: string;
    /** 附加数据 */
    data?: unknown[];
    /** 时间戳 */
    timestamp: number;
    /** 调用位置（文件：行号） */
    location?: string;
}

export interface LogWriter {
    readonly name: string;
    write(entry: LogEntry): void | Promise<void>;
    dispose(): void;
}

export interface LoggerOptions {
    /** 最低日志级别 */
    minLevel?: LogLevel;
    /** 默认分类 */
    defaultCategory?: string;
    /** 是否包含调用位置 */
    includeLocation?: boolean;
    /** 输出目标 */
    writers?: LogWriter[];
}

export interface LoggerConfig {
    /** 全局日志级别 */
    globalLevel: LogLevel;
    /** 分类级别覆盖（特定分类可使用不同级别） */
    categoryLevels: Map<string, LogLevel>;
    /** 启用的输出目标 */
    writers: LogWriter[];
}

export interface Logger {
    /** 设置日志级别 */
    setLevel(level: LogLevel): void;
    /** 获取日志级别 */
    getLevel(): LogLevel;
    /** 调试日志 */
    debug(message: string, ...data: unknown[]): void;
    /** 信息日志 */
    info(message: string, ...data: unknown[]): void;
    /** 警告日志 */
    warn(message: string, ...data: unknown[]): void;
    /** 错误日志 */
    error(message: string, ...data: unknown[]): void;
    /** 创建子分类 logger */
    child(category: string): Logger;
}

export interface ILoggerService {
    /** 获取 logger */
    getLogger(category?: string): Logger;
    /** 设置全局日志级别 */
    setGlobalLevel(level: LogLevel): void;
    /** 设置分类日志级别 */
    setCategoryLevel(category: string, level: LogLevel): void;
    /** 添加输出目标 */
    addWriter(writer: LogWriter): void;
    /** 移除输出目标 */
    removeWriter(name: string): void;
    /** 获取所有日志条目（用于调试） */
    getHistory(limit?: number): LogEntry[];
}
