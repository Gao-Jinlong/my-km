// apps/web/src/platform/storage/types.ts

export type StorageType = 'memory' | 'local' | 'indexeddb';

export interface StorageUsage {
    usedBytes: number;
    totalBytes?: number;
    percentUsed?: number;
}

export interface IStorageProvider {
    readonly name: string;
    readonly type: StorageType;

    initialize(): Promise<void>;
    get(key: string): Promise<string | undefined>;
    set(key: string, value: string): Promise<void>;
    delete(key: string): Promise<void>;
    has(key: string): Promise<boolean>;
    keys(): Promise<string[]>;
    clear(): Promise<void>;
    getUsage(): Promise<StorageUsage>;
    dispose(): void;
}

export interface StorageOptions {
    type?: StorageType;
    namespace?: string;
    encryptionKey?: string; // 可选加密
}

export interface StorageEntry<T = unknown> {
    value: T;
    timestamp: number;
    expiresAt?: number; // 可选过期时间
}

export interface SerializedEntry {
    value: string;
    timestamp: number;
    expiresAt?: number;
    encrypted?: boolean;
}

export interface StorageProviderFactory {
    create(options: StorageOptions): IStorageProvider;
}
