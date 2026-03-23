import { Disposable } from '../../base/common/lifecycle';
import type { ProjectInfo } from './project-types';
import { FileSystemAccessAPIProvider } from './providers/fs-access-provider';
import { fileSystemService } from './service';

const PROJECT_STORAGE_KEY = 'my-km-current-project';

/**
 * 项目管理器
 *
 * 负责项目打开/关闭/切换的生命周期管理
 */
export class ProjectManager extends Disposable {
    private currentProject: ProjectInfo | null = null;
    private provider: FileSystemAccessAPIProvider | null = null;

    /**
     * 检查是否有打开的项目
     */
    hasOpenProject(): boolean {
        return this.currentProject !== null;
    }

    /**
     * 获取当前项目信息
     */
    getCurrentProject(): ProjectInfo | null {
        return this.currentProject;
    }

    /**
     * 打开项目
     *
     * @param directoryHandle - 目录句柄
     */
    async openProject(directoryHandle: FileSystemDirectoryHandle): Promise<ProjectInfo> {
        // 如果已有打开的项目，先关闭
        if (this.currentProject) {
            await this.closeProject();
        }

        // 创建并注册 Provider
        this.provider = new FileSystemAccessAPIProvider();
        this.provider.setDirectoryHandle(directoryHandle);
        fileSystemService.registerProvider(this.provider);

        // 创建项目信息
        const projectName = directoryHandle.name;
        const projectId = `project-${Date.now()}-${projectName}`;

        this.currentProject = {
            id: projectId,
            name: projectName,
            rootHandle: directoryHandle,
            openedAt: Date.now(),
        };

        // 持久化项目信息 (只保存元数据，句柄无法序列化)
        this.persistProjectInfo(this.currentProject);

        return this.currentProject;
    }

    /**
     * 关闭项目
     */
    async closeProject(): Promise<void> {
        if (!this.currentProject) {
            return;
        }

        // 清理 Provider 缓存
        if (this.provider) {
            this.provider.dispose();
            this.provider = null;
        }

        // 重置项目状态
        this.currentProject = null;

        // 清除持久化存储
        this.clearPersistedProjectInfo();
    }

    /**
     * 从持久化存储恢复项目
     *
     * 注意：由于 FileSystemDirectoryHandle 无法序列化存储，
     * 页面刷新后需要用户重新选择项目目录
     */
    async restoreFromPersist(): Promise<ProjectInfo | null> {
        const stored = localStorage.getItem(PROJECT_STORAGE_KEY);
        if (!stored) {
            return null;
        }

        try {
            const parsed = JSON.parse(stored) as Omit<ProjectInfo, 'rootHandle'>;
            // 句柄无法恢复，需要用户重新选择
            // 这里只恢复元数据信息
            this.currentProject = {
                ...parsed,
                rootHandle: null,
            };
            return this.currentProject;
        } catch {
            this.clearPersistedProjectInfo();
            return null;
        }
    }

    /**
     * 持久化项目信息
     */
    private persistProjectInfo(project: ProjectInfo): void {
        const { rootHandle, ...serializable } = project;
        localStorage.setItem(PROJECT_STORAGE_KEY, JSON.stringify(serializable));
    }

    /**
     * 清除持久化的项目信息
     */
    private clearPersistedProjectInfo(): void {
        localStorage.removeItem(PROJECT_STORAGE_KEY);
    }

    override dispose(): void {
        this.closeProject();
        super.dispose();
    }
}

/**
 * 项目管理器单例
 */
export const projectManager = new ProjectManager();
