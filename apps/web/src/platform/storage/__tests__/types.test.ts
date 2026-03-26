import { describe, expect, it } from 'vitest';
import type { StorageType, StorageUsage } from '../types';

describe('StorageService Types', () => {
    it('应正确定义存储类型', () => {
        const types: StorageType[] = ['memory', 'local', 'indexeddb'];
        expect(types).toHaveLength(3);
    });

    it('应正确定义存储使用量接口', () => {
        const usage: StorageUsage = {
            usedBytes: 1024,
            totalBytes: 10240,
            percentUsed: 10,
        };
        expect(usage.usedBytes).toBe(1024);
        expect(usage.totalBytes).toBe(10240);
        expect(usage.percentUsed).toBe(10);
    });
});
