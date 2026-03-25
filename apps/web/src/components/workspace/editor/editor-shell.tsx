import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

interface EditorShellProps {
    children: ReactNode;
    className?: string;
}

/**
 * EditorShell - 编辑器外壳组件
 *
 * 提供编辑器的基本容器结构
 * 负责边框、背景等视觉样式
 */
export function EditorShell({ children, className }: EditorShellProps) {
    return (
        <div className={cn('flex h-full w-full flex-col bg-ws-bg-secondary', className)}>
            {children}
        </div>
    );
}
