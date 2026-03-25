/**
 * 文件系统模块入口
 *
 * @module @my-km/file-system
 */

// 错误码和错误类
export {
    DirectoryNotFoundError,
    FileAlreadyExistsError,
    FileNotFoundError,
    FileSystemError,
    FileSystemErrorCode,
    InvalidPathError,
    PermissionDeniedError,
    ProviderNotFoundError,
    ReadFailedError,
    UserDeniedPermissionError,
    WriteFailedError,
} from './errors';
// Provider 接口
export type { IFileSystemProvider } from './provider';
export { FileSystemAccessAPIProvider } from './providers/fs-access-provider';
export { IndexedDBProvider } from './providers/indexed-db-provider';

// Provider 实现
export { MemoryProvider } from './providers/memory-provider';
// 服务
export { FileSystemService } from './service';
// 类型导出
export type {
    FileContent,
    FileStat,
    FileSystemProviderCapabilitiesInfo,
    FileType,
    ParsedPath,
} from './types';
// 能力枚举和常量
export {
    FileSystemCapability,
    FileSystemCapabilityMode,
} from './types';
// 能力工具
export {
    combineCapabilities,
    getCapabilityMode,
    getCapabilityNames,
    hasCapability,
    isCapabilityMode,
    removeCapability,
} from './utils/capability';
// 路径工具
export {
    basename,
    dirname,
    extname,
    isAbsolute,
    isRelative,
    join,
    normalize,
    parsePath,
    relative,
} from './utils/path';
