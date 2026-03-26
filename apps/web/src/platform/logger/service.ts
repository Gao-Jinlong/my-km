// apps/web/src/platform/logger/service.ts

import { SimpleLogger } from './logger';
import type { ILoggerService, LogEntry, Logger, LogWriter } from './types';
import { LogLevel } from './types';
import { ConsoleWriter } from './writers/console';

export class LoggerService implements ILoggerService {
    private globalLevel: LogLevel = LogLevel.INFO;
    private categoryLevels = new Map<string, LogLevel>();
    private writers: LogWriter[] = [];
    private loggers = new Map<string, SimpleLogger>();
    private history: LogEntry[] = [];
    private readonly historyLimit = 1000;
    private includeLocation = false;

    constructor() {
        // 默认添加控制台输出
        this.writers.push(new ConsoleWriter());
    }

    /**
     * 初始化日志服务
     */
    async initialize(): Promise<void> {
        // 可选：从配置读取初始设置
    }

    /**
     * 获取 logger
     */
    getLogger(category?: string): Logger {
        const cat = category || 'app';
        let logger = this.loggers.get(cat);

        if (!logger) {
            const level = this.categoryLevels.get(cat) ?? this.globalLevel;
            logger = new SimpleLogger(cat, level, this.writers, this.includeLocation);
            this.loggers.set(cat, logger);
        }

        return logger;
    }

    /**
     * 设置全局日志级别
     */
    setGlobalLevel(level: LogLevel): void {
        this.globalLevel = level;
        // 更新所有 logger 的级别（除非有分类覆盖）
        for (const [category, logger] of this.loggers.entries()) {
            if (!this.categoryLevels.has(category)) {
                logger.setLevel(level);
            }
        }
    }

    /**
     * 设置分类日志级别
     */
    setCategoryLevel(category: string, level: LogLevel): void {
        this.categoryLevels.set(category, level);
        const logger = this.loggers.get(category);
        if (logger) {
            logger.setLevel(level);
        }
    }

    /**
     * 添加输出目标
     */
    addWriter(writer: LogWriter): void {
        this.writers.push(writer);
        // 需要重新创建所有 logger 以包含新 writer
        this.loggers.clear();
    }

    /**
     * 移除输出目标
     */
    removeWriter(name: string): void {
        const index = this.writers.findIndex(w => w.name === name);
        if (index !== -1) {
            this.writers[index].dispose();
            this.writers.splice(index, 1);
            // 重新创建所有 logger
            this.loggers.clear();
        }
    }

    /**
     * 获取历史日志
     */
    getHistory(limit?: number): LogEntry[] {
        const l = limit ?? this.history.length;
        return this.history.slice(-l);
    }

    /**
     * 清空历史
     */
    clearHistory(): void {
        this.history = [];
    }

    /**
     * 启用调用位置跟踪
     */
    enableLocationTracking(): void {
        this.includeLocation = true;
        this.loggers.clear(); // 需要重新创建所有 logger
    }

    dispose(): void {
        for (const writer of this.writers) {
            writer.dispose();
        }
        this.writers = [];
        this.loggers.clear();
        this.history = [];
    }

    // 供 SimpleLogger 内部使用
    protected addToHistory(entry: LogEntry): void {
        this.history.push(entry);
        if (this.history.length > this.historyLimit) {
            this.history.shift();
        }
    }
}
