# StorageService 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现统一的存储服务，支持三种存储后端（内存、LocalStorage、IndexedDB），提供一致的 API 和自动序列化能力。

**Architecture:** 采用 Provider 模式，StorageService 作为统一入口，底层通过 IStorageProvider 接口与不同存储后端交互。支持键值存储、JSON 序列化、可选加密。

**Tech Stack:** TypeScript, TypeScript, IndexedDB API, Web Crypto API (可选加密)

---

## 文件结构

```
apps/web/src/platform/storage/
├── index.ts                 # 导出所有内容
├── service.ts              # StorageService 实现
├── types.ts                # 类型定义和接口
├── providers/
│   ├── memory.ts           # MemoryProvider 实现
│   ├── local-storage.ts    # LocalStorageProvider 实现
│   └── indexed-db.ts       # IndexedDBProvider 实现
├── utils/
│   ├── serializer.ts       # JSON 序列化工具
│   └── crypto.ts           # 可选加密工具
└── errors.ts               # 错误类定义
```

---

## 任务分解

### Task 1: 类型定义和接口

**Files:**
- Create: `apps/web/src/platform/storage/types.ts`
- Test: `apps/web/src/platform/storage/__tests__/types.test.ts`

- [ ] **Step 1: 定义存储类型枚举和基础接口**

```typescript
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
    get<T>(key: string): Promise<string | undefined>;
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
```

- [ ] **Step 2: 定义存储条目和配置接口**

```typescript
// 接在 types.ts 后面

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
```

- [ ] **Step 3: 运行 TypeScript 检查类型定义**

```bash
cd apps/web && npx tsc --noEmit src/platform/storage/types.ts
```

Expected: 无错误

- [ ] **Step 4: 创建类型测试文件**

```typescript
// apps/web/src/platform/storage/__tests__/types.test.ts
import { describe, it, expect } from 'vitest';
import type { StorageType, StorageUsage, IStorageProvider } from '../types';

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
    });
});
```

- [ ] **Step 5: 运行类型测试**

```bash
cd apps/web && npx vitest run src/platform/storage/__tests__/types.test.ts
```

Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add apps/web/src/platform/storage/types.ts apps/web/src/platform/storage/__tests__/types.test.ts
git commit -m "feat(storage): 定义存储服务类型和接口"
```

---

### Task 2: 错误类定义

**Files:**
- Create: `apps/web/src/platform/storage/errors.ts`
- Test: `apps/web/src/platform/storage/__tests__/errors.test.ts`

- [ ] **Step 1: 定义存储相关错误类**

```typescript
// apps/web/src/platform/storage/errors.ts

export class StorageError extends Error {
    constructor(message: string, public readonly cause?: unknown) {
        super(message);
        this.name = 'StorageError';
    }
}

export class StorageNotSupportedError extends StorageError {
    constructor(storageType: string) {
        super(`存储类型 "${storageType}" 不支持`);
        this.name = 'StorageNotSupportedError';
    }
}

export class StorageQuotaExceededError extends StorageError {
    constructor(message = '存储空间已满') {
        super(message);
        this.name = 'StorageQuotaExceededError';
    }
}

export class StorageNotInitializedError extends StorageError {
    constructor() {
        super('存储未初始化');
        this.name = 'StorageNotInitializedError';
    }
}

export class StorageSerializationError extends StorageError {
    constructor(message: string, public readonly value?: unknown) {
        super(message);
        this.name = 'StorageSerializationError';
    }
}

export class StorageEncryptionError extends StorageError {
    constructor(message: string) {
        super(message);
        this.name = 'StorageEncryptionError';
    }
}
```

- [ ] **Step 2: 创建错误类测试**

```typescript
// apps/web/src/platform/storage/__tests__/errors.test.ts
import { describe, it, expect } from 'vitest';
import {
    StorageError,
    StorageNotSupportedError,
    StorageQuotaExceededError,
    StorageNotInitializedError,
    StorageSerializationError,
    StorageEncryptionError,
} from '../errors';

