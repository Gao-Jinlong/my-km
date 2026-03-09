/**
 * Web 环境文件工具函数
 */

/**
 * 检查浏览器是否支持 File System API
 */
export function isFileSystemAPISupported(): boolean {
    return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

/**
 * 规范化路径，移除前导斜杠和末尾斜杠
 */
export function normalizePath(path: string): string {
    return path.replace(/^\/+|\/+$/g, '');
}

/**
 * 从路径中获取目录句柄
 */
export async function getDirectoryHandleFromPath(
    rootHandle: FileSystemDirectoryHandle,
    path: string,
): Promise<FileSystemDirectoryHandle> {
    const normalizedPath = normalizePath(path);

    if (normalizedPath === '') {
        return rootHandle;
    }

    const parts = normalizedPath.split('/');
    let currentHandle = rootHandle;

    for (const part of parts) {
        if (part === '') continue;
        currentHandle = await currentHandle.getDirectoryHandle(part);
    }

    return currentHandle;
}

/**
 * 从路径中获取文件句柄
 */
export async function getFileHandleFromPath(
    rootHandle: FileSystemDirectoryHandle,
    path: string,
    options?: { create?: boolean },
): Promise<FileSystemFileHandle | null> {
    const normalizedPath = normalizePath(path);
    const parts = normalizedPath.split('/');
    const fileName = parts[parts.length - 1];
    const dirPath = parts.slice(0, -1).join('/');

    let dirHandle: FileSystemDirectoryHandle;
    if (dirPath === '') {
        dirHandle = rootHandle;
    } else {
        try {
            dirHandle = await rootHandle.getDirectoryHandle(dirPath);
        } catch {
            return null;
        }
    }

    try {
        return await dirHandle.getFileHandle(fileName, { create: options?.create });
    } catch {
        return null;
    }
}
