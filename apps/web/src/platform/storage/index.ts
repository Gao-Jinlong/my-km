// apps/web/src/platform/storage/index.ts

// 错误类导出
export {
    StorageEncryptionError,
    StorageError,
    StorageNotInitializedError,
    StorageNotSupportedError,
    StorageQuotaExceededError,
    StorageSerializationError,
} from './errors';
export { IndexedDBProvider } from './providers/indexed-db';
export { LocalStorageProvider } from './providers/local-storage';
// Provider 导出
export { MemoryProvider } from './providers/memory';
// 核心服务导出
export { StorageService } from './service';
// 类型导出
export type {
    IStorageProvider,
    StorageEntry,
    StorageOptions,
    StorageProviderFactory,
    StorageType,
    StorageUsage,
} from './types';
export { decrypt, encrypt, generateKey } from './utils/crypto';
// 工具函数导出
export { deserialize, serialize } from './utils/serializer';
