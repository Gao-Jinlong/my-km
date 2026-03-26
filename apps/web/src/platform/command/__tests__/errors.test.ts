import { describe, expect, it } from 'vitest';
import {
    CommandCenterError,
    CommandExecutionError,
    CommandNotAvailableError,
    CommandNotImplementedError,
    CommandNotRegisteredError,
} from '../errors';

describe('CommandCenter Errors', () => {
    it('CommandCenterError 应有正确的 name', () => {
        const error = new CommandCenterError('test');
        expect(error.name).toBe('CommandCenterError');
    });

    it('CommandNotRegisteredError 应包含命令 ID', () => {
        const error = new CommandNotRegisteredError('test.cmd');
        expect(error.message).toContain('test.cmd');
        expect(error.name).toBe('CommandNotRegisteredError');
    });

    it('CommandNotAvailableError 应支持可选原因', () => {
        const error1 = new CommandNotAvailableError('test.cmd');
        const error2 = new CommandNotAvailableError('test.cmd', 'no permission');

        expect(error1.name).toBe('CommandNotAvailableError');
        expect(error2.message).toContain('no permission');
    });

    it('CommandExecutionError 应包含原始错误', () => {
        const cause = new Error('original error');
        const error = new CommandExecutionError('test.cmd', cause);

        expect(error.name).toBe('CommandExecutionError');
        expect(error.cause).toBe(cause);
    });

    it('CommandNotImplementedError 应包含操作类型', () => {
        const error = new CommandNotImplementedError('test.cmd', 'undo');
        expect(error.message).toContain('undo');
        expect(error.name).toBe('CommandNotImplementedError');
    });
});
