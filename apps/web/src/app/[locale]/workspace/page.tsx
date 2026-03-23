'use client';

import { useEffect, useState } from 'react';
import { ProjectPicker, Welcome } from '@/components/project';
import { WorkspaceContent } from '@/components/workspace/workspace-content';
import { projectManager } from '@/platform/file-system/project-manager';
import { useWorkspaceStore } from '@/stores/workspace-store';

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

        const restoreProject = async () => {
            try {
                const stored = project.currentProject;
                if (stored) {
                    // 注意：句柄无法从持久化存储恢复，需要用户重新选择
                    // 这里只恢复元数据，实际使用时需要检查句柄是否有效
                    if (!project.isOpen) {
                        // 如果有存储的项目信息但未打开，提示用户重新选择
                        console.log('检测到未保存的项目，请重新选择目录');
                    }
                }
            } catch (error) {
                console.error('恢复项目状态失败:', error);
                clearProject();
            }
        };

        restoreProject();
    }, [isClient, clearProject, project.currentProject, project.isOpen]);

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
            console.error('打开项目失败:', error);
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
    if (!project.isOpen || !project.currentProject) {
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
