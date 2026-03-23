/**
 * 项目信息接口
 */
export interface ProjectInfo {
    /** 项目唯一标识 (使用目录句柄路径或生成的 ID) */
    id: string;
    /** 项目名称 (目录名) */
    name: string;
    /** 根目录句柄 */
    rootHandle: FileSystemDirectoryHandle | null;
    /** 项目打开时间 */
    openedAt: number;
}

/**
 * 项目状态接口
 */
export interface ProjectState {
    /** 当前打开的项目信息 */
    currentProject: ProjectInfo | null;
    /** 是否有项目处于打开状态 */
    isOpen: boolean;
    /** 是否正在加载 */
    loading: boolean;
}

/**
 * 文件句柄缓存接口
 */
export interface FileHandleCache {
    /** 缓存的句柄 Map */
    handles: Map<string, FileSystemHandle>;
    /** 最后访问时间 */
    lastAccessed: number;
}
