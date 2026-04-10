// apps/web/src/platform/logger/writers/console.ts

import type { LogEntry, LogWriter } from '../types';
import { LogLevel, LogLevelToString } from '../types';

const LEVEL_COLORS: Record<number, string> = {
    [LogLevel.DEBUG]: '#6B7280', // gray
    [LogLevel.INFO]: '#2563EB', // blue
    [LogLevel.WARN]: '#D97706', // orange
    [LogLevel.ERROR]: '#DC2626', // red
};

export class ConsoleWriter implements LogWriter {
    readonly name = 'ConsoleWriter';

    write(entry: LogEntry): void {
        const time = new Date(entry.timestamp).toISOString().slice(11, 23);
        const levelStr = LogLevelToString(entry.level);
        const location = entry.location ? ` @ ${entry.location}` : '';
        const prefix = `[${time}] [${levelStr}] [${entry.category}]${location}`;
        const style = `color: ${LEVEL_COLORS[entry.level] || '#000'}; font-weight: bold;`;
        const args = [`%c${prefix}`, style, entry.message, ...(entry.data || [])];

        switch (entry.level) {
            case LogLevel.DEBUG:
                console.debug(...args);
                break;
            case LogLevel.INFO:
                console.info(...args);
                break;
            case LogLevel.WARN:
                console.warn(...args);
                break;
            case LogLevel.ERROR:
                console.error(...args);
                break;
        }
    }

    dispose(): void {
        // Console 无需清理
    }
}