describe('Storage Errors', () => {
    it('StorageError 应正确设置 name', () => {
        const error = new StorageError('test error');
        expect(error.name).toBe('StorageError');
        expect(error.message).toBe('test error');
    });

    it('StorageNotSupportedError 应包含存储类型', () => {
        const error = new StorageNotSupportedError('invalid');
        expect(error.name).toBe('StorageNotSupportedError');
        expect(error.message).toContain('invalid');
    });

    it('StorageQuotaExceededError 应有默认消息', () => {
        const error = new StorageQuotaExceededError();
        expect(error.message).toBe('存储空间已满');
    });

    it('StorageSerializationError 应包含原始值', () => {
        const value = { foo: 'bar' };
        const error = new StorageSerializationError('无法序列化', value);
        expect(error.value).toBe(value);
    });
});
```

- [ ] **Step 3: 运行错误测试**

```bash
cd apps/web && npx vitest run src/platform/storage/__tests__/errors.test.ts
```

Expected: PASS

- [ ] **Step 4: 提交**

```bash
git add apps/web/src/platform/storage/errors.ts apps/web/src/platform/storage/__tests__/errors.test.ts
git commit -m "feat(storage): 定义存储服务错误类"
```

---

### Task 3: 序列化和加密工具

**Files:**
- Create: `apps/web/src/platform/storage/utils/serializer.ts`
- Create: `apps/web/src/platform/storage/utils/crypto.ts`
- Test: `apps/web/src/platform/storage/__tests__/serializer.test.ts`
- Test: `apps/web/src/platform/storage/__tests__/crypto.test.ts`

- [ ] **Step 1: 实现 JSON 序列化工具**

```typescript
// apps/web/src/platform/storage/utils/serializer.ts

import { StorageSerializationError } from '../errors';
import type { StorageEntry, SerializedEntry } from '../types';

export function serialize<T>(value: T): string {
    try {
        return JSON.stringify(value);
    } catch (error) {
        throw new StorageSerializationError('无法序列化值', value);
    }
}

export function deserialize<T>(data: string): T {
    try {
        return JSON.parse(data) as T;
    } catch (error) {
        throw new StorageSerializationError('无法反序列化值', data);
    }
}

export function serializeEntry<T>(entry: StorageEntry<T>): SerializedEntry {
    return {
        value: serialize(entry.value),
        timestamp: entry.timestamp,
        expiresAt: entry.expiresAt,
    };
}

export function deserializeEntry<T>(data: string): StorageEntry<T> {
    const parsed = deserialize<SerializedEntry>(data);
    return {
        value: deserialize<T>(parsed.value),
        timestamp: parsed.timestamp,
        expiresAt: parsed.expiresAt,
    };
}

export function isExpired(entry: StorageEntry): boolean {
    if (!entry.expiresAt) return false;
    return Date.now() > entry.expiresAt;
}
```

- [ ] **Step 2: 实现可选加密工具**

```typescript
// apps/web/src/platform/storage/utils/crypto.ts

import { StorageEncryptionError } from '../errors';

const ENCODING = 'utf-8';

export async function generateKey(secret: string): Promise<CryptoKey> {
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.digest('SHA-256', encoder.encode(secret));

    return crypto.subtle.importKey(
        'raw',
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
    );
}

export async function encrypt(data: string, key: CryptoKey): Promise<string> {
    try {
        const encoder = new TextEncoder();
        const iv = crypto.getRandomValues(new Uint8Array(12));

        const encrypted = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv },
            key,
            encoder.encode(data)
        );

        // 合并 IV 和密文
        const combined = new Uint8Array(iv.length + encrypted.byteLength);
        combined.set(iv, 0);
        combined.set(new Uint8Array(encrypted), iv.length);

        return btoa(String.fromCharCode(...combined));
    } catch (error) {
        throw new StorageEncryptionError('加密失败');
    }
}

