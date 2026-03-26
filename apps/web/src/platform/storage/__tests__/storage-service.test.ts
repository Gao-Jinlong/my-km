import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { StorageService } from '../service';

describe('StorageService', () => {
    let storage: StorageService;

    beforeEach(async () => {
        storage = new StorageService({ namespace: 'test' });
        await storage.initialize('memory');
    });

    afterEach(() => {
        storage.dispose();
    });

    it('应正确初始化', () => {
        expect(storage.isInitialized()).toBe(true);
        expect(storage.getType()).toBe('memory');
    });

    it('应设置和获取字符串值', async () => {
        await storage.set('key1', 'value1');
        const result = await storage.get('key1');
        expect(result).toBe('value1');
    });

    it('应设置和获取对象值', async () => {
        const obj = { name: 'test', value: 123 };
        await storage.set('obj', obj);
        const result = await storage.get<typeof obj>('obj');
        expect(result).toEqual(obj);
    });

    it('应返回 undefined 对于不存在的 key', async () => {
        const result = await storage.get('nonexistent');
        expect(result).toBeUndefined();
    });

    it('应检查 key 是否存在', async () => {
        await storage.set('key1', 'value1');
        expect(await storage.has('key1')).toBe(true);
        expect(await storage.has('key2')).toBe(false);
    });

    it('应删除 key', async () => {
        await storage.set('key1', 'value1');
        await storage.delete('key1');
        expect(await storage.has('key1')).toBe(false);
    });

    it('应获取所有 keys', async () => {
        await storage.set('key1', 'v1');
        await storage.set('key2', 'v2');
        const keys = await storage.keys();
        expect(keys).toContain('key1');
        expect(keys).toContain('key2');
        expect(keys).toHaveLength(2);
    });

    it('应使用命名空间隔离 keys', async () => {
        const storage1 = new StorageService({ namespace: 'ns1' });
        const storage2 = new StorageService({ namespace: 'ns2' });
        await storage1.initialize('memory');
        await storage2.initialize('memory');

        await storage1.set('key', 'value1');
        await storage2.set('key', 'value2');

        expect(await storage1.get('key')).toBe('value1');
        expect(await storage2.get('key')).toBe('value2');

        storage1.dispose();
        storage2.dispose();
    });

    it('应清空当前命名空间的所有 keys', async () => {
        await storage.set('key1', 'v1');
        await storage.set('key2', 'v2');
        await storage.clear();
        const keys = await storage.keys();
        expect(keys).toHaveLength(0);
    });

    it('应报告使用情况', async () => {
        await storage.set('key1', 'value1');
        const usage = await storage.getUsage();
        expect(usage.usedBytes).toBeGreaterThanOrEqual(0);
    });

    it('应在未初始化时抛出错误', async () => {
        const uninitStorage = new StorageService();
        await expect(uninitStorage.get('key')).rejects.toThrow();
    });

    it('应支持多次初始化（幂等）', async () => {
        await storage.initialize('memory');
        await storage.initialize('memory');
        expect(storage.isInitialized()).toBe(true);
    });
});
