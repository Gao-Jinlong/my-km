import type {
    DirectoryEntry,
    DirectoryPickerOptions,
    FileInfo,
    FileReadResult,
    IFileSystemAdapter,
} from '../types';
import { isFileSystemAPISupported, normalizePath } from './web-helpers';

/**
 * Web 环境文件系统适配器
 * 基于浏览器 File System Access API 实现
 */
export class WebAdapter implements IFileSystemAdapter {
    readonly name = 'web';
    private rootHandle: FileSystemDirectoryHandle | null = null;

    async isSupported(): Promise<boolean> {
        return isFileSystemAPISupported();
    }

    /**
     * 设置根目录句柄（内部使用）
     */
    setRootHandle(handle: FileSystemDirectoryHandle): void {
        this.rootHandle = handle;
    }

    /**
     * 获取根目录句柄
     */
    getRootHandle(): FileSystemDirectoryHandle | null {
        return this.rootHandle;
    }

    async openDirectoryPicker(options?: DirectoryPickerOptions): Promise<string | null> {
        if (!isFileSystemAPISupported()) {
            throw new Error('File System API is not supported in this browser');
        }

        try {
            const handle = await window.showDirectoryPicker({
                mode: options?.mode ?? 'readwrite',
            });
            this.rootHandle = handle;
            return handle.name;
        } catch (error) {
            if (error instanceof DOMException && error.name === 'AbortError') {
                return null;
            }
            throw error;
        }
    }

    async readFile(path: string): Promise<FileReadResult> {
        if (!this.rootHandle) {
            throw new Error('No directory selected');
        }

        const normalizedPath = normalizePath(path);
        const parts = normalizedPath.split('/');
        const fileName = parts[parts.length - 1];
        const dirPath = parts.slice(0, -1).join('/');

        let dirHandle: FileSystemDirectoryHandle;
        if (dirPath === '') {
            dirHandle = this.rootHandle;
        } else {
            dirHandle = await this.rootHandle.getDirectoryHandle(dirPath);
        }

        const fileHandle = await dirHandle.getFileHandle(fileName);
        const file = await fileHandle.getFile();

        const content = await file.text();

        return {
            content,
            fileInfo: {
                name: file.name,
                path: normalizedPath,
                kind: 'file',
                size: file.size,
                lastModified: file.lastModified,
            },
        };
    }

    async writeFile(path: string, content: string | Uint8Array): Promise<void> {
        if (!this.rootHandle) {
            throw new Error('No directory selected');
        }

        const normalizedPath = normalizePath(path);
        const parts = normalizedPath.split('/');
        const fileName = parts[parts.length - 1];
        const dirPath = parts.slice(0, -1).join('/');

        let dirHandle: FileSystemDirectoryHandle;
        if (dirPath === '') {
            dirHandle = this.rootHandle;
        } else {
            try {
                dirHandle = await this.rootHandle.getDirectoryHandle(dirPath);
            } catch {
                // 目录不存在，需要创建父目录
                dirHandle = await this.createDirectories(dirPath);
            }
        }

        const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
        const writable = await fileHandle.createWritable();
        // 确保内容类型正确 - 将 Uint8Array 转换为 ArrayBuffer
        const writeContent =
            content instanceof Uint8Array ? (content.buffer as ArrayBuffer) : content;
        await writable.write(writeContent);
        await writable.close();
    }

    async listDirectory(path: string): Promise<DirectoryEntry[]> {
        if (!this.rootHandle) {
            throw new Error('No directory selected');
        }

        const normalizedPath = normalizePath(path);
        let dirHandle: FileSystemDirectoryHandle;

        if (normalizedPath === '') {
            dirHandle = this.rootHandle;
        } else {
            try {
                dirHandle = await this.rootHandle.getDirectoryHandle(normalizedPath);
            } catch {
                throw new Error(`Directory not found: ${path}`);
            }
        }

        const entries: DirectoryEntry[] = [];
        for await (const entry of dirHandle.values()) {
            entries.push({
                name: entry.name,
                kind: entry.kind as 'file' | 'directory',
                path: normalizedPath ? `${normalizedPath}/${entry.name}` : entry.name,
            });
        }

        return entries;
    }

    async getFileInfo(path: string): Promise<FileInfo> {
        if (!this.rootHandle) {
            throw new Error('No directory selected');
        }

        const normalizedPath = normalizePath(path);
        const parts = normalizedPath.split('/');
        const fileName = parts[parts.length - 1];
        const dirPath = parts.slice(0, -1).join('/');

        let dirHandle: FileSystemDirectoryHandle;
        if (dirPath === '') {
            dirHandle = this.rootHandle;
        } else {
            dirHandle = await this.rootHandle.getDirectoryHandle(dirPath);
        }

        // 尝试获取文件句柄
        let handle: FileSystemHandle;
        try {
            handle = await dirHandle.getFileHandle(fileName);
        } catch {
            try {
                handle = await dirHandle.getDirectoryHandle(fileName);
            } catch {
                throw new Error(`File or directory not found: ${path}`);
            }
        }

        if (handle.kind === 'file') {
            const file = await (handle as FileSystemFileHandle).getFile();
            return {
                name: file.name,
                path: normalizedPath,
                kind: 'file',
                size: file.size,
                lastModified: file.lastModified,
            };
        } else {
            return {
                name: handle.name,
                path: normalizedPath,
                kind: 'directory',
            };
        }
    }

    async remove(path: string, options?: { recursive?: boolean }): Promise<void> {
        if (!this.rootHandle) {
            throw new Error('No directory selected');
        }

        const normalizedPath = normalizePath(path);
        const parts = normalizedPath.split('/');
        const fileName = parts[parts.length - 1];
        const dirPath = parts.slice(0, -1).join('/');

        let dirHandle: FileSystemDirectoryHandle;
        if (dirPath === '') {
            dirHandle = this.rootHandle;
        } else {
            dirHandle = await this.rootHandle.getDirectoryHandle(dirPath);
        }

        try {
            // 尝试作为文件删除
            await dirHandle.getFileHandle(fileName);
            await dirHandle.removeEntry(fileName, { recursive: options?.recursive ?? false });
        } catch {
            // 尝试作为目录删除
            try {
                await dirHandle.removeEntry(fileName, { recursive: options?.recursive ?? false });
            } catch {
                throw new Error(`Failed to remove: ${path}`);
            }
        }
    }

    async exists(path: string): Promise<boolean> {
        if (!this.rootHandle) {
            return false;
        }

        try {
            await this.getFileInfo(path);
            return true;
        } catch {
            return false;
        }
    }

    async createDirectory(path: string): Promise<void> {
        if (!this.rootHandle) {
            throw new Error('No directory selected');
        }

        await this.createDirectories(path);
    }

    /**
     * 递归创建目录
     */
    private async createDirectories(path: string): Promise<FileSystemDirectoryHandle> {
        const normalizedPath = normalizePath(path);
        const parts = normalizedPath.split('/').filter(p => p !== '');

        let currentHandle = this.rootHandle!;

        for (const part of parts) {
            try {
                currentHandle = await currentHandle.getDirectoryHandle(part);
            } catch {
                currentHandle = await currentHandle.getDirectoryHandle(part, { create: true });
            }
        }

        return currentHandle;
    }
}
