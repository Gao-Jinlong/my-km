'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RecentProject } from '@/lib/types/project';
import { formatRelativeTime } from '@/lib/utils/time';
import { removeRecentProject } from '@/lib/storage/project-storage';

interface ProjectCardProps {
  project: RecentProject;
  locale: string;
  onOpen: (project: RecentProject) => void;
  onRemoved?: () => void;
}

export function ProjectCard({ project, locale, onOpen, onRemoved }: ProjectCardProps) {
  const t = useTranslations('projects.card');
  const [isHovered, setIsHovered] = useState(false);

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm(t('removeConfirm'))) {
      removeRecentProject(project.id);
      onRemoved?.();
    }
  };

  const formatTime = (dateString: string) => {
    return formatRelativeTime(dateString, locale);
  };

  return (
    <Card
      className={`
        group relative p-4 cursor-pointer transition-all
        hover:border-primary hover:shadow-md
        ${isHovered ? 'translate-y-[-4px]' : ''}
      `}
      onClick={() => onOpen(project)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* 删除按钮 */}
      <Button
        variant="ghost"
        size="sm"
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={handleRemove}
      >
        ✕
      </Button>

      {/* 图标 */}
      <div className="text-4xl mb-2">
        {project.icon || '📁'}
      </div>

      {/* 项目名称 */}
      <h3 className="font-semibold text-lg mb-1">
        {project.name}
      </h3>

      {/* 项目描述 */}
      {project.description && (
        <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
          {project.description}
        </p>
      )}

      {/* 最后打开时间 */}
      <p className="text-xs text-muted-foreground">
        {t('lastOpened', { time: formatTime(project.lastOpened) })}
      </p>
    </Card>
  );
}
