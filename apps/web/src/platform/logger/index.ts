// apps/web/src/platform/logger/index.ts

// 错误
export { LoggerError, LoggerNotInitializedError } from './errors';

// Logger 实现
export { SimpleLogger } from './logger';
// 服务
export { LoggerService } from './service';

// 类型
export type {
    ILoggerService,
    LogEntry,
    Logger,
    LoggerConfig,
    LoggerOptions,
    LogWriter,
} from './types';
// 枚举和工具
export { LogLevel, LogLevelToString, parseLogLevel } from './types';
// Writer
export { ConsoleWriter } from './writers/console';
