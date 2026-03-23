import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectManager } from '../project-manager';
import { fileSystemService } from '../service';

// Mock FileSystemDirectoryHandle
const createMockDirectoryHandle = (name = 'test-project') =>
    ({
        name,
        kind: 'directory',
        getFileHandle: vi.fn(),
        getDirectoryHandle: vi.fn(),
        removeEntry: vi.fn(),
        resolve: vi.fn(),
        values: vi.fn().mockReturnValue([]),
        entries: vi.fn(),
    }) as unknown as FileSystemDirectoryHandle;

describe('ProjectManager', () => {
    let manager: ProjectManager;

    beforeEach(() => {
        // 创建新的 manager 实例，避免状态污染
        manager = new ProjectManager();
        vi.clearAllMocks();
        // 清理 localStorage 避免测试污染
        localStorage.removeItem('my-km-current-project');
    });

    describe('hasOpenProject', () => {
        it('初始状态应该返回 false', () => {
            expect(manager.hasOpenProject()).toBe(false);
        });

        it('打开项目后应该返回 true', async () => {
            const mockHandle = createMockDirectoryHandle('test-project');
            await manager.openProject(mockHandle);
            expect(manager.hasOpenProject()).toBe(true);
        });

        it('关闭项目后应该返回 false', async () => {
            const mockHandle = createMockDirectoryHandle('test-project');
            await manager.openProject(mockHandle);
            await manager.closeProject();
            expect(manager.hasOpenProject()).toBe(false);
        });
    });

    describe('getCurrentProject', () => {
        it('初始状态应该返回 null', () => {
            expect(manager.getCurrentProject()).toBeNull();
        });

        it('打开项目后应该返回项目信息', async () => {
            const mockHandle = createMockDirectoryHandle('my-project');
            const _project = await manager.openProject(mockHandle);

            const current = manager.getCurrentProject();
            expect(current).not.toBeNull();
            expect(current?.name).toBe('my-project');
            expect(current?.id).toBeDefined();
        });

        it('关闭项目后应该返回 null', async () => {
            const mockHandle = createMockDirectoryHandle('test-project');
            await manager.openProject(mockHandle);
            await manager.closeProject();
            expect(manager.getCurrentProject()).toBeNull();
        });
    });

    describe('openProject', () => {
        it('应该成功打开项目', async () => {
            const mockHandle = createMockDirectoryHandle('test-project');
            const project = await manager.openProject(mockHandle);

            expect(project.name).toBe('test-project');
            expect(project.rootHandle).toBe(mockHandle);
            expect(project.openedAt).toBeDefined();
        });

        it('应该注册 Provider', async () => {
            const mockHandle = createMockDirectoryHandle('test-project');
            await manager.openProject(mockHandle);

            const providers = fileSystemService.getRegisteredProviders();
            expect(providers.some(p => p.scheme === 'file')).toBe(true);
        });

        it('打开新项目时应该先关闭旧项目', async () => {
            const mockHandle1 = createMockDirectoryHandle('project-1');
            const mockHandle2 = createMockDirectoryHandle('project-2');

            await manager.openProject(mockHandle1);
            const project1 = manager.getCurrentProject();

            await manager.openProject(mockHandle2);
            const project2 = manager.getCurrentProject();

            expect(project1?.name).toBe('project-1');
            expect(project2?.name).toBe('project-2');
        });
    });

    describe('closeProject', () => {
        it('应该关闭当前项目', async () => {
            const mockHandle = createMockDirectoryHandle('test-project');
            await manager.openProject(mockHandle);
            await manager.closeProject();

            expect(manager.hasOpenProject()).toBe(false);
        });

        it('应该清理持久化存储', async () => {
            const mockHandle = createMockDirectoryHandle('test-project');
            await manager.openProject(mockHandle);
            await manager.closeProject();

            // 检查 localStorage 是否被清理
            expect(localStorage.getItem('my-km-current-project')).toBeNull();
        });

        it('在没有打开项目时应该静默返回', async () => {
            expect(() => manager.closeProject()).not.toThrow();
        });
    });

    describe('restoreFromPersist', () => {
        it('应该从 localStorage 恢复项目元数据', async () => {
            // 模拟已存储的项目信息
            const mockProject = {
                id: 'test-id',
                name: 'restored-project',
                openedAt: Date.now(),
            };
            localStorage.setItem('my-km-current-project', JSON.stringify(mockProject));

            const restored = await manager.restoreFromPersist();

            expect(restored).not.toBeNull();
            expect(restored?.name).toBe('restored-project');
            expect(restored?.rootHandle).toBeNull(); // 句柄无法恢复
        });

        it('在没有存储数据时应该返回 null', async () => {
            const restored = await manager.restoreFromPersist();
            expect(restored).toBeNull();
        });

        it('在数据损坏时应该清理存储并返回 null', async () => {
            localStorage.setItem('my-km-current-project', 'invalid-json');

            const restored = await manager.restoreFromPersist();

            expect(restored).toBeNull();
            expect(localStorage.getItem('my-km-current-project')).toBeNull();
        });
    });

    describe('dispose', () => {
        it('应该关闭项目并清理资源', async () => {
            const mockHandle = createMockDirectoryHandle('test-project');
            await manager.openProject(mockHandle);

            manager.dispose();

            expect(manager.hasOpenProject()).toBe(false);
        });
    });
});
