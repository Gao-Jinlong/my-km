import {
    DirectoryNotFoundError,
    FileAlreadyExistsError,
    FileNotFoundError,
    ReadFailedError,
} from '../errors';
import type { IFileSystemProvider } from '../provider';
import { type FileContent, type FileStat, FileSystemCapability } from '../types';

/**
 * 内存文件条目
 */
interface FileEntry {
    type: 'file' | 'directory';
    name: string;
    content?: FileContent;
    size: number;
    ctime: number;
    mtime: number;
    children?: Map<string, FileEntry>;
}

/**
 * 内存 Provider - 用于测试和临时存储
 *
 * 使用 Map 存储虚拟文件系统结构
 */
export class MemoryProvider implements IFileSystemProvider {
    readonly name = 'MemoryProvider';
    readonly scheme = 'memory';
    readonly rootPath = '/';
    readonly capabilities = FileSystemCapability.FullAccess;

    private storage: Map<string, FileEntry>;

    constructor() {
        this.storage = new Map();
    }

    /**
     * 检查是否能处理指定路径
     */
    canHandle(path: string): boolean {
        return path.startsWith(`${this.scheme}://`);
    }

    /**
     * 打开目录
     */
    async openDirectory(path: string): Promise<void> {
        const entry = await this.getEntry(path);
        if (entry?.type !== 'directory') {
            throw new DirectoryNotFoundError(path);
        }
    }

    /**
     * 列出目录内容
     */
    async listFiles(path: string): Promise<FileStat[]> {
        const entry = await this.getEntry(path);

        if (!entry) {
            throw new DirectoryNotFoundError(path);
        }

        if (entry.type !== 'directory' || !entry.children) {
            throw new DirectoryNotFoundError(path);
        }

        const result: FileStat[] = [];
        for (const [name, child] of entry.children) {
            result.push({
                type: child.type,
                name,
                path: `${path}/${name}`.replace(/\/+/g, '/'),
                size: child.size,
                ctime: child.ctime,
                mtime: child.mtime,
            });
        }

        return result;
    }

    /**
     * 创建目录
     */
    async createDirectory(path: string): Promise<void> {
        const now = Date.now();
        const entry: FileEntry = {
            type: 'directory',
            name: this.getBasename(path),
            children: new Map(),
            size: 0,
            ctime: now,
            mtime: now,
        };

        await this.setEntry(path, entry);
    }

    /**
     * 删除目录
     */
    async deleteDirectory(path: string): Promise<void> {
        const entry = await this.getEntry(path);

        if (!entry) {
            throw new DirectoryNotFoundError(path);
        }

        if (entry.type !== 'directory') {
            throw new DirectoryNotFoundError(path);
        }

        await this.deleteEntry(path);
    }

    /**
     * 读取文件内容
     */
    async readFile(path: string): Promise<FileContent> {
        const entry = await this.getEntry(path);

        if (!entry) {
            throw new FileNotFoundError(path);
        }

        if (entry.type !== 'file') {
            throw new ReadFailedError(path, new Error('不是文件'));
        }

        if (entry.content === undefined) {
            throw new ReadFailedError(path, new Error('文件内容为空'));
        }

        return entry.content;
    }

    /**
     * 写入文件内容
     */
    async writeFile(path: string, content: FileContent): Promise<void> {
        const existingEntry = await this.getEntry(path);
        const now = Date.now();

        const entry: FileEntry = {
            type: 'file',
            name: this.getBasename(path),
            content,
            size: typeof content === 'string' ? content.length : content.length,
            ctime: existingEntry?.ctime ?? now,
            mtime: now,
        };

        await this.setEntry(path, entry);
    }

    /**
     * 删除文件
     */
    async deleteFile(path: string): Promise<void> {
        const entry = await this.getEntry(path);

        if (!entry) {
            throw new FileNotFoundError(path);
        }

        if (entry.type !== 'file') {
            throw new FileNotFoundError(path);
        }

        await this.deleteEntry(path);
    }

    /**
     * 获取文件句柄 - 内存 Provider 返回模拟句柄
     */
    async getFileHandle(
        _path: string,
        _mode: 'read' | 'readwrite',
    ): Promise<FileSystemFileHandle | FileSystemDirectoryHandle> {
        // 内存 Provider 不支持原生句柄，抛出错误
        throw new Error('MemoryProvider 不支持获取原生文件句柄');
    }

