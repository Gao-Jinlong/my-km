// apps/web/src/platform/monitor/index.ts

// 访问工具
export { getMonitor } from './accessor';
// 错误
export { LoggerError, LoggerNotInitializedError } from './errors';
// Logger 实现
export { SimpleLogger } from './logger';
// 服务
export { MonitorService } from './service';

// 类型
export type {
    IMonitorService,
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
