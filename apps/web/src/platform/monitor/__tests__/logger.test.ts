import { describe, expect, it, vi } from 'vitest';
import { SimpleLogger } from '../logger';
import { LogLevel } from '../types';

describe('SimpleLogger', () => {
    const mockWriter = {
        name: 'MockWriter',
        write: vi.fn(),
        dispose: vi.fn(),
    };

    it('应创建 logger', () => {
        const logger = new SimpleLogger('test', LogLevel.INFO, [mockWriter]);
        expect(logger).toBeDefined();
    });

    it('应设置和获取级别', () => {
        const logger = new SimpleLogger('test', LogLevel.INFO, [mockWriter]);
        expect(logger.getLevel()).toBe(LogLevel.INFO);
        logger.setLevel(LogLevel.DEBUG);
        expect(logger.getLevel()).toBe(LogLevel.DEBUG);
    });

    it('应过滤低于级别的日志', () => {
        mockWriter.write.mockClear();
        const logger = new SimpleLogger('test', LogLevel.WARN, [mockWriter]);

        logger.debug('debug message'); // 应被过滤
        logger.info('info message'); // 应被过滤
        logger.warn('warn message'); // 应输出
        logger.error('error message'); // 应输出

        expect(mockWriter.write).toHaveBeenCalledTimes(2);
    });

    it('应输出所有级别当级别为 DEBUG', () => {
        mockWriter.write.mockClear();
        const logger = new SimpleLogger('test', LogLevel.DEBUG, [mockWriter]);

        logger.debug('debug');
        logger.info('info');
        logger.warn('warn');
        logger.error('error');

        expect(mockWriter.write).toHaveBeenCalledTimes(4);
    });

    it('应创建子分类 logger', () => {
        mockWriter.write.mockClear();
        const logger = new SimpleLogger('parent', LogLevel.INFO, [mockWriter]);
        const child = logger.child('child');

        expect(child).toBeDefined();
        child.info('message');

        const call = mockWriter.write.mock.calls[0][0];
        expect(call.category).toBe('parent.child');
    });
});