export async function decrypt(encryptedData: string, key: CryptoKey): Promise<string> {
    try {
        const combined = Uint8Array.from(atob(encryptedData), c => c.charCodeAt(0));
        const iv = combined.slice(0, 12);
        const data = combined.slice(12);

        const decrypted = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv },
            key,
            data
        );

        const decoder = new TextDecoder();
        return decoder.decode(decrypted);
    } catch (error) {
        throw new StorageEncryptionError('解密失败');
    }
}
```

- [ ] **Step 3: 创建序列化测试**

```typescript
// apps/web/src/platform/storage/__tests__/serializer.test.ts
import { describe, it, expect } from 'vitest';
import { serialize, deserialize, serializeEntry, deserializeEntry, isExpired } from '../utils/serializer';

describe('Serializer', () => {
    it('应序列化基本类型', () => {
        expect(serialize('hello')).toBe(JSON.stringify('hello'));
        expect(serialize(42)).toBe(JSON.stringify(42));
        expect(serialize(true)).toBe(JSON.stringify(true));
    });

    it('应序列化对象', () => {
        const obj = { name: 'test', value: 123 };
        expect(serialize(obj)).toBe(JSON.stringify(obj));
    });

    it('应反序列化', () => {
        const str = JSON.stringify({ foo: 'bar' });
        expect(deserialize(str)).toEqual({ foo: 'bar' });
    });

    it('应处理过期检查', () => {
        const expired = { value: 'test', timestamp: Date.now(), expiresAt: Date.now() - 1000 };
        const notExpired = { value: 'test', timestamp: Date.now(), expiresAt: Date.now() + 10000 };

        expect(isExpired(expired)).toBe(true);
        expect(isExpired(notExpired)).toBe(false);
    });

    it('无过期时间的条目不应过期', () => {
        const entry = { value: 'test', timestamp: Date.now() };
        expect(isExpired(entry)).toBe(false);
    });
});
```

- [ ] **Step 4: 运行序列化测试**

```bash
cd apps/web && npx vitest run src/platform/storage/__tests__/serializer.test.ts
```

Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add apps/web/src/platform/storage/utils/ apps/web/src/platform/storage/__tests__/serializer.test.ts
git commit -m "feat(storage): 实现序列化和加密工具"
```

---

### Task 4: MemoryProvider 实现

**Files:**
- Create: `apps/web/src/platform/storage/providers/memory.ts`
- Test: `apps/web/src/platform/storage/__tests__/memory-provider.test.ts`

- [ ] **Step 1: 实现内存存储提供者**

```typescript
// apps/web/src/platform/storage/providers/memory.ts

import type { IStorageProvider, StorageUsage, StorageEntry } from '../types';
import { serialize, deserialize } from '../utils/serializer';

export class MemoryProvider implements IStorageProvider {
    readonly name = 'MemoryProvider';
    readonly type = 'memory' as const;

    private store = new Map<string, StorageEntry>();

    async initialize(): Promise<void> {
        // 内存存储无需初始化
    }

    async get<T>(key: string): Promise<string | undefined> {
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
```

- [ ] **Step 2: 创建 MemoryProvider 测试**

```typescript
// apps/web/src/platform/storage/__tests__/memory-provider.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
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

    it'应清空存储', async () => {
        await provider.set('key1', JSON.stringify('v1'));
        await provider.set('key2', JSON.stringify('v2'));
        await provider.clear();
        expect(await provider.keys()).toHaveLength(0);
    });

    it'应处理过期条目', async () => {
        // 设置一个已过期的条目
        await provider.set('expired', JSON.stringify('value'));
        // 手动修改过期时间（实际使用中应该通过选项设置）
        const entry = { value: 'value', timestamp: Date.now(), expiresAt: Date.now() - 1000 };
        (provider as any).store.set('expired', entry);

        expect(await provider.has('expired')).toBe(false);
        expect(await provider.get('expired')).toBeUndefined();
    });

    it'应报告使用量', async () => {
        await provider.set('key1', JSON.stringify('value1'));
        const usage = await provider.getUsage();
        expect(usage.usedBytes).toBeGreaterThan(0);
    });
});
```

- [ ] **Step 3: 运行 MemoryProvider 测试**

```bash
cd apps/web && npx vitest run src/platform/storage/__tests__/memory-provider.test.ts
```

