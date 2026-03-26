import { describe, expect, it } from 'vitest';
import * as Storage from '../index';

describe('Storage Module Exports', () => {
    it('应导出所有 Provider 类', () => {
        expect(Storage.MemoryProvider).toBeDefined();
        expect(Storage.LocalStorageProvider).toBeDefined();
        expect(Storage.IndexedDBProvider).toBeDefined();
    });

    it('应导出 StorageService 类', () => {
        expect(Storage.StorageService).toBeDefined();
    });

    it('应导出所有错误类', () => {
        expect(Storage.StorageError).toBeDefined();
        expect(Storage.StorageNotSupportedError).toBeDefined();
        expect(Storage.StorageQuotaExceededError).toBeDefined();
        expect(Storage.StorageNotInitializedError).toBeDefined();
        expect(Storage.StorageSerializationError).toBeDefined();
        expect(Storage.StorageEncryptionError).toBeDefined();
    });

    it('应导出工具函数', () => {
        expect(Storage.serialize).toBeDefined();
        expect(Storage.deserialize).toBeDefined();
        expect(Storage.generateKey).toBeDefined();
        expect(Storage.encrypt).toBeDefined();
        expect(Storage.decrypt).toBeDefined();
    });

    it('StorageService 应可实例化并正常工作', async () => {
        const storage = new Storage.StorageService({ namespace: 'test' });
        await storage.initialize('memory');

        await storage.set('key', 'value');
        const result = await storage.get('key');

        expect(result).toBe('value');
        storage.dispose();
    });

    it('应可直接使用 Provider 类', async () => {
        const provider = new Storage.MemoryProvider();
        await provider.initialize();

        // Provider 直接使用序列化后的字符串值
        await provider.set('key', Storage.serialize('value'));
        const result = await provider.get('key');

        expect(Storage.deserialize(result!)).toBe('value');
        provider.dispose();
    });
});
