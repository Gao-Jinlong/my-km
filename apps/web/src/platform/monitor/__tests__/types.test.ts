import { describe, expect, it } from 'vitest';
import { LogLevel, LogLevelToString, parseLogLevel } from '../types';

describe('MonitorService Types', () => {
    it('应正确定义日志级别', () => {
        expect(LogLevel.DEBUG).toBe(0);
        expect(LogLevel.INFO).toBe(1);
        expect(LogLevel.WARN).toBe(2);
        expect(LogLevel.ERROR).toBe(3);
        expect(LogLevel.NONE).toBe(4);
    });

    it('应正确转换级别为字符串', () => {
        expect(LogLevelToString(LogLevel.DEBUG)).toBe('DEBUG');
        expect(LogLevelToString(LogLevel.INFO)).toBe('INFO');
        expect(LogLevelToString(LogLevel.WARN)).toBe('WARN');
        expect(LogLevelToString(LogLevel.ERROR)).toBe('ERROR');
    });

    it('应正确解析字符串级别', () => {
        expect(parseLogLevel('debug')).toBe(LogLevel.DEBUG);
        expect(parseLogLevel('INFO')).toBe(LogLevel.INFO);
        expect(parseLogLevel('Warn')).toBe(LogLevel.WARN);
        expect(parseLogLevel('ERROR')).toBe(LogLevel.ERROR);
    });

    it('应正确解析数字级别', () => {
        expect(parseLogLevel(0)).toBe(LogLevel.DEBUG);
        expect(parseLogLevel(1)).toBe(LogLevel.INFO);
    });

    it('未知字符串应返回 INFO', () => {
        expect(parseLogLevel('unknown')).toBe(LogLevel.INFO);
    });
});
