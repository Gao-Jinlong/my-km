// apps/web/src/platform/storage/service.ts

import { ServiceBase } from '@/platform/base/service-base';
import { StorageNotInitializedError, StorageNotSupportedError } from './errors';
import { IndexedDBProvider } from './providers/indexed-db';
import { LocalStorageProvider } from './providers/local-storage';
import { MemoryProvider } from './providers/memory';
import type { IStorageProvider, StorageOptions, StorageType } from './types';
import { decrypt, encrypt, generateKey } from './utils/crypto';
import { deserialize, serialize } from './utils/serializer';

export class StorageService extends ServiceBase {
    private provider: IStorageProvider | null = null;
    private encryptionKey: CryptoKey | null = null;
    private namespace: string;
    private initialized = false;

    constructor(options: StorageOptions = {}) {
        super();
        this.namespace = options.namespace || '';
        if (options.encryptionKey) {
            this.initializeEncryption(options.encryptionKey);
        }
    }

    /**
     * 初始化存储服务
     */
    async initialize(type?: StorageType): Promise<void> {
        if (this.initialized) {
            return;
        }

        const storageType = type || this.getDefaultStorageType();
        this.provider = this.createProvider(storageType);
        await this.provider.initialize();
        this.initialized = true;
    }

    /**
     * 获取值
     */
    async get<T = string>(key: string): Promise<T | undefined> {
        if (!this.provider) {
            throw new StorageNotInitializedError();
        }

        const fullKey = this.namespacedKey(key);
        const data = await this.provider.get(fullKey);
        if (data === undefined) {
            return undefined;
        }

        try {
            // 如果配置了加密密钥，先解密再反序列化
            let decryptedData: string;
            if (this.encryptionKey) {
                decryptedData = await this.decryptData(data);
            } else {
                decryptedData = data;
            }
            return deserialize<T>(decryptedData);
        } catch {
            return undefined;
        }
    }

    /**
     * 设置值
     */
    async set<T>(key: string, value: T): Promise<void> {
        if (!this.provider) {
            throw new StorageNotInitializedError();
        }

        const fullKey = this.namespacedKey(key);
        const serialized = serialize(value);

        // 如果配置了加密密钥，先加密
        const data = this.encryptionKey ? await this.encryptData(serialized) : serialized;
        await this.provider.set(fullKey, data);
    }

    /**
     * 删除值
     */
    async delete(key: string): Promise<void> {
        if (!this.provider) {
            throw new StorageNotInitializedError();
        }

        const fullKey = this.namespacedKey(key);
        await this.provider.delete(fullKey);
    }

    /**
     * 检查 key 是否存在
     */
    async has(key: string): Promise<boolean> {
        if (!this.provider) {
            throw new StorageNotInitializedError();
        }

        const fullKey = this.namespacedKey(key);
        return this.provider.has(fullKey);
    }

    /**
     * 获取所有 keys
     */
    async keys(): Promise<string[]> {
        if (!this.provider) {
            throw new StorageNotInitializedError();
        }

        const allKeys = await this.provider.keys();
        return this.stripNamespace(allKeys);
    }

    /**
     * 清空存储
     */
    async clear(): Promise<void> {
        if (!this.provider) {
            throw new StorageNotInitializedError();
        }

        // 只清空当前命名空间的 keys
        const allKeys = await this.keys();
        for (const key of allKeys) {
            await this.delete(key);
        }
    }

    /**
     * 获取存储使用情况
     */
    async getUsage() {
        if (!this.provider) {
            throw new StorageNotInitializedError();
        }

        return this.provider.getUsage();
    }

    /**
     * 获取 provider 类型
     */
    getType(): StorageType | null {
        return this.provider?.type || null;
    }

    /**
     * 检查是否已初始化
     */
    isInitialized(): boolean {
        return this.initialized;
    }

    /**
     * 销毁服务
     */
    override dispose(): void {
        if (this.provider) {
            this.provider.dispose();
            this.provider = null;
            this.initialized = false;
        }
        super.dispose();
    }

    /**
     * 初始化加密密钥
     */
    private async initializeEncryption(secret: string): Promise<void> {
        this.encryptionKey = await generateKey(secret);
    }

    /**
     * 加密数据
     */
    private async encryptData(data: string): Promise<string> {
        if (!this.encryptionKey) {
            throw new Error('加密密钥未初始化');
        }
        return encrypt(data, this.encryptionKey);
    }

    /**
     * 解密数据
     */
    private async decryptData(data: string): Promise<string> {
        if (!this.encryptionKey) {
            throw new Error('加密密钥未初始化');
        }
        return decrypt(data, this.encryptionKey);
    }

    /**
     * 创建 provider 实例
     */
    private createProvider(type: StorageType): IStorageProvider {
        switch (type) {
            case 'memory':
                return new MemoryProvider();
            case 'local':
                return new LocalStorageProvider();
            case 'indexeddb':
                return new IndexedDBProvider();
            default:
                throw new StorageNotSupportedError(`存储类型 "${type}"`);
        }
    }

    /**
     * 获取默认存储类型
     */
    private getDefaultStorageType(): StorageType {
        // 在浏览器环境中，优先使用 IndexedDB
        if (typeof indexedDB !== 'undefined') {
            return 'indexeddb';
        }
        if (typeof localStorage !== 'undefined') {
            return 'local';
        }
        return 'memory';
    }

    /**
     * 生成带命名空间的 key
     */
    private namespacedKey(key: string): string {
        return this.namespace ? `${this.namespace}:${key}` : key;
    }

    /**
     * 移除 key 的命名空间前缀
     */
    private stripNamespace(keys: string[]): string[] {
        if (!this.namespace) {
            return keys;
        }
        const prefix = `${this.namespace}:`;
        return keys.filter(key => key.startsWith(prefix)).map(key => key.slice(prefix.length));
    }
}