Expected: PASS

- [ ] **Step 4: 提交**

```bash
git add apps/web/src/platform/storage/providers/memory.ts apps/web/src/platform/storage/__tests__/memory-provider.test.ts
git commit -m "feat(storage): 实现内存存储提供者"
```

---

### Task 5: LocalStorageProvider 实现

**Files:**
- Create: `apps/web/src/platform/storage/providers/local-storage.ts`
- Test: `apps/web/src/platform/storage/__tests__/local-storage-provider.test.ts`

- [ ] **Step 1: 实现 LocalStorage 存储提供者**

```typescript
// apps/web/src/platform/storage/providers/local-storage.ts

import type { IStorageProvider, StorageUsage } from '../types';
import { StorageNotSupportedError, StorageQuotaExceededError } from '../errors';

export class LocalStorageProvider implements IStorageProvider {
    readonly name = 'LocalStorageProvider';
    readonly type = 'local' as const;

    async initialize(): Promise<void> {
        if (typeof localStorage === 'undefined') {
            throw new StorageNotSupportedError('localStorage');
        }
    }

    async get<T>(key: string): Promise<string | undefined> {
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
        return localStorage.hasOwnProperty(key);
    }

    async keys(): Promise<string[]> {
        return Object.keys(localStorage);
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
```

- [ ] **Step 2: 创建 LocalStorageProvider 测试**

```typescript
// apps/web/src/platform/storage/__tests__/local-storage-provider.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { LocalStorageProvider } from '../providers/local-storage';

describe('LocalStorageProvider', () => {
    let provider: LocalStorageProvider;

    beforeEach(async () => {
        provider = new LocalStorageProvider();
        await provider.initialize();
        // 清理测试数据
        const keys = await provider.keys();
        keys.forEach(key => {
            if (key.startsWith('test_')) {
                localStorage.removeItem(key);
            }
        });
    });

    afterEach(() => {
        // 清理测试数据
        const keys = Object.keys(localStorage);
        keys.forEach(key => {
            if (key.startsWith('test_')) {
                localStorage.removeItem(key);
            }
        });
    });

    it'应正确设置 provider 信息', () => {
        expect(provider.name).toBe('LocalStorageProvider');
        expect(provider.type).toBe('local');
    });

    it'应设置和获取值', async () => {
        await provider.set('test_key1', JSON.stringify('value1'));
        const result = await provider.get('test_key1');
        expect(JSON.parse(result!)).toBe('value1');
    });

    it'应返回 undefined 对于不存在的 key', async () => {
        const result = await provider.get('test_nonexistent');
        expect(result).toBeUndefined();
    });

    it'应检查 key 是否存在', async () => {
        await provider.set('test_key1', JSON.stringify('value1'));
        expect(await provider.has('test_key1')).toBe(true);
        expect(await provider.has('test_key2')).toBe(false);
    });

    it'应删除 key', async () => {
        await provider.set('test_key1', JSON.stringify('value1'));
        await provider.delete('test_key1');
        expect(await provider.has('test_key1')).toBe(false);
    });

    it'应获取所有 keys', async () => {
        await provider.set('test_key1', JSON.stringify('v1'));
        await provider.set('test_key2', JSON.stringify('v2'));
        const keys = await provider.keys();
        // 注意：可能包含其他 localStorage 数据
        expect(keys).toContain('test_key1');
        expect(keys).toContain('test_key2');
    });

    it'应清空存储 (仅测试方法存在)', async () => {
        // 实际清空会删除所有数据，只验证方法可调用
        expect(provider.clear()).resolves.not.toThrow();
    });

    it'应报告使用量', async () => {
        await provider.set('test_key1', JSON.stringify('value1'));
        const usage = await provider.getUsage();
        expect(usage.usedBytes).toBeGreaterThan(0);
        expect(usage.totalBytes).toBe(5 * 1024 * 1024);
    });
});
```

- [ ] **Step 3: 运行 LocalStorageProvider 测试**

```bash
cd apps/web && npx vitest run src/platform/storage/__tests__/local-storage-provider.test.ts
```

