import { describe, expect, it } from 'vitest';
import * as Logger from '../index';

describe('Logger Module Exports', () => {
    it('应导出所有类型和类', () => {
        expect(Logger.LogLevel).toBeDefined();
        expect(Logger.LoggerService).toBeDefined();
        expect(Logger.SimpleLogger).toBeDefined();
        expect(Logger.ConsoleWriter).toBeDefined();
        expect(Logger.LoggerError).toBeDefined();
        expect(Logger.LoggerNotInitializedError).toBeDefined();
        expect(Logger.LogLevelToString).toBeDefined();
        expect(Logger.parseLogLevel).toBeDefined();
    });

    it('应可实例化并正常工作', () => {
        const service = new Logger.LoggerService();
        const logger = service.getLogger('test');
        logger.info('test message');
        expect(service.getHistory().length).toBe(1);
    });

    it('应支持 LogLevel 枚举', () => {
        expect(Logger.LogLevel.DEBUG).toBe(0);
        expect(Logger.LogLevel.INFO).toBe(1);
        expect(Logger.LogLevel.WARN).toBe(2);
        expect(Logger.LogLevel.ERROR).toBe(3);
    });

    it('应支持 LogLevelToString 转换', () => {
        expect(Logger.LogLevelToString(Logger.LogLevel.DEBUG)).toBe('DEBUG');
        expect(Logger.LogLevelToString(Logger.LogLevel.INFO)).toBe('INFO');
    });

    it('应支持 parseLogLevel 解析', () => {
        expect(Logger.parseLogLevel('debug')).toBe(Logger.LogLevel.DEBUG);
        expect(Logger.parseLogLevel('INFO')).toBe(Logger.LogLevel.INFO);
        expect(Logger.parseLogLevel('unknown')).toBe(Logger.LogLevel.INFO);
    });
});
