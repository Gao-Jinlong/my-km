import { IFileSystemProvider } from '../provider';
import { FileStat, FileContent, FileSystemCapability } from '../types';
import {
    FileNotFoundError,
    DirectoryNotFoundError,
    ReadFailedError,
    WriteFailedError,
    UserDeniedPermissionError,
} from '../errors';
import { Disposable } from '../../../base/common/lifecycle';

/**
 * File System Access API Provider - 浏览器原生文件访问
 *
 * 使用 File System Access API 访问用户本地文件系统
 * 注意：仅在 Chromium 系浏览器中可用
 */
export class FileSystemAccessAPIProvider extends Disposable implements IFileSystemProvider {
    readonly name = 'FileSystemAccessAPIProvider';
    readonly scheme = 'file';
    readonly rootPath = '/';
    readonly capabilities = FileSystemCapability.FullAccess;

    private directoryHandle: FileSystemDirectoryHandle | null = null;
    private handleCache: Map<string, FileSystemHandle> = new Map();

    /**
     * 检查是否能处理指定路径
     */
    canHandle(path: string): boolean {
        return path.startsWith(`${this.scheme}://`);
    }

    /**
     * 打开目录 - 使用 File System Access API 选择目录
     */
    async openDirectory(_path?: string): Promise<void> {
        if (!('showDirectoryPicker' in window)) {
            throw new Error('当前浏览器不支持 File System Access API');
        }

        try {
            this.directoryHandle = await window.showDirectoryPicker({
                mode: 'readwrite',
            });
            return Promise.resolve();
        } catch (error) {
            if ((error as Error).name === 'AbortError') {
                throw new UserDeniedPermissionError('选择目录');
            }
            throw error;
        }
    }

    /**
     * 列出目录内容
     */
    async listFiles(path: string): Promise<FileStat[]> {
        const dirHandle = await this.getDirectoryHandle(path);
        const results: FileStat[] = [];

        for await (const entry of dirHandle.values()) {
            const stat = await this.getStat(entry, `${path}/${entry.name}`);
            results.push(stat);
        }

        return results;
    }

    /**
     * 创建目录
     */
    async createDirectory(path: string): Promise<void> {
        const parentPath = this.dirname(path);
        const dirName = this.basename(path);

        const parentHandle = await this.getDirectoryHandle(parentPath);

        try {
            await parentHandle.getDirectoryHandle(dirName, { create: true });
        } catch (error) {
            throw new WriteFailedError(path, error as Error);
        }
    }

    /**
     * 删除目录
     */
    async deleteDirectory(path: string): Promise<void> {
        const parentPath = this.dirname(path);
        const dirName = this.basename(path);

        const parentHandle = await this.getDirectoryHandle(parentPath);

        try {
            await parentHandle.removeEntry(dirName, { recursive: true });
        } catch (_error) {
            throw new DirectoryNotFoundError(path);
        }
    }

    /**
     * 读取文件内容
     */
    async readFile(path: string): Promise<FileContent> {
        const fileHandle = await this.getFileHandle(path, 'read');

        try {
            const file = await fileHandle.getFile();
            return await file.text();
        } catch (error) {
            throw new ReadFailedError(path, error as Error);
        }
    }

    /**
     * 写入文件内容
     */
    async writeFile(path: string, content: FileContent): Promise<void> {
        const fileHandle = await this.getFileHandle(path, 'readwrite');

        try {
            const writable = await fileHandle.createWritable();
            await writable.write(content);
            await writable.close();
        } catch (error) {
            throw new WriteFailedError(path, error as Error);
        }
    }

    /**
     * 删除文件
     */
    async deleteFile(path: string): Promise<void> {
        const parentPath = this.dirname(path);
        const fileName = this.basename(path);

        const parentHandle = await this.getDirectoryHandle(parentPath);

        try {
            await parentHandle.removeEntry(fileName);
        } catch (_error) {
            throw new FileNotFoundError(path);
        }
    }

    /**
     * 获取文件句柄
     */
    async getFileHandle(path: string, mode: 'read' | 'readwrite'): Promise<FileSystemFileHandle | FileSystemDirectoryHandle> {
        if (!this.directoryHandle) {
            throw new Error('请先打开目录');
        }

        const cacheKey = `${path}:${mode}`;
        const cached = this.handleCache.get(cacheKey);
        if (cached && cached.kind === 'file') {
            return cached as FileSystemFileHandle;
        }

        const parts = path.split('/').filter(p => p !== '');
        let currentHandle: FileSystemHandle = this.directoryHandle;

        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            const isLast = i === parts.length - 1;

            try {
                if (currentHandle.kind === 'directory') {
                    const dirHandle = currentHandle as FileSystemDirectoryHandle;
                    if (isLast) {
                        const fileHandle = await dirHandle.getFileHandle(part, {
                            create: mode === 'readwrite',
                        });
                        this.handleCache.set(cacheKey, fileHandle);
                        return fileHandle;
                    } else {
                        currentHandle = await dirHandle.getDirectoryHandle(part);
                    }
                } else {
                    throw new FileNotFoundError(path);
                }
            } catch (error) {
                if ((error as DOMException).name === 'NotFoundError') {
                    throw new FileNotFoundError(path);
                }
                throw error;
            }
        }

        throw new FileNotFoundError(path);
    }

    /**
     * 获取文件统计信息
     */
    async stat(path: string): Promise<FileStat> {
        const handle = await this.getFileHandle(path, 'read');
        return this.getStat(handle, path);
    }

    /**
     * 获取句柄的统计信息
     */
    private async getStat(handle: FileSystemHandle, path: string): Promise<FileStat> {
        if (handle.kind === 'file') {
            const fileHandle = handle as FileSystemFileHandle;
            const file = await fileHandle.getFile();
            return {
                type: 'file',
                name: file.name,
                path,
                size: file.size,
                ctime: file.lastModified,
                mtime: file.lastModified,
            };
        } else {
            return {
                type: 'directory',
                name: handle.name,
                path,
                size: 0,
                ctime: Date.now(),
                mtime: Date.now(),
            };
        }
    }

    /**
     * 获取目录句柄
     */
    private async getDirectoryHandle(path: string): Promise<FileSystemDirectoryHandle> {
        if (!this.directoryHandle) {
            throw new DirectoryNotFoundError(path);
        }

        if (path === '/' || path === '') {
            return this.directoryHandle;
        }

        const parts = path.split('/').filter(p => p !== '');
        let currentHandle: FileSystemHandle = this.directoryHandle;

        for (const part of parts) {
            if (currentHandle.kind === 'directory') {
                const dirHandle = currentHandle as FileSystemDirectoryHandle;
                try {
                    currentHandle = await dirHandle.getDirectoryHandle(part);
                } catch (_error) {
                    throw new DirectoryNotFoundError(path);
                }
            } else {
                throw new DirectoryNotFoundError(path);
            }
        }

        return currentHandle as FileSystemDirectoryHandle;
    }

    /**
     * 获取路径的目录部分
     */
    private dirname(path: string): string {
        const parts = path.split('/').filter(p => p !== '');
        parts.pop();
        return `/${parts.join('/')}`;
    }

    /**
     * 获取路径的文件名部分
     */
    private basename(path: string): string {
        const parts = path.split('/').filter(p => p !== '');
        return parts[parts.length - 1] || '/';
    }

    /**
     * 设置目录句柄（用于从外部传入）
     */
    setDirectoryHandle(handle: FileSystemDirectoryHandle): void {
        this.directoryHandle = handle;
    }

    override dispose(): void {
        this.handleCache.clear();
        this.directoryHandle = null;
        super.dispose();
    }
}