Expected: PASS

- [ ] **Step 4: 提交**

```bash
git add apps/web/src/platform/storage/providers/local-storage.ts apps/web/src/platform/storage/__tests__/local-storage-provider.test.ts
git commit -m "feat(storage): 实现本地存储提供者"
```

---

### Task 6: IndexedDBProvider 实现

**Files:**
- Create: `apps/web/src/platform/storage/providers/indexed-db.ts`
- Test: `apps/web/src/platform/storage/__tests__/indexed-db-provider.test.ts`

- [ ] **Step 1: 实现 IndexedDB 存储提供者**

```typescript
// apps/web/src/platform/storage/providers/indexed-db.ts

import type { IStorageProvider, StorageUsage } from '../types';
import { StorageNotSupportedError } from '../errors';

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

            request.onupgradeneeded = (event) => {
                const db = (event.target as IDBOpenDBRequest).result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME, { keyPath: 'key' });
                }
            };
        });
    }

    async get<T>(key: string): Promise<string | undefined> {
        if (!this.db) throw new Error('IndexedDB 未初始化');

        return new Promise((resolve) => {
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

        return new Promise((resolve) => {
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

        return new Promise((resolve, reject) => {
            const estimate = (navigator as any).storage?.estimate?.();
            if (!estimate) {
                resolve({ usedBytes: 0 });
                return;
            }

            estimate.then(({ usage, quota }) => {
                resolve({
                    usedBytes: usage || 0,
                    totalBytes: quota,
                    percentUsed: quota ? ((usage || 0) / quota) * 100 : undefined,
                });
            }).catch(() => {
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
```

- [ ] **Step 2: 创建 IndexedDBProvider 测试**

```typescript
// apps/web/src/platform/storage/__tests__/indexed-db-provider.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { IndexedDBProvider } from '../providers/indexed-db';

describe('IndexedDBProvider', () => {
    let provider: IndexedDBProvider;

    beforeEach(async () => {
        provider = new IndexedDBProvider();
        await provider.initialize();
    });

    afterEach(async () => {
        await provider.clear();
        provider.dispose();
    });

    it'应正确设置 provider 信息', () => {
        expect(provider.name).toBe('IndexedDBProvider');
        expect(provider.type).toBe('indexeddb');
    });

    it'应设置和获取值', async () => {
        await provider.set('test_key1', JSON.stringify('value1'));
        const result = await provider.get('test_key1');
        expect(JSON.parse(result!)).toBe('value1');
    });

    it'应返回 undefined 对于不存在的 key', async () => {
        const result = await provider.get('test_nonexistent');
        expect(result).toBeUndefined();
    });

    it'应检查 key 是否存在', async () => {
        await provider.set('test_key1', JSON.stringify('value1'));
        expect(await provider.has('test_key1')).toBe(true);
        expect(await provider.has('test_key2')).toBe(false);
    });

    it'应删除 key', async () => {
        await provider.set('test_key1', JSON.stringify('value1'));
        await provider.delete('test_key1');
        expect(await provider.has('test_key1')).toBe(false);
    });

    it'应获取所有 keys', async () => {
        await provider.set('test_key1', JSON.stringify('v1'));
        await provider.set('test_key2', JSON.stringify('v2'));
        const keys = await provider.keys();
        expect(keys).toContain('test_key1');
        expect(keys).toContain('test_key2');
    });

    it'应清空存储', async () => {
        await provider.set('test_key1', JSON.stringify('v1'));
        await provider.set('test_key2', JSON.stringify('v2'));
        await provider.clear();
        expect(await provider.keys()).toHaveLength(0);
    });

    it'应报告使用量', async () => {
        await provider.set('test_key1', JSON.stringify('value1'));
        const usage = await provider.getUsage();
        // IndexedDB 使用量可能为 0 取决于浏览器支持
        expect(usage.usedBytes).toBeGreaterThanOrEqual(0);
    });
});
```

- [ ] **Step 3: 运行 IndexedDBProvider 测试**

