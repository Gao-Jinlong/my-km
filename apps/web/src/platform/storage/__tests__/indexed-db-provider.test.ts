import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IndexedDBProvider } from '../providers/indexed-db';

describe('IndexedDBProvider', () => {
    let provider: IndexedDBProvider;

    // Mock IndexedDB
    const mockStore: Record<string, { key: string; value: string }> = {};

    const mockIDBRequest = {
        onerror: null as (() => void) | null,
        onsuccess: null as (() => void) | null,
        result: null as unknown,
    };

    const mockObjectStore = {
        get: vi.fn((key: string) => {
            const request = { ...mockIDBRequest, result: mockStore[key] };
            setTimeout(() => request.onsuccess?.(), 0);
            return request;
        }),
        put: vi.fn((item: { key: string; value: string }) => {
            mockStore[item.key] = item;
            const request = { ...mockIDBRequest };
            setTimeout(() => request.onsuccess?.(), 0);
            return request;
        }),
        delete: vi.fn((key: string) => {
            delete mockStore[key];
            const request = { ...mockIDBRequest };
            setTimeout(() => request.onsuccess?.(), 0);
            return request;
        }),
        getAllKeys: vi.fn(() => {
            const request = { ...mockIDBRequest, result: Object.keys(mockStore) };
            setTimeout(() => request.onsuccess?.(), 0);
            return request;
        }),
        clear: vi.fn(() => {
            Object.keys(mockStore).forEach(key => {
                delete mockStore[key];
            });
            const request = { ...mockIDBRequest };
            setTimeout(() => request.onsuccess?.(), 0);
            return request;
        }),
    };

    const mockTransaction = {
        objectStore: vi.fn(() => mockObjectStore),
    };

    const mockIDBDatabase = {
        objectStoreNames: {
            contains: (name: string) => name === 'items',
        },
        transaction: vi.fn(() => mockTransaction),
        close: vi.fn(),
    };

    const mockIndexedDB = {
        open: vi.fn((_name: string, _version: number) => {
            const request = {
                onerror: null as (() => void) | null,
                onsuccess: null as (() => void) | null,
                onupgradeneeded: null as (() => void) | null,
                result: mockIDBDatabase,
            };
            // 模拟异步打开
            setTimeout(() => {
                request.onsuccess?.();
            }, 0);
            return request;
        }),
    };

    beforeEach(async () => {
        // Mock indexedDB
        Object.defineProperty(global, 'indexedDB', {
            value: mockIndexedDB,
            writable: true,
        });

        // 清空 mock 存储
        Object.keys(mockStore).forEach(key => {
            delete mockStore[key];
        });

        // 重置 mock 调用历史
        vi.clearAllMocks();

        provider = new IndexedDBProvider();
        await provider.initialize();
    });

    afterEach(() => {
        provider.dispose();
    });

    it('应正确设置 provider 信息', () => {
        expect(provider.name).toBe('IndexedDBProvider');
        expect(provider.type).toBe('indexeddb');
    });

    it('应设置和获取值', async () => {
        await provider.set('test_key1', JSON.stringify('value1'));
        const result = await provider.get('test_key1');
        expect(result).toBeDefined();
        expect(JSON.parse(result as string)).toBe('value1');
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

    it('应清空存储', async () => {
        await provider.set('test_key1', JSON.stringify('v1'));
        await provider.set('test_key2', JSON.stringify('v2'));
        await provider.clear();
        expect(await provider.keys()).toHaveLength(0);
    });

    it('应报告使用量', async () => {
        await provider.set('test_key1', JSON.stringify('value1'));
        const usage = await provider.getUsage();
        expect(usage.usedBytes).toBeGreaterThanOrEqual(0);
    });
});
