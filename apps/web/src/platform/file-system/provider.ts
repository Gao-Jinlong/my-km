import { FileStat, FileContent } from './types';

/**
 * 文件系统 Provider 接口
 *
 * 所有存储后端必须实现此接口
 */
export interface IFileSystemProvider {
    /** Provider 名称 */
    readonly name: string;

    /** 支持的协议前缀 */
    readonly scheme: string;

    /** 根路径 */
    readonly rootPath: string;

    /** 能力位掩码 */
    readonly capabilities: number;

    /**
     * 检查是否能处理指定路径
     *
     * @param path - 要检查的路径
     * @returns 是否能处理
     */
    canHandle(path: string): boolean;

    /**
     * 打开目录
     *
     * @param path - 目录路径
     * @returns Promise
     */
    openDirectory(path: string): Promise<void>;

    /**
     * 列出目录内容
     *
     * @param path - 目录路径
     * @returns 文件统计信息数组
     */
    listFiles(path: string): Promise<FileStat[]>;

    /**
     * 创建目录
     *
     * @param path - 目录路径
     * @returns Promise
     */
    createDirectory(path: string): Promise<void>;

    /**
     * 删除目录
     *
     * @param path - 目录路径
     * @returns Promise
     */
    deleteDirectory(path: string): Promise<void>;

    /**
     * 读取文件内容
     *
     * @param path - 文件路径
     * @returns 文件内容
     */
    readFile(path: string): Promise<FileContent>;

    /**
     * 写入文件内容
     *
     * @param path - 文件路径
     * @param content - 文件内容
     * @returns Promise
     */
    writeFile(path: string, content: FileContent): Promise<void>;

    /**
     * 删除文件
     *
     * @param path - 文件路径
     * @returns Promise
     */
    deleteFile(path: string): Promise<void>;

    /**
     * 获取文件句柄
     *
     * @param path - 文件路径
     * @param mode - 访问模式
     * @returns 文件句柄
     */
    getFileHandle(path: string, mode: 'read' | 'readwrite'): Promise<FileSystemFileHandle | FileSystemDirectoryHandle>;

    /**
     * 获取文件统计信息
     *
     * @param path - 文件路径
     * @returns 文件统计信息
     */
    stat(path: string): Promise<FileStat>;
}
