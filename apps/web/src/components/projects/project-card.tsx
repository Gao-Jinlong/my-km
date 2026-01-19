'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { removeRecentProject } from '@/lib/storage/project-storage';
import type { RecentProject } from '@/lib/types/project';
import { formatRelativeTime } from '@/lib/utils/time';

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
            className={`group relative cursor-pointer p-4 transition-all hover:border-primary hover:shadow-md ${isHovered ? 'translate-y-[-4px]' : ''}
      `}
            onClick={() => onOpen(project)}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            {/* 删除按钮 */}
            <Button
                variant="ghost"
                size="sm"
                className="absolute top-2 right-2 opacity-0 transition-opacity group-hover:opacity-100"
                onClick={handleRemove}
            >
                ✕
            </Button>

            {/* 图标 */}
            <div className="mb-2 text-4xl">{project.icon || '📁'}</div>

            {/* 项目名称 */}
            <h3 className="mb-1 font-semibold text-lg">{project.name}</h3>

            {/* 项目描述 */}
            {project.description && (
                <p className="mb-2 line-clamp-2 text-muted-foreground text-sm">
                    {project.description}
                </p>
            )}

            {/* 最后打开时间 */}
            <p className="text-muted-foreground text-xs">
                {t('lastOpened', { time: formatTime(project.lastOpened) })}
            </p>
        </Card>
    );
}
