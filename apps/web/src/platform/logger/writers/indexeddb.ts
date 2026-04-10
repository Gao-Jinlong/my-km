// apps/web/src/platform/logger/writers/indexeddb.ts

import type { LogEntry, LogLevel, LogWriter } from '../types';

const DB_NAME = 'my-km-logs';
const STORE_NAME = 'logs';
const DB_VERSION = 1;
const MAX_ENTRIES = 10000;
const FLUSH_INTERVAL = 100;
const FLUSH_THRESHOLD = 50;

export interface LogFilter {
    level?: LogLevel;
    minLevel?: LogLevel;
    category?: string;
    categories?: string[];
    search?: string;
    startTime?: number;
    endTime?: number;
    limit?: number;
}

export class IndexedDBWriter implements LogWriter {
    readonly name = 'IndexedDBWriter';

    private db: IDBDatabase | null = null;
    private buffer: LogEntry[] = [];
    private flushTimer: ReturnType<typeof setInterval> | null = null;
    private _initPromise: Promise<void> | null = null;

    constructor() {
        this._initPromise = this.init();
    }

    private async init(): Promise<void> {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onupgradeneeded = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    const store = db.createObjectStore(STORE_NAME, { keyPath: 'timestamp' });
                    store.createIndex('category', 'category', { unique: false });
                    store.createIndex('level', 'level', { unique: false });
                    store.createIndex('timestamp', 'timestamp', { unique: false });
                }
            };

            request.onsuccess = () => {
                this.db = request.result;
                this.flushTimer = setInterval(() => this.flush(), FLUSH_INTERVAL);
                resolve();
            };

            request.onerror = () => {
                reject(request.error);
            };
        });
    }

    write(entry: LogEntry): void {
        this.buffer.push(entry);
        if (this.buffer.length >= FLUSH_THRESHOLD) {
            this.flush();
        }
    }

    async flush(): Promise<void> {
        if (this.buffer.length === 0 || !this.db) return;

        const entries = this.buffer.splice(0);
        const tx = this.db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);

        for (const entry of entries) {
            store.put(entry);
        }

        // 清理旧数据
        this.prune(store);
    }

    private prune(store: IDBObjectStore): void {
        const countRequest = store.count();
        countRequest.onsuccess = () => {
            if (countRequest.result > MAX_ENTRIES) {
                const excess = countRequest.result - MAX_ENTRIES;
                const cursorRequest = store.index('timestamp').openCursor();
                let deleted = 0;
                cursorRequest.onsuccess = () => {
                    const cursor = cursorRequest.result;
                    if (cursor && deleted < excess) {
                        cursor.delete();
                        deleted++;
                        cursor.continue();
                    }
                };
            }
        };
    }

    async query(filter?: LogFilter): Promise<LogEntry[]> {
        if (this._initPromise) await this._initPromise;
        if (!this.db) return [];

        await this.flush();

        return new Promise((resolve, reject) => {
            if (!this.db) {
                resolve([]);
                return;
            }
            const tx = this.db.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const request = store.index('timestamp').openCursor(null, 'prev');
            const results: LogEntry[] = [];
            const limit = filter?.limit ?? 1000;

            request.onsuccess = () => {
                const cursor = request.result;
                if (!cursor || results.length >= limit) {
                    resolve(results.reverse());
                    return;
                }

                const entry = cursor.value as LogEntry;

                if (this.matchesFilter(entry, filter)) {
                    results.push(entry);
                }
                cursor.continue();
            };

            request.onerror = () => reject(request.error);
        });
    }

    private matchesFilter(entry: LogEntry, filter?: LogFilter): boolean {
        if (!filter) return true;

        if (filter.level !== undefined && entry.level !== filter.level) return false;
        if (filter.minLevel !== undefined && entry.level < filter.minLevel) return false;
        if (filter.category && entry.category !== filter.category) return false;
        if (filter.categories?.length && !filter.categories.includes(entry.category)) return false;
        if (filter.search && !entry.message.toLowerCase().includes(filter.search.toLowerCase()))
            return false;
        if (filter.startTime && entry.timestamp < filter.startTime) return false;
        if (filter.endTime && entry.timestamp > filter.endTime) return false;

        return true;
    }

    async clear(): Promise<void> {
        if (this._initPromise) await this._initPromise;
        if (!this.db) return;

        return new Promise((resolve, reject) => {
            if (!this.db) {
                resolve();
                return;
            }
            const tx = this.db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            const request = store.clear();
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    dispose(): void {
        if (this.flushTimer) {
            clearInterval(this.flushTimer);
            this.flushTimer = null;
        }
        this.flush();
        if (this.db) {
            this.db.close();
            this.db = null;
        }
    }
}
