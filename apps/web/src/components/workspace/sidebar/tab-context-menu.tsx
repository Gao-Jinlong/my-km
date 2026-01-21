'use client';

import { Trash2 } from 'lucide-react';
import { DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

interface TabContextMenuProps {
    tabId: string;
    canDelete: boolean;
    onDelete: (tabId: string) => void;
}

export function TabContextMenuContent({ tabId, canDelete, onDelete }: TabContextMenuProps) {
    const handleDelete = () => {
        if (canDelete) {
            onDelete(tabId);
        }
    };

    return (
        <DropdownMenuItem
            onClick={handleDelete}
            disabled={!canDelete}
            className={cn(!canDelete && 'cursor-not-allowed opacity-50')}
        >
            <Trash2 className="mr-2 h-4 w-4" />
            删除标签页
            {!canDelete && (
                <span className="ml-auto text-muted-foreground text-xs">(默认标签页)</span>
            )}
        </DropdownMenuItem>
    );
}

// 导出包装器,用于在外部触发上下文菜单
export function TabContextMenuWrapper({ children }: { children: React.ReactNode }) {
    return <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>;
}
