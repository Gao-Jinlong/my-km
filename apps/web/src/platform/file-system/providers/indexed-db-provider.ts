import { IFileSystemProvider } from '../provider';
import { FileStat, FileContent, FileSystemCapability } from '../types';
import {
    FileNotFoundError,
    DirectoryNotFoundError,
    ReadFailedError,
    WriteFailedError,
} from '../errors';
import { Disposable } from '../../../base/common/lifecycle';

/**
 * IndexedDB 请求超时时间（毫秒）
 */
const IDB_TIMEOUT = 10000;

/**
 * 数据库名称
 */
const DB_NAME = 'file-system-db';

/**
 * 数据库版本
 */
const DB_VERSION = 1;

/**
 * 存储对象名称
 */
const STORE_NAME = 'file-handles';

/**
 * 文件句柄条目
 */
interface HandleEntry {
    key: string;
    handle: FileSystemHandle;
    path: string;
    projectId?: string;
    ctime: number;
    mtime: number;
}

/**
 * IndexedDB Provider - 浏览器持久化存储
 *
 * 使用 IndexedDB 存储文件句柄，支持项目维度的数据隔离
 */
export class IndexedDBProvider extends Disposable implements IFileSystemProvider {
    readonly name = 'IndexedDBProvider';
    readonly scheme = 'idb';
    readonly rootPath = '/';
    readonly capabilities = FileSystemCapability.FullAccess;

    private dbPromise: Promise<IDBDatabase> | null = null;
    private db: IDBDatabase | null = null;

    /**
     * 初始化数据库连接
     */
    private async initDB(): Promise<IDBDatabase> {
        if (this.db) {
            return this.db;
        }

        if (this.dbPromise) {
            return this.dbPromise;
        }

        this.dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = () => reject(new Error('无法打开 IndexedDB'));
            request.onsuccess = () => {
                this.db = request.result;
                resolve(request.result);
            };

            request.onupgradeneeded = (event) => {
                const db = (event.target as IDBOpenDBRequest).result;

                // 创建存储对象
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    const store = db.createObjectStore(STORE_NAME, { keyPath: 'key' });
                    store.createIndex('path', 'path', { unique: false });
                    store.createIndex('projectId', 'projectId', { unique: false });
                }
            };

