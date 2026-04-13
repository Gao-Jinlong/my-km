import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LogLevel } from '../types';
import { ConsoleWriter } from '../writers/console';

describe('ConsoleWriter', () => {
    let writer: ConsoleWriter;
    let originalConsole: Console;

    beforeEach(() => {
        writer = new ConsoleWriter();
        originalConsole = global.console;
        global.console = {
            ...originalConsole,
            debug: vi.fn(),
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
        };
    });

    afterEach(() => {
        global.console = originalConsole;
        writer.dispose();
    });

    it('应正确设置 name', () => {
        expect(writer.name).toBe('ConsoleWriter');
    });

    it('应输出 DEBUG 日志', () => {
        const entry = {
            level: LogLevel.DEBUG,
            category: 'test',
            message: 'Debug message',
            timestamp: Date.now(),
        };

        writer.write(entry);

        expect(console.debug).toHaveBeenCalled();
    });

    it('应输出 INFO 日志', () => {
        const entry = {
            level: LogLevel.INFO,
            category: 'test',
            message: 'Info message',
            timestamp: Date.now(),
        };

        writer.write(entry);

        expect(console.info).toHaveBeenCalled();
    });

    it('应输出 WARN 日志', () => {
        const entry = {
            level: LogLevel.WARN,
            category: 'test',
            message: 'Warning message',
            timestamp: Date.now(),
        };

        writer.write(entry);

        expect(console.warn).toHaveBeenCalled();
    });

    it('应输出 ERROR 日志', () => {
        const entry = {
            level: LogLevel.ERROR,
            category: 'test',
            message: 'Error message',
            timestamp: Date.now(),
        };

        writer.write(entry);

        expect(console.error).toHaveBeenCalled();
    });

    it('应包含附加数据', () => {
        const entry = {
            level: LogLevel.INFO,
            category: 'test',
            message: 'With data',
            timestamp: Date.now(),
            data: [{ key: 'value' }, 123],
        };

        writer.write(entry);

        expect(console.info).toHaveBeenCalledWith(expect.any(String), { key: 'value' }, 123);
    });

    it('应包含位置信息（如果有）', () => {
        const entry = {
            level: LogLevel.INFO,
            category: 'test',
            message: 'With location',
            timestamp: Date.now(),
            location: 'test.ts:10',
        };

        writer.write(entry);

        const call = (console.info as any).mock.calls[0];
        expect(call[0]).toContain('@ test.ts:10');
    });
});
