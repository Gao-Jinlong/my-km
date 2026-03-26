// apps/web/src/platform/logger/writers/console.ts

import type { LogEntry, LogWriter } from '../types';
import { LogLevelToString } from '../types';

const LEVEL_COLORS: Record<number, string> = {
    0: '\x1b[36m', // DEBUG - Cyan
    1: '\x1b[32m', // INFO - Green
    2: '\x1b[33m', // WARN - Yellow
    3: '\x1b[31m', // ERROR - Red
};

const RESET = '\x1b[0m';

export class ConsoleWriter implements LogWriter {
    readonly name = 'ConsoleWriter';

    private formatEntry(entry: LogEntry): string {
        const levelStr = LogLevelToString(entry.level);
        const color = LEVEL_COLORS[entry.level] || '';
        const time = new Date(entry.timestamp).toISOString();
        const location = entry.location ? ` @ ${entry.location}` : '';

        return `${color}[${time}] [${levelStr}] [${entry.category}]${location}: ${entry.message}${RESET}`;
    }

    write(entry: LogEntry): void {
        const formatted = this.formatEntry(entry);
        const args = [formatted, ...(entry.data || [])];

        switch (entry.level) {
            case 0: // DEBUG
                console.debug(...args);
                break;
            case 1: // INFO
                console.info(...args);
                break;
            case 2: // WARN
                console.warn(...args);
                break;
            case 3: // ERROR
                console.error(...args);
                break;
        }
    }

    dispose(): void {
        // Console 无需清理
    }
}
