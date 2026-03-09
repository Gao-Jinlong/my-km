'use client';

import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { isFileSystemAPISupported, openFolderPicker } from '@/base/broswer/api';

import { CreateProjectDialog } from '@/components/projects/create-project-dialog';
import { ProjectCard } from '@/components/projects/project-card';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
    addRecentProject,
    clearRecentProjects,
    getRecentProjects,
} from '@/lib/storage/project-storage';
import type { RecentProject } from '@/lib/types/project';

export default function ProjectsPage() {
    const selectorT = useTranslations('projects.selector');
    const locale = useLocale();
    const router = useRouter();

    const [recentProjects, setRecentProjects] = useState<RecentProject[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showCreateDialog, setShowCreateDialog] = useState(false);

    // 加载最近项目
    useEffect(() => {
        const projects = getRecentProjects();
        setRecentProjects(projects);
        setIsLoading(false);
    }, []);

    // 打开现有项目
    const handleOpenProject = async (project: RecentProject) => {
        try {
            if (!isFileSystemAPISupported()) {
                alert(selectorT('unsupportedBrowser'));
                return;
            }

            // 打开文件夹
            const handle = await openFolderPicker({
                mode: 'readwrite',
                id: project.id,
            });
            if (!handle) return; // 用户取消

            // 直接进入工作空间，不验证 .my-km
            // 创建基本项目信息
            const projectInfo: RecentProject = {
                id: project.id || `project-${Date.now()}`,
                name: handle.name, // 使用文件夹名称作为项目名
                description: project.description || '',
                path: handle.name,
                lastOpened: new Date().toISOString(),
            };

            // 保存到最近项目
            addRecentProject(projectInfo);

            // 保存 FileSystemHandle 以便后续使用
            // TODO: 将 handle 存储到 IndexedDB 或状态管理中

            // 直接进入工作空间
            router.push(`/${locale}/workspace`);
        } catch (error) {
            console.error('Failed to open project:', error);
            alert(
                `${selectorT('openFailed')}: ${error instanceof Error ? error.message : '未知错误'}`,
            );
        }
    };

    // 清除历史
    const handleClearHistory = () => {
        clearRecentProjects();
        setRecentProjects([]);
    };

    // 打开文件夹按钮处理
    const handleOpenFolder = async () => {
        try {
            const handle = await openFolderPicker();
            if (!handle) return; // 用户取消

            // 创建基本项目信息
            const projectInfo: RecentProject = {
                id: `project-${Date.now()}`,
                name: handle.name,
                path: handle.name,
                lastOpened: new Date().toISOString(),
            };

            // 保存到最近项目
            addRecentProject(projectInfo);

            // 保存 FileSystemHandle
            // TODO: 将 handle 存储到 IndexedDB 或状态管理中

            // 进入工作空间
            router.push(`/${locale}/workspace`);
        } catch (error) {
            console.error('Failed to open folder:', error);
            alert(
                `${selectorT('openFailed')}: ${error instanceof Error ? error.message : '未知错误'}`,
            );
        }
    };

    // 浏览器不支持提示
    if (!isFileSystemAPISupported()) {
        return (
            <div className="flex min-h-screen items-center justify-center p-4">
                <Alert variant="destructive" className="max-w-md">
                    <p>{selectorT('unsupportedBrowser')}</p>
                </Alert>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
            <div className="container mx-auto px-4 py-16">
                {/* 顶部标题 */}
                <div className="mb-12 animate-fade-in text-center">
                    <h1 className="mb-2 font-bold text-4xl">{selectorT('title')}</h1>
                    <p className="text-slate-600 dark:text-slate-400">{selectorT('subtitle')}</p>
                </div>

                {/* 操作按钮 */}
                <div className="mb-12 flex justify-center gap-4">
                    <Button size="lg" className="min-w-[200px] gap-2" onClick={handleOpenFolder}>
                        📁 {selectorT('openFolder')}
                    </Button>

                    <Button
                        size="lg"
                        variant="outline"
                        className="min-w-[200px] gap-2"
                        onClick={() => setShowCreateDialog(true)}
                    >
                        ➕ {selectorT('newProject')}
                    </Button>
                </div>

                {/* 最近项目 */}
                <div className="mx-auto max-w-4xl">
                    <div className="mb-4 flex items-center justify-between">
                        <h2 className="font-semibold text-2xl">{selectorT('recentProjects')}</h2>
                        {recentProjects.length > 0 && (
                            <Button
                                variant="ghost"
                                size="sm"
                                className="text-muted-foreground"
                                onClick={handleClearHistory}
                            >
                                {selectorT('clearHistory')}
                            </Button>
                        )}
                    </div>

                    {isLoading ? (
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                            {[1, 2, 3].map(num => (
                                <Card
                                    key={`loading-${num}`}
                                    className="h-20 animate-pulse rounded bg-muted p-4"
                                />
                            ))}
                        </div>
                    ) : recentProjects.length === 0 ? (
                        <Card className="p-12 text-center">
                            <p className="text-muted-foreground">{selectorT('noRecentProjects')}</p>
                        </Card>
                    ) : (
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                            {recentProjects.map(project => (
                                <ProjectCard
                                    key={project.id}
                                    project={project}
                                    locale={locale}
                                    onOpen={handleOpenProject}
                                    onRemoved={() => {
                                        setRecentProjects(getRecentProjects());
                                    }}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* 创建项目对话框 */}
            <CreateProjectDialog
                open={showCreateDialog}
                onOpenChange={setShowCreateDialog}
                onProjectCreated={() => {
                    setRecentProjects(getRecentProjects());
                    console.log('项目创建成功');
                }}
            />
        </div>
    );
}