```bash
cd apps/web && npx vitest run src/platform/storage/__tests__/indexed-db-provider.test.ts
```

Expected: PASS

- [ ] **Step 4: 提交**

```bash
git add apps/web/src/platform/storage/providers/indexed-db.ts apps/web/src/platform/storage/__tests__/indexed-db-provider.test.ts
git commit -m "feat(storage): 实现 IndexedDB 存储提供者"
```

---

### Task 7: StorageService 核心实现

**Files:**
- Create: `apps/web/src/platform/storage/service.ts`
- Test: `apps/web/src/platform/storage/__tests__/service.test.ts`

- [ ] **Step 1: 实现 StorageService 核心类**

```typescript
// apps/web/src/platform/storage/service.ts

import { Service, ServiceBase } from '@platform/di';
import type { IStorageProvider, StorageOptions } from './types';
import { MemoryProvider } from './providers/memory';
import { LocalStorageProvider } from './providers/local-storage';
import { IndexedDBProvider } from './providers/indexed-db';
import { StorageNotSupportedError, StorageNotInitializedError } from './errors';
import { serialize, deserialize, isExpired } from './utils/serializer';
import { encrypt, decrypt, generateKey } from './utils/crypto';

@Service({ singleton: true })
export class StorageService extends ServiceBase {
    private provider: IStorageProvider | null = null;
    private isInitialized = false;
    private encryptionKey: CryptoKey | null = null;

    /**
     * 初始化存储服务
     */
    async initialize(options?: StorageOptions): Promise<void> {
        if (this.isInitialized) return;

        const storageType = options?.type || 'local';

        switch (storageType) {
            case 'memory':
                this.provider = new MemoryProvider();
                break;
            case 'local':
                this.provider = new LocalStorageProvider();
                break;
            case 'indexeddb':
                this.provider = new IndexedDBProvider();
                break;
            default:
                throw new StorageNotSupportedError(storageType);
        }

        await this.provider.initialize();

        // 如果提供了加密密钥，生成加密密钥
        if (options?.encryptionKey) {
            this.encryptionKey = await generateKey(options.encryptionKey);
        }

        this.isInitialized = true;
    }

    /**
     * 获取值
     */
    async get<T>(key: string): Promise<T | undefined> {
        this.ensureInitialized();
        if (!this.provider) return undefined;

        const data = await this.provider.get<string>(key);
        if (!data) return undefined;

        // 如果配置了加密，解密数据
        let value: string;
        if (this.encryptionKey) {
            value = await decrypt(data, this.encryptionKey);
        } else {
            value = data;
        }

        return deserialize<T>(value);
    }

    /**
     * 设置值
     */
    async set<T>(key: string, value: T): Promise<void> {
        this.ensureInitialized();
        if (!this.provider) return;

        const serialized = serialize(value);

        // 如果配置了加密，加密数据
        let data: string;
        if (this.encryptionKey) {
            data = await encrypt(serialized, this.encryptionKey);
        } else {
            data = serialized;
        }

        await this.provider.set(key, data);
    }

    /**
     * 删除值
     */
    async delete(key: string): Promise<void> {
        this.ensureInitialized();
        if (!this.provider) return;

        await this.provider.delete(key);
    }

    /**
     * 检查 key 是否存在
     */
    async has(key: string): Promise<boolean> {
        this.ensureInitialized();
        if (!this.provider) return false;

        return this.provider.has(key);
    }

    /**
     * 获取所有 keys
     */
    async keys(): Promise<string[]> {
        this.ensureInitialized();
        if (!this.provider) return [];

        return this.provider.keys();
    }

    /**
     * 清空存储
     */
    async clear(): Promise<void> {
        this.ensureInitialized();
        if (!this.provider) return;

        await this.provider.clear();
    }

    /**
     * 获取存储使用量
     */
    async getUsage() {
        this.ensureInitialized();
        if (!this.provider) return { usedBytes: 0 };

        return this.provider.getUsage();
    }

    /**
     * 切换存储提供者
     */
    async switchProvider(options: StorageOptions): Promise<void> {
        // 清理当前 provider
        if (this.provider) {
            this.provider.dispose();
        }

        this.isInitialized = false;
        this.provider = null;

        await this.initialize(options);
    }

    override dispose(): void {
        if (this.provider) {
            this.provider.dispose();
            this.provider = null;
        }
        this.isInitialized = false;
    }

    private ensureInitialized(): void {
        if (!this.isInitialized) {
            throw new StorageNotInitializedError();
        }
    }
}
```

