import { describe, expect, it } from 'vitest';
import {
    StorageEncryptionError,
    StorageError,
    StorageNotInitializedError,
    StorageNotSupportedError,
    StorageQuotaExceededError,
    StorageSerializationError,
} from '../errors';

describe('Storage Errors', () => {
    it('StorageError 应正确设置 name', () => {
        const error = new StorageError('test error');
        expect(error.name).toBe('StorageError');
        expect(error.message).toBe('test error');
    });

    it('StorageNotSupportedError 应包含存储类型', () => {
        const error = new StorageNotSupportedError('invalid');
        expect(error.name).toBe('StorageNotSupportedError');
        expect(error.message).toContain('invalid');
    });

    it('StorageQuotaExceededError 应有默认消息', () => {
        const error = new StorageQuotaExceededError();
        expect(error.message).toBe('存储空间已满');
    });

    it('StorageNotInitializedError 应有固定消息', () => {
        const error = new StorageNotInitializedError();
        expect(error.message).toBe('存储未初始化');
    });

    it('StorageSerializationError 应包含原始值', () => {
        const value = { foo: 'bar' };
        const error = new StorageSerializationError('无法序列化', value);
        expect(error.value).toBe(value);
        expect(error.name).toBe('StorageSerializationError');
    });

    it('StorageEncryptionError 应有自定义消息', () => {
        const error = new StorageEncryptionError('加密失败');
        expect(error.message).toBe('加密失败');
        expect(error.name).toBe('StorageEncryptionError');
    });
});
