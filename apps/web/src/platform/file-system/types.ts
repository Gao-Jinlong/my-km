/**
 * 文件系统能力枚举 - 位运算
 *
 * 用于定义 Provider 和文件操作的能力
 */
export enum FileSystemCapability {
    /** 无能力 */
    None = 0,
    /** 读取文件内容 */
    Read = 1 << 0, // 1
    /** 写入/创建/删除文件 */
    Write = 1 << 1, // 2
    /** 列出目录内容 */
    List = 1 << 2, // 4
    /** 读取文件元信息 */
    Metadata = 1 << 3, // 8
    /** 完全访问：Read + Write + List + Metadata */
    FullAccess = Read | Write | List | Metadata, // 15
}

/**
 * 预设能力模式
 */
export const FileSystemCapabilityMode = {
    /** 只读模式：Read + Metadata */
    ReadOnly: FileSystemCapability.Read | FileSystemCapability.Metadata, // 9
    /** 读写模式：Read + Write + Metadata */
    ReadWrite: FileSystemCapability.Read | FileSystemCapability.Write | FileSystemCapability.Metadata, // 11
    /** 完全访问：Read + Write + List + Metadata */
    FullAccess: FileSystemCapability.Read | FileSystemCapability.Write | FileSystemCapability.List | FileSystemCapability.Metadata, // 15
} as const;

/**
 * 文件类型
 */
export type FileType = 'file' | 'directory';

/**
 * 文件统计信息 - 描述文件元信息
 */
export interface FileStat {
    /** 文件类型 */
    type: FileType;
    /** 文件或目录名称 */
    name: string;
    /** 完整路径 */
    path: string;
    /** 文件大小（字节） */
    size: number;
    /** 创建时间 */
    ctime: number;
    /** 最后修改时间 */
    mtime: number;
}

/**
 * 文件内容类型 - 文本或二进制
 */
export type FileContent = string | Uint8Array;

/**
 * 解析后的路径结构
 */
export interface ParsedPath {
    /** 协议前缀 (memory, idb, file) */
    scheme: string;
    /** 权限/主机名 (如项目 ID) */
    authority: string;
    /** 实际路径 */
    path: string;
}

/**
 * Provider 能力信息
 */
export interface FileSystemProviderCapabilitiesInfo {
    /** Provider 名称 */
    name: string;
    /** 支持的 scheme */
    scheme: string;
    /** 能力位掩码 */
    capabilities: number;
}