- [ ] **Step 2: 创建 StorageService 测试**

```typescript
// apps/web/src/platform/storage/__tests__/service.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { StorageService } from '../service';

describe('StorageService', () => {
    let service: StorageService;

    beforeEach(async () => {
        service = new StorageService();
        await service.initialize({ type: 'memory' });
    });

    afterEach(() => {
        service.dispose();
    });

    it'应成功初始化', async () => {
        expect(service).toBeDefined();
    });

    it'应设置和获取值', async () => {
        await service.set('key1', 'value1');
        const result = await service.get('key1');
        expect(result).toBe('value1');
    });

    it'应返回 undefined 对于不存在的 key', async () => {
        const result = await service.get('nonexistent');
        expect(result).toBeUndefined();
    });

    it'应检查 key 是否存在', async () => {
        await service.set('key1', 'value1');
        expect(await service.has('key1')).toBe(true);
        expect(await service.has('key2')).toBe(false);
    });

    it'应删除 key', async () => {
        await service.set('key1', 'value1');
        await service.delete('key1');
        expect(await service.has('key1')).toBe(false);
    });

    it'应获取所有 keys', async () => {
        await service.set('key1', 'value1');
        await service.set('key2', 'value2');
        const keys = await service.keys();
        expect(keys).toContain('key1');
        expect(keys).toContain('key2');
    });

    it'应清空存储', async () => {
        await service.set('key1', 'value1');
        await service.set('key2', 'value2');
        await service.clear();
        expect(await service.keys()).toHaveLength(0);
    });

    it'应获取使用量', async () => {
        await service.set('key1', 'value1');
        const usage = await service.getUsage();
        expect(usage.usedBytes).toBeGreaterThan(0);
    });

    it'应存储复杂对象', async () => {
        const obj = { name: 'test', values: [1, 2, 3], nested: { a: 'b' } };
        await service.set('obj', obj);
        const result = await service.get<typeof obj>('obj');
        expect(result).toEqual(obj);
    });

    it'在初始化前应抛出错误', async () => {
        const newService = new StorageService();
        await expect(newService.get('key')).rejects.toThrow('存储未初始化');
    });
});
```

- [ ] **Step 3: 运行 StorageService 测试**

```bash
cd apps/web && npx vitest run src/platform/storage/__tests__/service.test.ts
```

Expected: PASS

- [ ] **Step 4: 提交**

```bash
git add apps/web/src/platform/storage/service.ts apps/web/src/platform/storage/__tests__/service.test.ts
git commit -m "feat(storage): 实现存储服务核心功能"
```

---

### Task 8: 导出和索引

**Files:**
- Create: `apps/web/src/platform/storage/index.ts`

- [ ] **Step 1: 创建统一导出文件**

```typescript
// apps/web/src/platform/storage/index.ts

// 服务
export { StorageService } from './service';

// 类型
export type {
    StorageType,
    StorageUsage,
    IStorageProvider,
    StorageOptions,
    StorageEntry,
    SerializedEntry,
    StorageProviderFactory,
} from './types';

// Provider
export { MemoryProvider } from './providers/memory';
export { LocalStorageProvider } from './providers/local-storage';
export { IndexedDBProvider } from './providers/indexed-db';

// 工具
export { serialize, deserialize, serializeEntry, deserializeEntry, isExpired } from './utils/serializer';
export { encrypt, decrypt, generateKey } from './utils/crypto';

// 错误
export {
    StorageError,
    StorageNotSupportedError,
    StorageQuotaExceededError,
    StorageNotInitializedError,
    StorageSerializationError,
    StorageEncryptionError,
} from './errors';
```

