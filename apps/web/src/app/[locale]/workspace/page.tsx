'use client';

import { useEffect, useState } from 'react';
import { ProjectPicker, Welcome } from '@/components/project';
import { WorkspaceContent } from '@/components/workspace/workspace-content';
import { container } from '@/platform/bootstrap';
import { projectManager } from '@/platform/file-system/project-manager';
import { LoggerService } from '@/platform/logger/service';
import { useWorkspaceStore } from '@/stores/workspace-store';

const logger = container.get(LoggerService).getLogger('workspace');

export default function WorkspacePage() {
    const [showPicker, setShowPicker] = useState(false);
    const { project, setCurrentProject, setLoading, clearProject } = useWorkspaceStore();
    const [isClient, setIsClient] = useState(false);

    // 服务端渲染完成后标记
    useEffect(() => {
        setIsClient(true);
    }, []);

    // 初始化时尝试从持久化存储恢复项目状态
    useEffect(() => {
        if (!isClient) return;

        const stored = project.currentProject;
        // 句柄无法从持久化存储恢复，如果 rootHandle 为 null 则清除项目状态
        if (stored && !stored.rootHandle) {
            logger.info('检测到项目句柄失效，请重新选择目录');
            clearProject();
        }
    }, [isClient, clearProject, project.currentProject]);

    // 页面卸载时自动清理项目资源
    useEffect(() => {
        return () => {
            // 组件卸载时清理项目资源
            projectManager.dispose();
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // 处理项目选择
    const handleProjectSelected = async (handle: FileSystemDirectoryHandle) => {
        setLoading(true);
        try {
            const projectInfo = await projectManager.openProject(handle);
            setCurrentProject(projectInfo);
        } catch (error) {
            logger.error('打开项目失败:', error);
            throw error;
        } finally {
            setLoading(false);
        }
    };

    // 处理打开项目按钮点击
    const handleOpenProject = () => {
        setShowPicker(true);
    };

    // 客户端渲染期间显示加载状态
    if (!isClient) {
        return (
            <div className="flex h-screen w-full items-center justify-center bg-ws-bg-primary">
                <div className="text-ws-text-muted">加载中...</div>
            </div>
        );
    }

    // 根据项目状态决定显示欢迎页还是工作区
    // 注意：rootHandle 无法持久化，刷新后为 null，需要重新选择
    if (!project.isOpen || !project.currentProject || !project.currentProject.rootHandle) {
        return (
            <>
                <Welcome onOpenProject={handleOpenProject} />
                <ProjectPicker
                    open={showPicker}
                    onClose={() => setShowPicker(false)}
                    onProjectSelected={handleProjectSelected}
                />
            </>
        );
    }

    // 有打开的项目时显示工作区
    return <WorkspaceContent />;
}
