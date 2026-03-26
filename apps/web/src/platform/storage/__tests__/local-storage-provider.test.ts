import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalStorageProvider } from '../providers/local-storage';

// Mock localStorage
const mockLocalStorage = {
    _data: {} as Record<string, string>,
    setItem: vi.fn((key: string, value: string) => {
        mockLocalStorage._data[key] = value;
    }),
    getItem: vi.fn((key: string) => {
        return mockLocalStorage._data[key] || null;
    }),
    removeItem: vi.fn((key: string) => {
        delete mockLocalStorage._data[key];
    }),
    clear: vi.fn(() => {
        mockLocalStorage._data = {};
    }),
    key: vi.fn((index: number) => {
        const keys = Object.keys(mockLocalStorage._data);
        return keys[index] || null;
    }),
    get length() {
        return Object.keys(mockLocalStorage._data).length;
    },
};

describe('LocalStorageProvider', () => {
    let provider: LocalStorageProvider;

    beforeEach(async () => {
        // Mock localStorage
        Object.defineProperty(global, 'localStorage', {
            value: mockLocalStorage,
            writable: true,
        });

        provider = new LocalStorageProvider();
        await provider.initialize();
    });

    afterEach(() => {
        vi.clearAllMocks();
        mockLocalStorage._data = {};
    });

    it('应正确设置 provider 信息', () => {
        expect(provider.name).toBe('LocalStorageProvider');
        expect(provider.type).toBe('local');
    });

    it('应设置和获取值', async () => {
        await provider.set('test_key1', JSON.stringify('value1'));
        const result = await provider.get('test_key1');
        expect(JSON.parse(result!)).toBe('value1');
    });

    it('应返回 undefined 对于不存在的 key', async () => {
        const result = await provider.get('test_nonexistent');
        expect(result).toBeUndefined();
    });

    it('应检查 key 是否存在', async () => {
        await provider.set('test_key1', JSON.stringify('value1'));
        expect(await provider.has('test_key1')).toBe(true);
        expect(await provider.has('test_key2')).toBe(false);
    });

    it('应删除 key', async () => {
        await provider.set('test_key1', JSON.stringify('value1'));
        await provider.delete('test_key1');
        expect(await provider.has('test_key1')).toBe(false);
    });

    it('应获取所有 keys', async () => {
        await provider.set('test_key1', JSON.stringify('v1'));
        await provider.set('test_key2', JSON.stringify('v2'));
        const keys = await provider.keys();
        expect(keys).toContain('test_key1');
        expect(keys).toContain('test_key2');
    });

    it('应清空存储 (仅测试方法存在)', async () => {
        await provider.set('test_key1', JSON.stringify('v1'));
        await provider.clear();
        expect(await provider.keys()).toHaveLength(0);
    });

    it('应报告使用量', async () => {
        await provider.set('test_key1', JSON.stringify('value1'));
        const usage = await provider.getUsage();
        expect(usage.usedBytes).toBeGreaterThan(0);
        expect(usage.totalBytes).toBe(5 * 1024 * 1024);
    });
});