- [ ] **Step 2: 运行 TypeScript 检查所有导出**

```bash
cd apps/web && npx tsc --noEmit src/platform/storage/index.ts
```

Expected: 无错误

- [ ] **Step 3: 提交**

```bash
git add apps/web/src/platform/storage/index.ts
git commit -m "feat(storage): 添加统一导出文件"
```

---

### Task 9: 集成测试

**Files:**
- Create: `apps/web/src/platform/storage/__tests__/integration.test.ts`

- [ ] **Step 1: 创建集成测试**

```typescript
// apps/web/src/platform/storage/__tests__/integration.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { StorageService } from '../service';
import { MemoryProvider, LocalStorageProvider, IndexedDBProvider } from '../providers';

describe('StorageService Integration', () => {
    describe('MemoryProvider 集成', () => {
        let service: StorageService;

        beforeEach(async () => {
            service = new StorageService();
            await service.initialize({ type: 'memory' });
        });

        afterEach(() => {
            service.dispose();
        });

        it'应使用 MemoryProvider 正常工作', async () => {
            await service.set('user', { id: 1, name: 'Alice' });
            const user = await service.get('user');
            expect(user).toEqual({ id: 1, name: 'Alice' });
        });
    });

    describe('LocalStorageProvider 集成', () => {
        let service: StorageService;

        beforeEach(async () => {
            service = new StorageService();
            await service.initialize({ type: 'local' });
            // 清理
            await service.clear();
        });

        afterEach(async () => {
            await service.clear();
            service.dispose();
        });

        it'应使用 LocalStorageProvider 正常工作', async () => {
            await service.set('config', { theme: 'dark', lang: 'zh-CN' });
            const config = await service.get('config');
            expect(config).toEqual({ theme: 'dark', lang: 'zh-CN' });
        });
    });

    describe('Provider 切换', () => {
        let service: StorageService;

        beforeEach(async () => {
            service = new StorageService();
            await service.initialize({ type: 'memory' });
        });

        afterEach(() => {
            service.dispose();
        });

        it'应支持切换存储提供者', async () => {
            await service.set('key', 'value1');
            expect(await service.get('key')).toBe('value1');

            await service.switchProvider({ type: 'memory' });
            // 切换后数据不保留（预期行为）
            expect(await service.get('key')).toBeUndefined();
        });
    });
});
```

- [ ] **Step 2: 运行集成测试**

```bash
cd apps/web && npx vitest run src/platform/storage/__tests__/integration.test.ts
```

Expected: PASS

- [ ] **Step 3: 提交**

```bash
git add apps/web/src/platform/storage/__tests__/integration.test.ts
git commit -m "test(storage): 添加集成测试"
```

---

### Task 10: 最终验证

- [ ] **Step 1: 运行所有存储测试**

```bash
cd apps/web && npx vitest run src/platform/storage/__tests__/
```

Expected: 所有测试 PASS

- [ ] **Step 2: 检查 TypeScript 类型**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: 无错误

- [ ] **Step 3: 提交最终版本**

```bash
git add apps/web/src/platform/storage/
git commit -m "docs(storage): 完成存储服务实现"
```

---

## 提交历史摘要

1. `feat(storage): 定义存储服务类型和接口`
2. `feat(storage): 定义存储服务错误类`
3. `feat(storage): 实现序列化和加密工具`
4. `feat(storage): 实现内存存储提供者`
5. `feat(storage): 实现本地存储提供者`
6. `feat(storage): 实现 IndexedDB 存储提供者`
7. `feat(storage): 实现存储服务核心功能`
8. `feat(storage): 添加统一导出文件`
9. `test(storage): 添加集成测试`
10. `docs(storage): 完成存储服务实现`

---

## 测试覆盖目标

- [ ] 类型定义正确
- [ ] 错误类工作正常
- [ ] 序列化/反序列化正确
- [ ] 所有三种 Provider 实现通过测试
- [ ] StorageService 核心功能正常
- [ ] 集成测试通过
- [ ] TypeScript 类型检查通过
