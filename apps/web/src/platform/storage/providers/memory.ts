// apps/web/src/platform/storage/providers/memory.ts

import type { IStorageProvider, StorageEntry, StorageUsage } from '../types';
import { deserialize, serialize } from '../utils/serializer';

export class MemoryProvider implements IStorageProvider {
    readonly name = 'MemoryProvider';
    readonly type = 'memory' as const;

    private store = new Map<string, StorageEntry>();

    async initialize(): Promise<void> {
        // 内存存储无需初始化
    }

    async get(key: string): Promise<string | undefined> {
        const entry = this.store.get(key);
        if (!entry) return undefined;

        // 检查是否过期
        if (entry.expiresAt && Date.now() > entry.expiresAt) {
            this.store.delete(key);
            return undefined;
        }

        return serialize(entry.value);
    }

    async set(key: string, value: string): Promise<void> {
        const entry: StorageEntry = {
            value: deserialize(value),
            timestamp: Date.now(),
        };
        this.store.set(key, entry);
    }

    async delete(key: string): Promise<void> {
        this.store.delete(key);
    }

    async has(key: string): Promise<boolean> {
        const entry = this.store.get(key);
        if (!entry) return false;

        // 检查是否过期
        if (entry.expiresAt && Date.now() > entry.expiresAt) {
            this.store.delete(key);
            return false;
        }

        return true;
    }

    async keys(): Promise<string[]> {
        return Array.from(this.store.keys());
    }

    async clear(): Promise<void> {
        this.store.clear();
    }

    async getUsage(): Promise<StorageUsage> {
        // 估算内存使用
        let usedBytes = 0;
        for (const [key, entry] of this.store.entries()) {
            usedBytes += key.length * 2; // UTF-16 估算
            usedBytes += JSON.stringify(entry).length * 2;
        }

        return { usedBytes };
    }

    dispose(): void {
        this.store.clear();
    }
}
