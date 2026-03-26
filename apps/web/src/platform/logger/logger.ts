// apps/web/src/platform/logger/logger.ts

import type { LogEntry, Logger, LogLevel, LogWriter } from './types';

export class SimpleLogger implements Logger {
    private level: LogLevel;
    private category: string;
    private writers: LogWriter[];
    private includeLocation: boolean;
    private onLog?: (entry: LogEntry) => void;

    constructor(
        category: string,
        level: LogLevel,
        writers: LogWriter[],
        includeLocation = false,
        onLog?: (entry: LogEntry) => void,
    ) {
        this.category = category;
        this.level = level;
        this.writers = [...writers];
        this.includeLocation = includeLocation;
        this.onLog = onLog;
    }

    setLevel(level: LogLevel): void {
        this.level = level;
    }

    getLevel(): LogLevel {
        return this.level;
    }

    debug(message: string, ...data: unknown[]): void {
        this.log(0, message, ...data);
    }

    info(message: string, ...data: unknown[]): void {
        this.log(1, message, ...data);
    }

    warn(message: string, ...data: unknown[]): void {
        this.log(2, message, ...data);
    }

    error(message: string, ...data: unknown[]): void {
        this.log(3, message, ...data);
    }

    child(category: string): Logger {
        const fullCategory = `${this.category}.${category}`;
        return new SimpleLogger(
            fullCategory,
            this.level,
            this.writers,
            this.includeLocation,
            this.onLog,
        );
    }

    private log(level: LogLevel, message: string, ...data: unknown[]): void {
        // 检查级别
        if (level < this.level) {
            return;
        }

        const entry: LogEntry = {
            level,
            category: this.category,
            message,
            data,
            timestamp: Date.now(),
        };

        // 可选：添加调用位置
        if (this.includeLocation) {
            entry.location = this.getLocation();
        }

        // 写入所有输出目标
        for (const writer of this.writers) {
            writer.write(entry);
        }

        // 通知服务添加到历史
        this.onLog?.(entry);
    }

    private getLocation(): string {
        const error = new Error();
        const stack = error.stack;
        if (!stack) return '';

        // 解析堆栈，获取调用位置
        const lines = stack.split('\n');
        // 通常是第 3 行（error 创建 -> getLocation -> log -> 用户调用）
        const line = lines[3] || lines[2];
        const match = line.match(/at (.+):(\d+):(\d+)/);
        if (match) {
            return `${match[1]}:${match[2]}`;
        }
        return '';
    }
}
