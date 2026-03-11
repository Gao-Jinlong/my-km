/**
 * 文件信息（跨环境统一）
 */
export interface FileInfo {
    name: string;
    path: string;
    kind: 'file' | 'directory';
    size?: number;
    lastModified?: number;
    isReadable?: boolean;
    isWritable?: boolean;
}

/**
 * 目录条目
 */
export interface DirectoryEntry {
    name: string;
    kind: 'file' | 'directory';
    path: string;
}

/**
 * 文件读取结果
 */
export interface FileReadResult {
    content: string | Uint8Array;
    fileInfo: FileInfo;
}

/**
 * 目录选择器选项
 */
export interface DirectoryPickerOptions {
    title?: string;
    startIn?: string;
    mode?: 'read' | 'readwrite';
}

/**
 * 文件系统适配器接口
 * 所有环境实现必须遵循的契约
 */
export interface IFileSystemAdapter {
    /**
     * 适配器名称
     */
    readonly name: string;

    /**
     * 是否支持当前环境
     */
    isSupported(): Promise<boolean>;

    /**
     * 打开目录选择器（用户交互）
     * @returns 目录名称，用户取消时返回 null
     */
    openDirectoryPicker(options?: DirectoryPickerOptions): Promise<string | null>;

    /**
     * 读取文件内容
     * @param path - 文件路径
     */
    readFile(path: string): Promise<FileReadResult>;

    /**
     * 写入文件内容
     * @param path - 文件路径
     * @param content - 文件内容
     */
    writeFile(path: string, content: string | Uint8Array): Promise<void>;

    /**
     * 列出目录内容
     * @param path - 目录路径，空字符串表示根目录
     */
    listDirectory(path: string): Promise<DirectoryEntry[]>;

    /**
     * 获取文件/目录信息
     * @param path - 文件/目录路径
     */
    getFileInfo(path: string): Promise<FileInfo>;

    /**
     * 删除文件或目录
     * @param path - 文件/目录路径
     * @param options - 删除选项，recursive 表示是否递归删除目录
     */
    remove(path: string, options?: { recursive?: boolean }): Promise<void>;

    /**
     * 检查文件/目录是否存在
     * @param path - 文件/目录路径
     */
    exists(path: string): Promise<boolean>;

    /**
     * 创建目录（递归）
     * @param path - 目录路径
     */
    createDirectory(path: string): Promise<void>;
}
