import { describe, expect, it } from 'vitest';
import { LoggerError, LoggerNotInitializedError } from '../errors';

describe('Logger Errors', () => {
    it('应正确定义 LoggerError', () => {
        const error = new LoggerError('测试错误');
        expect(error.name).toBe('LoggerError');
        expect(error.message).toBe('测试错误');
    });

    it('应正确定义 LoggerNotInitializedError', () => {
        const error = new LoggerNotInitializedError();
        expect(error.name).toBe('LoggerNotInitializedError');
        expect(error.message).toContain('日志服务未初始化');
    });

    it('LoggerNotInitializedError 应是 LoggerError 的子类', () => {
        const error = new LoggerNotInitializedError();
        expect(error).toBeInstanceOf(LoggerError);
        expect(error).toBeInstanceOf(Error);
    });
});
