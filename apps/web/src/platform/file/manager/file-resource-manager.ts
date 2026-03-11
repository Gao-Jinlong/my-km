import { Disposable, DisposableStore } from '../../../base/common/lifecycle';
import type { FileResource } from '../types';

/**
 * 文件资源管理器单例
 * 负责跟踪和管理全局的活动文件资源
 *
 * 使用单例模式确保全局只有一个资源管理器实例
 */
export class FileResourceManager extends Disposable {
    private static _instance: FileResourceManager | null = null;

    /**
     * 获取单例实例
     */
    static getInstance(): FileResourceManager {
        if (!FileResourceManager._instance) {
            FileResourceManager._instance = new FileResourceManager();
        }
        return FileResourceManager._instance;
    }

    /**
     * 重置单例实例（用于测试）
     */
    static resetInstance(): void {
        if (FileResourceManager._instance) {
            FileResourceManager._instance.dispose();
            FileResourceManager._instance = null;
        }
    }

    private readonly _resources: Map<string, FileResource> = new Map();
    private readonly _resourceDisposables: Map<string, DisposableStore> = new Map();

    /**
     * 私有构造函数，防止外部直接创建实例
     */
    private constructor() {
        super();
    }

    /**
     * 注册活动文件资源
     * @param resource - 要注册的文件资源
     */
    register(resource: FileResource): void {
        if (this._resources.has(resource.id)) {
            // 资源已存在，更新状态
            const existingResource = this._resources.get(resource.id)!;
            existingResource.isActive = true;
            return;
        }

        // 创建新的资源记录
        const newResource: FileResource = {
            ...resource,
            isActive: true,
        };

        this._resources.set(resource.id, newResource);

        // 创建资源专属的 disposable store
        const disposableStore = new DisposableStore();
        this._resourceDisposables.set(resource.id, disposableStore);
        this._store.add(disposableStore);
    }

    /**
     * 注销文件资源
     * @param resourceOrId - 文件资源或资源 ID
     */
    unregister(resourceOrId: FileResource | string): void {
        const resourceId = typeof resourceOrId === 'string' ? resourceOrId : resourceOrId.id;

        const resource = this._resources.get(resourceId);
        if (!resource) {
            return;
        }

        // 标记为非活动
        resource.isActive = false;
    }

    /**
     * 获取活动文件列表
     * @returns 所有活动文件资源
     */
    getActiveFiles(): FileResource[] {
        const activeFiles: FileResource[] = [];

        for (const resource of this._resources.values()) {
            if (resource.isActive) {
                activeFiles.push({ ...resource });
            }
        }

        return activeFiles;
    }

    /**
     * 检查资源是否已打开
     * @param resourceId - 资源 ID
     * @returns 资源是否存在且处于活动状态
     */
    isResourceActive(resourceId: string): boolean {
        const resource = this._resources.get(resourceId);
        return resource !== undefined && resource.isActive;
    }

    /**
     * 获取所有已注册的资源
     * @returns 所有资源
     */
    getAllResources(): FileResource[] {
        return Array.from(this._resources.values());
    }

    /**
     * 释放指定资源
     * @param resourceId - 资源 ID
     */
    releaseResource(resourceId: string): void {
        const disposableStore = this._resourceDisposables.get(resourceId);
        if (disposableStore) {
            disposableStore.dispose();
            this._resourceDisposables.delete(resourceId);
        }

        this._resources.delete(resourceId);
    }

    /**
     * 释放项目相关的所有资源
     * @param projectId - 项目 ID
     */
    releaseProjectResources(projectId: string): void {
        const resourcesToRelease: string[] = [];

        for (const [id, resource] of this._resources.entries()) {
            if (resource.path.startsWith(`${projectId}/`)) {
                resourcesToRelease.push(id);
            }
        }

        for (const resourceId of resourcesToRelease) {
            this.releaseResource(resourceId);
        }
    }

    /**
     * 获取活动资源数量
     */
    get activeResourceCount(): number {
        return Array.from(this._resources.values()).filter(r => r.isActive).length;
    }

    /**
     * 获取所有资源数量
     */
    get totalResourceCount(): number {
        return this._resources.size;
    }

    /**
     * 释放所有资源
     */
    override dispose(): void {
        // 释放所有资源的 disposable store
        for (const store of this._resourceDisposables.values()) {
            store.dispose();
        }
        this._resourceDisposables.clear();
        this._resources.clear();

        super.dispose();
    }
}
