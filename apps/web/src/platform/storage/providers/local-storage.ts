// apps/web/src/platform/storage/providers/local-storage.ts

import { StorageNotSupportedError, StorageQuotaExceededError } from '../errors';
import type { IStorageProvider, StorageUsage } from '../types';

export class LocalStorageProvider implements IStorageProvider {
    readonly name = 'LocalStorageProvider';
    readonly type = 'local' as const;

    async initialize(): Promise<void> {
        if (typeof localStorage === 'undefined') {
            throw new StorageNotSupportedError('localStorage');
        }
    }

    async get(key: string): Promise<string | undefined> {
        try {
            return localStorage.getItem(key) || undefined;
        } catch {
            return undefined;
        }
    }

    async set(key: string, value: string): Promise<void> {
        try {
            localStorage.setItem(key, value);
        } catch (error) {
            if (this.isQuotaExceeded(error)) {
                throw new StorageQuotaExceededError('LocalStorage 空间已满');
            }
            throw error;
        }
    }

    async delete(key: string): Promise<void> {
        localStorage.removeItem(key);
    }

    async has(key: string): Promise<boolean> {
        return localStorage.getItem(key) !== null;
    }

    async keys(): Promise<string[]> {
        const result: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key) {
                result.push(key);
            }
        }
        return result;
    }

    async clear(): Promise<void> {
        localStorage.clear();
    }

    async getUsage(): Promise<StorageUsage> {
        let usedBytes = 0;
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key) {
                usedBytes += key.length * 2;
                const value = localStorage.getItem(key);
                if (value) {
                    usedBytes += value.length * 2;
                }
            }
        }

        // LocalStorage 通常限制为 5MB
        const totalBytes = 5 * 1024 * 1024;

        return {
            usedBytes,
            totalBytes,
            percentUsed: (usedBytes / totalBytes) * 100,
        };
    }

    dispose(): void {
        // LocalStorage 无需清理
    }

    private isQuotaExceeded(error: unknown): boolean {
        if (error instanceof DOMException) {
            return error.name === 'QuotaExceededError';
        }
        return false;
    }
}
