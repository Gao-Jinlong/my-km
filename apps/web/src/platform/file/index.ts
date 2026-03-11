/**
 * 文件系统服务模块
 *
 * 基于适配器模式的文件系统 API
 * 当前仅支持 Web 环境（浏览器 File System Access API）
 */

export {
    createAdapter,
    createMockAdapter,
    createWebAdapter,
} from './adapter/factory';
// 适配器模块导出
export type {
    DirectoryPickerOptions,
    IFileSystemAdapter,
} from './adapter/types';
export { WebAdapter } from './adapter/web/web-adapter';
// 缓存类导出
export { FileHandleCache } from './cache/file-handle-cache';
// IndexedDB 工具导出（仅 Web 环境使用）
export {
    dbClear,
    dbDelete,
    dbGet,
    dbGetAll,
    dbGetAllKeys,
    dbHas,
    dbSet,
    openDB,
} from './db/idb';
// 环境检测导出
export { detectEnvironment, isWeb } from './env/environment';

// 资源管理器导出
export { FileResourceManager } from './manager/file-resource-manager';

// 服务类导出
export { FileSystemService } from './service/file-system-service';

// 类型导出
export type {
    DirectoryEntry,
    FileHandleCacheItem,
    FileHandleKey,
    FileInfo,
    FileReadResult,
    FileResource,
    FileSystemHandle,
    ProjectInfo,
} from './types';

// 错误类型导出
export {
    FileExistsError,
    FileNotFoundError,
    FileSystemError,
    HandleExpiredError,
    InvalidPathError,
    PermissionDeniedError,
    ProjectNotOpenError,
} from './types';
