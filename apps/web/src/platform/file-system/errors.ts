/**
 * 文件系统错误码枚举
 */
export enum FileSystemErrorCode {
    /** 未找到对应 scheme 的 Provider */
    ProviderNotFound = 'PROVIDER_NOT_FOUND',
    /** Provider 不具备所需能力 */
    PermissionDenied = 'PERMISSION_DENIED',
    /** 文件不存在 */
    FileNotFound = 'FILE_NOT_FOUND',
    /** 目录不存在 */
    DirectoryNotFound = 'DIRECTORY_NOT_FOUND',
    /** 文件已存在 */
    FileAlreadyExists = 'FILE_ALREADY_EXISTS',
    /** 路径无效 */
    InvalidPath = 'INVALID_PATH',
    /** 读取失败 */
    ReadFailed = 'READ_FAILED',
    /** 写入失败 */
    WriteFailed = 'WRITE_FAILED',
    /** 用户拒绝授权 */
    UserDeniedPermission = 'USER_DENIED_PERMISSION',
}

/**
 * 文件系统错误类
 */
export class FileSystemError extends Error {
    /** 错误码 */
    public readonly code: FileSystemErrorCode;
    /** 原始错误原因 */
    public readonly cause?: Error;

    constructor(code: FileSystemErrorCode, message?: string, options?: { cause?: Error }) {
        const defaultMessage = FileSystemError.getDefaultMessage(code);
        super(message ?? defaultMessage);
        this.name = 'FileSystemError';
        this.code = code;
        this.cause = options?.cause;

        // 保持正确的原型链
        Object.setPrototypeOf(this, new.target.prototype);
    }

    /**
     * 获取错误码的默认消息
     */
    private static getDefaultMessage(code: FileSystemErrorCode): string {
        switch (code) {
            case FileSystemErrorCode.ProviderNotFound:
                return '未找到对应的 Provider';
            case FileSystemErrorCode.PermissionDenied:
                return '没有执行此操作的权限';
            case FileSystemErrorCode.FileNotFound:
                return '文件不存在';
            case FileSystemErrorCode.DirectoryNotFound:
                return '目录不存在';
            case FileSystemErrorCode.FileAlreadyExists:
                return '文件已存在';
            case FileSystemErrorCode.InvalidPath:
                return '无效的路径';
            case FileSystemErrorCode.ReadFailed:
                return '读取失败';
            case FileSystemErrorCode.WriteFailed:
                return '写入失败';
            case FileSystemErrorCode.UserDeniedPermission:
                return '用户拒绝授权';
            default:
                return '文件系统错误';
        }
    }
}

/**
 * Provider 未找到错误
 */
export class ProviderNotFoundError extends FileSystemError {
    constructor(scheme: string) {
        super(FileSystemErrorCode.ProviderNotFound, `未找到处理 "${scheme}://" 的 Provider`);
        this.name = 'ProviderNotFoundError';
        Object.setPrototypeOf(this, ProviderNotFoundError.prototype);
    }
}

/**
 * 权限拒绝错误
 */
export class PermissionDeniedError extends FileSystemError {
    constructor(operation: string, capability: string) {
        super(FileSystemErrorCode.PermissionDenied, `执行 "${operation}" 需要 ${capability} 能力`);
        this.name = 'PermissionDeniedError';
        Object.setPrototypeOf(this, PermissionDeniedError.prototype);
    }
}

/**
 * 文件未找到错误
 */
export class FileNotFoundError extends FileSystemError {
    constructor(path: string) {
        super(FileSystemErrorCode.FileNotFound, `文件不存在：${path}`);
        this.name = 'FileNotFoundError';
        Object.setPrototypeOf(this, FileNotFoundError.prototype);
    }
}

/**
 * 目录未找到错误
 */
export class DirectoryNotFoundError extends FileSystemError {
    constructor(path: string) {
        super(FileSystemErrorCode.DirectoryNotFound, `目录不存在：${path}`);
        this.name = 'DirectoryNotFoundError';
        Object.setPrototypeOf(this, DirectoryNotFoundError.prototype);
    }
}

/**
 * 文件已存在错误
 */
export class FileAlreadyExistsError extends FileSystemError {
    constructor(path: string) {
        super(FileSystemErrorCode.FileAlreadyExists, `文件已存在：${path}`);
        this.name = 'FileAlreadyExistsError';
        Object.setPrototypeOf(this, FileAlreadyExistsError.prototype);
    }
}

/**
 * 无效路径错误
 */
export class InvalidPathError extends FileSystemError {
    constructor(path: string, reason: string) {
        super(FileSystemErrorCode.InvalidPath, `无效的路径 "${path}": ${reason}`);
        this.name = 'InvalidPathError';
        Object.setPrototypeOf(this, InvalidPathError.prototype);
    }
}

/**
 * 读取失败错误
 */
export class ReadFailedError extends FileSystemError {
    constructor(path: string, cause?: Error) {
        super(FileSystemErrorCode.ReadFailed, `读取文件失败：${path}`, { cause });
        this.name = 'ReadFailedError';
        Object.setPrototypeOf(this, ReadFailedError.prototype);
    }
}

/**
 * 写入失败错误
 */
export class WriteFailedError extends FileSystemError {
    constructor(path: string, cause?: Error) {
        super(FileSystemErrorCode.WriteFailed, `写入文件失败：${path}`, { cause });
        this.name = 'WriteFailedError';
        Object.setPrototypeOf(this, WriteFailedError.prototype);
    }
}

/**
 * 用户拒绝授权错误
 */
export class UserDeniedPermissionError extends FileSystemError {
    constructor(operation: string) {
        super(FileSystemErrorCode.UserDeniedPermission, `用户拒绝授权执行：${operation}`);
        this.name = 'UserDeniedPermissionError';
        Object.setPrototypeOf(this, UserDeniedPermissionError.prototype);
    }
}
