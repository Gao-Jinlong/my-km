// apps/web/src/platform/storage/providers/indexed-db.ts

import { StorageNotSupportedError } from '../errors';
import type { IStorageProvider, StorageUsage } from '../types';

const DB_NAME = 'StorageDB';
const STORE_NAME = 'items';
const DB_VERSION = 1;

export class IndexedDBProvider implements IStorageProvider {
    readonly name = 'IndexedDBProvider';
    readonly type = 'indexeddb' as const;

    private db: IDBDatabase | null = null;

    async initialize(): Promise<void> {
        if (typeof indexedDB === 'undefined') {
            throw new StorageNotSupportedError('IndexedDB');
        }

        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve();
            };

            request.onupgradeneeded = event => {
                const db = (event.target as IDBOpenDBRequest).result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME, { keyPath: 'key' });
                }
            };
        });
    }

    async get(key: string): Promise<string | undefined> {
        if (!this.db) throw new Error('IndexedDB 未初始化');

        return new Promise(resolve => {
            const transaction = this.db.transaction(STORE_NAME, 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.get(key);

            request.onsuccess = () => {
                resolve(request.result?.value || undefined);
            };

            request.onerror = () => resolve(undefined);
        });
    }

    async set(key: string, value: string): Promise<void> {
        if (!this.db) throw new Error('IndexedDB 未初始化');

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(STORE_NAME, 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.put({ key, value });

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async delete(key: string): Promise<void> {
        if (!this.db) throw new Error('IndexedDB 未初始化');

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(STORE_NAME, 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.delete(key);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async has(key: string): Promise<boolean> {
        if (!this.db) throw new Error('IndexedDB 未初始化');

        return new Promise(resolve => {
            const transaction = this.db.transaction(STORE_NAME, 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.get(key);

            request.onsuccess = () => {
                resolve(request.result !== undefined);
            };

            request.onerror = () => resolve(false);
        });
    }

    async keys(): Promise<string[]> {
        if (!this.db) throw new Error('IndexedDB 未初始化');

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(STORE_NAME, 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.getAllKeys();

            request.onsuccess = () => {
                resolve(request.result as string[]);
            };

            request.onerror = () => reject(request.error);
        });
    }

    async clear(): Promise<void> {
        if (!this.db) throw new Error('IndexedDB 未初始化');

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(STORE_NAME, 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.clear();

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async getUsage(): Promise<StorageUsage> {
        if (!this.db) throw new Error('IndexedDB 未初始化');

        return new Promise(resolve => {
            // biome-ignore lint/suspicious/noExplicitAny: navigator.storage is experimental API
            const storageManager = (navigator as any).storage;
            const estimate = storageManager?.estimate?.();
            if (!estimate) {
                resolve({ usedBytes: 0 });
                return;
            }

            estimate
                .then(({ usage, quota }) => {
                    resolve({
                        usedBytes: usage || 0,
                        totalBytes: quota,
                        percentUsed: quota ? ((usage || 0) / quota) * 100 : undefined,
                    });
                })
                .catch(() => {
                    resolve({ usedBytes: 0 });
                });
        });
    }

    dispose(): void {
        if (this.db) {
            this.db.close();
            this.db = null;
        }
    }
}
