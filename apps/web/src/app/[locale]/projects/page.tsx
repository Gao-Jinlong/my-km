'use client';

import { useState, useEffect } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Alert } from '@/components/ui/alert';
import { ProjectCard } from '@/components/projects/project-card';
import { CreateProjectDialog } from '@/components/projects/create-project-dialog';
import { RecentProject } from '@/lib/types/project';
import { getRecentProjects, clearRecentProjects, addRecentProject } from '@/lib/storage/project-storage';
import { isFileSystemAPISupported, openFolderPicker, readProjectConfig, hasMyKmFolder } from '@/lib/filesystem/api';

export default function ProjectsPage() {
  const selectorT = useTranslations('projects.selector');
  const locale = useLocale();

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

      // 尝试打开文件夹
      const handle = await openFolderPicker();
      if (!handle) return; // 用户取消

      // 验证是否是正确的项目文件夹
      const hasMyKm = await hasMyKmFolder(handle);
      if (!hasMyKm) {
        alert('所选文件夹不是有效的 My-KM 项目');
        return;
      }

      // 读取项目配置
      const config = await readProjectConfig(handle);
      if (!config) {
        alert('无法读取项目配置文件');
        return;
      }

      // 更新最近项目
      addRecentProject({
        ...project,
        lastOpened: new Date().toISOString(),
      });

      // TODO: 进入工作区视图
      console.log('项目已打开:', config.name);

      // 路由跳转待实现
      // router.push(`/workspace/${project.id}`);
    } catch (error) {
      console.error('Failed to open project:', error);
      alert(`${selectorT('openFailed')}: ${error instanceof Error ? error.message : '未知错误'}`);
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
      if (handle) {
        console.log('文件夹已选择:', handle.name);
        // TODO: 处理打开文件夹逻辑
      }
    } catch (error) {
      console.error('Failed to open folder:', error);
    }
  };

  // 浏览器不支持提示
  if (!isFileSystemAPISupported()) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
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
        <div className="text-center mb-12 animate-fade-in">
          <h1 className="text-4xl font-bold mb-2">{selectorT('title')}</h1>
          <p className="text-slate-600 dark:text-slate-400">{selectorT('subtitle')}</p>
        </div>

        {/* 操作按钮 */}
        <div className="flex justify-center gap-4 mb-12">
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
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-semibold">{selectorT('recentProjects')}</h2>
            {recentProjects.length > 0 && (
              <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={handleClearHistory}>
                {selectorT('clearHistory')}
              </Button>
            )}
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3].map((num) => (
                <Card key={`loading-${num}`} className="bg-muted h-20 p-4 rounded animate-pulse" />
              ))}
            </div>
          ) : recentProjects.length === 0 ? (
            <Card className="p-12 text-center">
              <p className="text-muted-foreground">{selectorT('noRecentProjects')}</p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {recentProjects.map((project) => (
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
