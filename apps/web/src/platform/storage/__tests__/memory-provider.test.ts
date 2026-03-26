import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryProvider } from '../providers/memory';

describe('MemoryProvider', () => {
    let provider: MemoryProvider;

    beforeEach(async () => {
        provider = new MemoryProvider();
        await provider.initialize();
    });

    it('应正确设置 provider 信息', () => {
        expect(provider.name).toBe('MemoryProvider');
        expect(provider.type).toBe('memory');
    });

    it('应设置和获取值', async () => {
        await provider.set('key1', JSON.stringify('value1'));
        const result = await provider.get('key1');
        expect(JSON.parse(result!)).toBe('value1');
    });

    it('应返回 undefined 对于不存在的 key', async () => {
        const result = await provider.get('nonexistent');
        expect(result).toBeUndefined();
    });

    it('应检查 key 是否存在', async () => {
        await provider.set('key1', JSON.stringify('value1'));
        expect(await provider.has('key1')).toBe(true);
        expect(await provider.has('key2')).toBe(false);
    });

    it('应删除 key', async () => {
        await provider.set('key1', JSON.stringify('value1'));
        await provider.delete('key1');
        expect(await provider.has('key1')).toBe(false);
    });

    it('应获取所有 keys', async () => {
        await provider.set('key1', JSON.stringify('v1'));
        await provider.set('key2', JSON.stringify('v2'));
        const keys = await provider.keys();
        expect(keys).toContain('key1');
        expect(keys).toContain('key2');
    });

    it('应清空存储', async () => {
        await provider.set('key1', JSON.stringify('v1'));
        await provider.set('key2', JSON.stringify('v2'));
        await provider.clear();
        expect(await provider.keys()).toHaveLength(0);
    });

    it('应处理过期条目', async () => {
        await provider.set('expired', JSON.stringify('value'));
        // 手动修改过期时间
        const entry = {
            value: 'value',
            timestamp: Date.now(),
            expiresAt: Date.now() - 1000,
        };
        (provider as any).store.set('expired', entry);

        expect(await provider.has('expired')).toBe(false);
        expect(await provider.get('expired')).toBeUndefined();
    });

    it('应报告使用量', async () => {
        await provider.set('key1', JSON.stringify('value1'));
        const usage = await provider.getUsage();
        expect(usage.usedBytes).toBeGreaterThan(0);
    });
});
