/**
 * 核心文件管理服务
 * 提供打开、读取、写入文件等完整的文件系统 API
 *
 * 基于适配器模式实现跨平台支持
 * 使用 DisposableStore 管理依赖服务的生命周期
 */
import { Disposable } from '../../../base/common/lifecycle';
import type { IFileSystemAdapter } from '../adapter/types';
import { FileHandleCache } from '../cache/file-handle-cache';
import { FileResourceManager } from '../manager/file-resource-manager';
import {
    type DirectoryEntry,
    type FileInfo,
    FileNotFoundError,
    type FileReadResult,
    PermissionDeniedError,
    type ProjectInfo,
    ProjectNotOpenError,
} from '../types';

/**
 * 生成项目 ID
 */
function generateProjectId(): string {
    return `project_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * 规范化路径，移除前导斜杠和末尾斜杠
 */
function normalizePath(path: string): string {
    return path.replace(/^\/+|\/+$/g, '');
}

export class FileSystemService extends Disposable {
    private readonly _handleCache: FileHandleCache;
    private readonly _resourceManager: FileResourceManager;
    private _currentProject: ProjectInfo | null = null;
    private _adapter: IFileSystemAdapter | null = null;

    constructor(adapter?: IFileSystemAdapter) {
        super();
        this._adapter = adapter ?? null;
        this._handleCache = this._register(new FileHandleCache());
        this._resourceManager = this._register(FileResourceManager.getInstance());
    }

    /**
     * 设置适配器
     * 可以在运行时切换适配器
     */
    setAdapter(adapter: IFileSystemAdapter): void {
        this._adapter = adapter;
    }

    /**
     * 获取当前使用的适配器
     */
    get adapter(): IFileSystemAdapter | null {
        return this._adapter;
    }

    /**
     * 获取当前打开的项目
     */
    get currentProject(): ProjectInfo | null {
        return this._currentProject;
    }

    /**
     * 打开项目目录
     * 通过文件选择器让用户选择一个文件夹作为项目根目录
     */
    async openProject(): Promise<ProjectInfo> {
        if (!this._adapter) {
            throw new Error('No adapter set. Use constructor or setAdapter to provide an adapter.');
        }

        try {
            const dirName = await this._adapter.openDirectoryPicker({ mode: 'readwrite' });

            if (!dirName) {
                throw new PermissionDeniedError('User cancelled directory selection');
            }

            const projectId = generateProjectId();

            // 创建项目信息
            this._currentProject = {
                id: projectId,
                name: dirName,
                openedAt: new Date(),
            };

            return this._currentProject;
        } catch (error) {
            if ((error as DOMException).name === 'AbortError') {
                throw new PermissionDeniedError('User cancelled directory selection');
            }
            throw error;
        }
    }

    /**
     * 关闭当前项目并清理资源
     */
    async closeProject(): Promise<void> {
        if (!this._currentProject) {
            return;
        }

        const projectId = this._currentProject.id;

        // 清理项目相关的缓存句柄
        await this._handleCache.clearProject(projectId);

        // 释放项目相关资源
        this._resourceManager.dispose();

        this._currentProject = null;
    }

    /**
     * 读取文件内容
     * @param relativePath - 文件相对于项目根目录的路径
     */
    async readFile(relativePath: string): Promise<FileReadResult> {
        if (!this._adapter) {
            throw new ProjectNotOpenError();
        }

        try {
            const result = await this._adapter.readFile(normalizePath(relativePath));
            // 将 Uint8Array 转换为 ArrayBuffer 以保持类型兼容
            let content: string | ArrayBuffer;
            if (typeof result.content === 'string') {
                content = result.content;
            } else {
                // Uint8Array -> ArrayBuffer
                content = result.content.buffer as ArrayBuffer;
            }
            return {
                content,
                fileInfo: {
                    name: result.fileInfo.name,
                    kind: result.fileInfo.kind,
                    size: result.fileInfo.size,
                    lastModified: result.fileInfo.lastModified
                        ? new Date(result.fileInfo.lastModified)
                        : undefined,
                    relativePath: normalizePath(relativePath),
                },
            };
        } catch (error) {
            if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
                throw new FileNotFoundError(relativePath);
            }
            if (error instanceof Error && error.message.includes('not found')) {
                throw new FileNotFoundError(relativePath);
            }
            throw error;
        }
    }

    /**
     * 写入文件内容
     * @param relativePath - 文件相对于项目根目录的路径
     * @param content - 要写入的内容
     */
    async writeFile(relativePath: string, content: string | ArrayBuffer): Promise<void> {
        if (!this._adapter) {
            throw new ProjectNotOpenError();
        }

        const normalizedContent = typeof content === 'string' ? content : new Uint8Array(content);
        await this._adapter.writeFile(normalizePath(relativePath), normalizedContent);
    }

    /**
     * 列出目录内容
     * @param relativePath - 目录相对于项目根目录的路径，空字符串表示根目录
     */
    async listDirectory(relativePath = ''): Promise<DirectoryEntry[]> {
        if (!this._adapter) {
            throw new ProjectNotOpenError();
        }

        const entries = await this._adapter.listDirectory(normalizePath(relativePath));
        return entries.map(entry => ({
            name: entry.name,
            kind: entry.kind,
            path: entry.path,
        }));
    }

    /**
     * 获取文件信息
     * @param relativePath - 文件相对于项目根目录的路径
     */
    async getFileInfo(relativePath: string): Promise<FileInfo> {
        if (!this._adapter) {
            throw new ProjectNotOpenError();
        }

        try {
            const info = await this._adapter.getFileInfo(normalizePath(relativePath));
            return {
                name: info.name,
                kind: info.kind,
                size: info.size,
                lastModified: info.lastModified ? new Date(info.lastModified) : undefined,
                relativePath: normalizePath(relativePath),
            };
        } catch {
            throw new FileNotFoundError(relativePath);
        }
    }

    /**
     * 删除文件或目录
     * @param relativePath - 文件/目录相对于项目根目录的路径
     * @param options - 删除选项
     */
    async remove(relativePath: string, options?: { recursive?: boolean }): Promise<void> {
        if (!this._adapter) {
            throw new ProjectNotOpenError();
        }

        await this._adapter.remove(normalizePath(relativePath), options);
    }

    /**
     * 检查文件/目录是否存在
     * @param relativePath - 文件/目录相对于项目根目录的路径
     */
    async exists(relativePath: string): Promise<boolean> {
        if (!this._adapter) {
            return false;
        }

        return this._adapter.exists(normalizePath(relativePath));
    }

    /**
     * 创建目录（递归）
     * @param relativePath - 目录相对于项目根目录的路径
     */
    async createDirectory(relativePath: string): Promise<void> {
        if (!this._adapter) {
            throw new ProjectNotOpenError();
        }

        await this._adapter.createDirectory(normalizePath(relativePath));
    }

    /**
     * 释放资源
     */
    override dispose(): void {
        // 先关闭项目
        this.closeProject().catch(console.error);
        super.dispose();
    }
}