    /**
     * 获取文件统计信息
     */
    async stat(path: string): Promise<FileStat> {
        const entry = await this.getEntry(path);

        if (!entry) {
            throw new FileNotFoundError(path);
        }

        return {
            type: entry.type,
            name: entry.name,
            path,
            size: entry.size,
            ctime: entry.ctime,
            mtime: entry.mtime,
        };
    }

    /**
     * 重命名文件/目录
     */
    async rename(path: string, newName: string): Promise<void> {
        const entry = await this.getEntry(path);

        if (!entry) {
            throw new FileNotFoundError(path);
        }

        const normalized = this.normalizePath(path);
        const parts = normalized.split('/').filter(p => p !== '');
        const parentParts = parts.slice(0, parts.length - 1);

        // 获取父目录
        let parentMap = this.storage;
        for (const part of parentParts) {
            const dir = parentMap.get(part);
            if (!dir || dir.type !== 'directory' || !dir.children) {
                throw new DirectoryNotFoundError(
                    parts.slice(0, parentParts.indexOf(part) + 1).join('/'),
                );
            }
            parentMap = dir.children;
        }

        // 检查新名称是否已存在
        if (parentMap.has(newName)) {
            throw new FileAlreadyExistsError(newName);
        }

        // 更新名称
        entry.name = newName;
        entry.mtime = Date.now();

        // 在父目录中重新注册
        parentMap.set(newName, entry);
        parentMap.delete(parts[parts.length - 1]);
    }

    /**
     * 获取路径的最后一部分（文件名或目录名）
     */
    private getBasename(path: string): string {
        const parts = path.split('/').filter(p => p !== '');
        return parts[parts.length - 1] || '/';
    }

    /**
     * 获取文件条目
     */
    private async getEntry(path: string): Promise<FileEntry | undefined> {
        const normalized = this.normalizePath(path);
        const parts = normalized.split('/').filter(p => p !== '');

        let current: FileEntry | undefined;
        let currentMap = this.storage;

        for (const part of parts) {
            current = currentMap.get(part);
            if (!current) {
                return undefined;
            }

            if (current.children) {
                currentMap = current.children;
            } else {
                currentMap = new Map();
            }
        }

        return current;
    }

    /**
     * 设置文件条目
     */
    private async setEntry(path: string, entry: FileEntry): Promise<void> {
        const normalized = this.normalizePath(path);
        const parts = normalized.split('/').filter(p => p !== '');
        const name = parts[parts.length - 1];

        if (!name) {
            throw new Error('无效的路径');
        }

        let currentMap = this.storage;
        let parent: FileEntry | undefined;

        // 创建或获取父目录
        for (let i = 0; i < parts.length - 1; i++) {
            const part = parts[i];
            let dir = currentMap.get(part);

            if (!dir) {
                dir = {
                    type: 'directory',
                    name: part,
                    children: new Map(),
                    size: 0,
                    ctime: Date.now(),
                    mtime: Date.now(),
                };
                currentMap.set(part, dir);
            }

            if (dir.type !== 'directory' || !dir.children) {
                throw new Error(`路径中的 "${part}" 不是目录`);
            }

            parent = dir;
            currentMap = dir.children;
        }

        // 检查是否已存在
        const existing = currentMap.get(name);
        if (existing && entry.type === 'directory' && existing.type === 'file') {
            throw new FileAlreadyExistsError(path);
        }

        currentMap.set(name, entry);

        // 更新父目录的 mtime
        if (parent) {
            parent.mtime = Date.now();
        }
    }

    /**
     * 删除文件条目
     */
    private async deleteEntry(path: string): Promise<void> {
        const normalized = this.normalizePath(path);
        const parts = normalized.split('/').filter(p => p !== '');
        const name = parts[parts.length - 1];

        if (!name) {
            throw new Error('无效的路径');
        }

        let currentMap = this.storage;

        for (let i = 0; i < parts.length - 1; i++) {
            const part = parts[i];
            const dir = currentMap.get(part);

            if (!dir || dir.type !== 'directory' || !dir.children) {
                throw new DirectoryNotFoundError(path);
            }

            currentMap = dir.children;
        }

        if (!currentMap.has(name)) {
            throw new FileNotFoundError(path);
        }

        currentMap.delete(name);
    }

    /**
     * 规范化路径
     */
    private normalizePath(path: string): string {
        // 移除 scheme 前缀
        const withoutScheme = path.replace(/^memory:\/\//, '');
        // 规范化路径
        return withoutScheme.replace(/\/+/g, '/');
    }
}