            // 设置超时
            setTimeout(() => {
                reject(new Error('IndexedDB 打开超时'));
            }, IDB_TIMEOUT);
        });

        return this.dbPromise;
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
    async openDirectory(_path: string): Promise<void> {
        await this.initDB();
        // IndexedDB Provider 主要存储句柄，打开目录操作由上层服务处理
    }

    /**
     * 列出目录内容
     */
    async listFiles(path: string): Promise<FileStat[]> {
        const db = await this.initDB();

        return new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const index = store.index('path');

            const results: FileStat[] = [];
            const request = index.openCursor();

            request.onsuccess = (event) => {
                const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
                if (cursor) {
                    const entry = cursor.value as HandleEntry;
                    if (entry.path.startsWith(path)) {
                        results.push({
                            type: entry.handle.kind as 'file' | 'directory',
                            name: entry.handle.name,
                            path: entry.path,
                            size: 0,
                            ctime: entry.ctime,
                            mtime: entry.mtime,
                        });
                    }
                    cursor.continue();
                } else {
                    resolve(results);
                }
            };

            request.onerror = () => reject(new ReadFailedError(path));
        });
    }

    /**
     * 创建目录
     */
    async createDirectory(_path: string): Promise<void> {
        // IndexedDB Provider 不直接创建目录，目录结构由文件路径隐含
        await this.initDB();
    }

    /**
     * 删除目录
     */
    async deleteDirectory(path: string): Promise<void> {
        const db = await this.initDB();

        return new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const index = store.index('path');

            const keysToDelete: string[] = [];

            const request = index.openCursor();
            request.onsuccess = (event) => {
                const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
                if (cursor) {
                    const entry = cursor.value as HandleEntry;
                    if (entry.path.startsWith(path)) {
                        keysToDelete.push(entry.key);
                    }
                    cursor.continue();
                } else {
                    // 删除所有匹配的条目
                    let deleteCount = 0;
                    const deleteNext = () => {
                        if (deleteCount < keysToDelete.length) {
                            store.delete(keysToDelete[deleteCount]);
                            deleteCount++;
                            setTimeout(deleteNext, 0);
                        } else {
                            resolve();
                        }
                    };
                    deleteNext();
                }
            };

            request.onerror = () => reject(new DirectoryNotFoundError(path));
        });
    }

    /**
     * 读取文件内容
     */
    async readFile(path: string): Promise<FileContent> {
        const handle = await this.getFileHandle(path, 'read') as FileSystemFileHandle;

        try {
            const file = await handle.getFile();
            return await file.text();
        } catch (error) {
            throw new ReadFailedError(path, error as Error);
        }
    }

    /**
     * 写入文件内容
     */
    async writeFile(path: string, content: FileContent): Promise<void> {
        const handle = await this.getFileHandle(path, 'readwrite') as FileSystemFileHandle;

        try {
            const writable = await handle.createWritable();
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
        const db = await this.initDB();
        const key = this.makeKey(path);

        return new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, 'readwrite');
            const store = transaction.objectStore(STORE_NAME);

            const request = store.delete(key);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(new FileNotFoundError(path));
        });
    }

    /**
     * 获取文件句柄
     */
    async getFileHandle(path: string, _mode: 'read' | 'readwrite'): Promise<FileSystemFileHandle | FileSystemDirectoryHandle> {
        const db = await this.initDB();
        const key = this.makeKey(path);

        return new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.get(key);

            request.onsuccess = () => {
                const entry = request.result as HandleEntry | undefined;
                if (entry?.handle) {
                    resolve(entry.handle as FileSystemFileHandle | FileSystemDirectoryHandle);
                } else {
                    reject(new FileNotFoundError(path));
                }
            };

            request.onerror = () => reject(new FileNotFoundError(path));
        });
    }

    /**
     * 存储文件句柄
     */
    async storeHandle(path: string, handle: FileSystemHandle, projectId?: string): Promise<void> {
        const db = await this.initDB();
        const key = this.makeKey(path);
        const now = Date.now();

        return new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, 'readwrite');
            const store = transaction.objectStore(STORE_NAME);

            const entry: HandleEntry = {
                key,
                handle,
                path,
                projectId,
                ctime: now,
                mtime: now,
            };

            const request = store.put(entry);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(new WriteFailedError(path));
        });
    }

    /**
     * 获取文件统计信息
     */
    async stat(path: string): Promise<FileStat> {
        const handle = await this.getFileHandle(path, 'read');

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
     * 生成存储键
     */
    private makeKey(path: string): string {
        return `${this.scheme}://${path}`;
    }

    /**
     * 清理项目相关的所有句柄
     */
    async clearProject(projectId: string): Promise<void> {
        const db = await this.initDB();

        return new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const index = store.index('projectId');

            const request = index.getAllKeys(projectId);
            request.onsuccess = () => {
                const keys = request.result as string[];
                let deleteCount = 0;
                const deleteNext = () => {
                    if (deleteCount < keys.length) {
                        store.delete(keys[deleteCount]);
                        deleteCount++;
                        setTimeout(deleteNext, 0);
                    } else {
                        resolve();
                    }
                };
                deleteNext();
            };
            request.onerror = () => reject(new Error('清理项目句柄失败'));
        });
    }

    /**
     * 验证句柄是否仍然有效
     */
    async verifyHandle(handle: FileSystemHandle): Promise<boolean> {
        try {
            // 尝试查询权限状态
            const permission = await handle.queryPermission();
            return permission === 'granted';
        } catch {
            return false;
        }
    }

    override dispose(): void {
        if (this.db) {
            this.db.close();
            this.db = null;
        }
        super.dispose();
    }
}
