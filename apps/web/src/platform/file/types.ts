/**
 * 文件句柄类型（仅 Web 环境使用）
 */
export type FileHandleKey = string;

/**
 * 文件系统句柄（仅 Web 环境使用）
 */
export type FileSystemHandle = FileSystemFileHandle | FileSystemDirectoryHandle;

/**
 * 文件句柄缓存项（仅 Web 环境使用）
 */
export interface FileHandleCacheItem {
    key: FileHandleKey;
    handle: FileSystemHandle;
    timestamp: number;
}

/**
 * 文件信息（跨环境统一）
 */
export interface FileInfo {
    name: string;
    kind: 'file' | 'directory';
    size?: number;
    lastModified?: Date;
    relativePath: string;
}

/**
 * 项目信息（跨环境统一）
 * 不再依赖特定环境的句柄类型
 */
export interface ProjectInfo {
    id: string;
    name: string;
    // rootHandle 已移除 - 由适配器内部管理根路径
    openedAt: Date;
}

/**
 * 文件资源（跨环境统一）
 */
export interface FileResource {
    id: string;
    path: string;
    // handle 已移除 - 由适配器内部管理
    isActive: boolean;
}

/**
 * 文件读取结果（跨环境统一）
 */
export interface FileReadResult {
    content: string | ArrayBuffer;
    fileInfo: FileInfo;
}

/**
 * 目录列表项（跨环境统一）
 */
export interface DirectoryEntry {
    name: string;
    kind: 'file' | 'directory';
    path: string;
    // handle 已移除 - 跨环境不通用
}

/**
 * 文件系统错误基类
 */
export class FileSystemError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'FileSystemError';
    }
}

/**
 * 文件未找到错误
 */
export class FileNotFoundError extends FileSystemError {
    constructor(path: string) {
        super(`File not found: ${path}`);
        this.name = 'FileNotFoundError';
    }
}

/**
 * 权限拒绝错误
 */
export class PermissionDeniedError extends FileSystemError {
    constructor(operation: string) {
        super(`Permission denied: ${operation}`);
        this.name = 'PermissionDeniedError';
    }
}

/**
 * 文件已存在错误
 */
export class FileExistsError extends FileSystemError {
    constructor(path: string) {
        super(`File already exists: ${path}`);
        this.name = 'FileExistsError';
    }
}

/**
 * 句柄失效错误（仅 Web 环境使用）
 */
export class HandleExpiredError extends FileSystemError {
    constructor(key: string) {
        super(`Handle expired: ${key}`);
        this.name = 'HandleExpiredError';
    }
}

/**
 * 项目未打开错误
 */
export class ProjectNotOpenError extends FileSystemError {
    constructor() {
        super('No project is currently open');
        this.name = 'ProjectNotOpenError';
    }
}

/**
 * 无效路径错误
 */
export class InvalidPathError extends FileSystemError {
    constructor(path: string, reason: string) {
        super(`Invalid path "${path}": ${reason}`);
        this.name = 'InvalidPathError';
    }
}
