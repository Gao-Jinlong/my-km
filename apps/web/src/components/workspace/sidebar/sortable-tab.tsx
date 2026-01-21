'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import * as LucideIcons from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SidebarTabConfig } from '@/types/workspace';

interface SortableTabProps {
    tab: SidebarTabConfig;
    isActive: boolean;
    onTabClick: (tabId: string) => void;
    onTabRightClick: (e: React.MouseEvent, tabId: string) => void;
}

export function SortableTab({ tab, isActive, onTabClick, onTabRightClick }: SortableTabProps) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: tab.id,
    });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
    };

    // 动态获取图标组件
    const IconComponent = (
        LucideIcons as unknown as Record<string, React.ComponentType<React.SVGProps<SVGSVGElement>>>
    )[tab.icon];

    return (
        <button
            ref={setNodeRef}
            style={style}
            {...attributes}
            {...listeners}
            type="button"
            onClick={() => onTabClick(tab.id)}
            onContextMenu={e => onTabRightClick(e, tab.id)}
            className={cn(
                'relative flex flex-1 items-center justify-center gap-2 px-4 py-3 font-medium text-sm transition-colors',
                isActive
                    ? 'border-primary border-b-2 text-foreground'
                    : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
                isDragging && 'cursor-grabbing',
            )}
            aria-label={`标签页: ${tab.label}`}
            aria-selected={isActive}
            role="tab"
            tabIndex={isActive ? 0 : -1}
        >
            {IconComponent && <IconComponent className="h-4 w-4" />}
            <span className="text-xs">{tab.label}</span>
        </button>
    );
}
