import { Disposable } from '../../../base/common/lifecycle';
import {
    DirectoryNotFoundError,
    FileNotFoundError,
    ReadFailedError,
    UserDeniedPermissionError,
    WriteFailedError,
} from '../errors';
import type { IFileSystemProvider } from '../provider';
import { type FileContent, type FileStat, FileSystemCapability } from '../types';

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
            this.directoryHandle = await (
                window as unknown as {
                    showDirectoryPicker: (options?: {
                        mode?: 'readwrite' | 'read';
                    }) => Promise<FileSystemDirectoryHandle>;
                }
            ).showDirectoryPicker({
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

        for await (const entry of (
            dirHandle as unknown as { values(): IterableIterator<FileSystemHandle> }
        ).values()) {
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
        const fileHandle = (await this.getFileHandle(path, 'read')) as FileSystemFileHandle;

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
    async getFileHandle(
        path: string,
        mode: 'read' | 'readwrite',
    ): Promise<FileSystemFileHandle | FileSystemDirectoryHandle> {
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
     * 重命名文件/目录
     *
     * 使用 File System Access API 的 move 操作实现
     * 注意：move API 仍在实验阶段，这里通过复制 + 删除实现
     */
    async rename(oldPath: string, newName: string): Promise<void> {
        const parentPath = this.dirname(oldPath);
        const oldName = this.basename(oldPath);
        const _newPath = `${parentPath}/${newName}`;

        const parentHandle = await this.getDirectoryHandle(parentPath);

        try {
            // 获取原句柄 - 先尝试文件，再尝试目录
            let oldHandle: FileSystemHandle;
            let isDirectory: boolean;

            try {
                oldHandle = await (parentHandle as FileSystemDirectoryHandle).getFileHandle(
                    oldName,
                );
                isDirectory = false;
            } catch (fileError) {
                if ((fileError as DOMException).name === 'NotFoundError') {
                    // 不是文件，尝试目录
                    oldHandle = await (
                        parentHandle as FileSystemDirectoryHandle
                    ).getDirectoryHandle(oldName);
                    isDirectory = true;
                } else {
                    // 其他错误（包括 TypeMismatchError），抛出
                    throw fileError;
                }
            }

            // File System Access API 没有直接的 rename 方法
            // 需要通过复制 + 删除实现
            if (isDirectory) {
                // 目录重命名：创建新目录 -> 递归复制内容 -> 删除原目录
                const newDirHandle = await parentHandle.getDirectoryHandle(newName, {
                    create: true,
                });
                await this._copyDirectoryContents(
                    oldHandle as FileSystemDirectoryHandle,
                    newDirHandle as FileSystemDirectoryHandle,
                );
                await parentHandle.removeEntry(oldName, { recursive: true });
            } else {
                // 文件重命名：读取 -> 写入新文件 -> 删除原文件
                const oldFileHandle = await (
                    parentHandle as FileSystemDirectoryHandle
                ).getFileHandle(oldName);
                const file = await oldFileHandle.getFile();
                const content = await file.text();

                const newFileHandle = await parentHandle.getFileHandle(newName, { create: true });
                const writable = await newFileHandle.createWritable();
                await writable.write(content);
                await writable.close();

                await parentHandle.removeEntry(oldName);
            }

            // 清理缓存
            this.handleCache.clear();
        } catch (error) {
            if ((error as DOMException).name === 'NotFoundError') {
                throw new FileNotFoundError(oldPath);
            }
            throw new WriteFailedError(oldPath, error as Error);
        }
    }

    /**
     * 递归复制目录内容
     */
    private async _copyDirectoryContents(
        sourceDir: FileSystemDirectoryHandle,
        targetDir: FileSystemDirectoryHandle,
    ): Promise<void> {
        for await (const entry of sourceDir.values()) {
            if (entry.kind === 'file') {
                const file = await entry.getFile();
                const content = await file.text();
                const newFile = await targetDir.getFileHandle(entry.name, { create: true });
                const writable = await newFile.createWritable();
                await writable.write(content);
                await writable.close();
            } else {
                const newSubDir = await targetDir.getDirectoryHandle(entry.name, { create: true });
                await this._copyDirectoryContents(entry as FileSystemDirectoryHandle, newSubDir);
            }
        }
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
