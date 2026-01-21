'use client';

import { DndContext, type DragEndEvent } from '@dnd-kit/core';
import { horizontalListSortingStrategy, SortableContext } from '@dnd-kit/sortable';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { DropdownMenu, DropdownMenuContent } from '@/components/ui/dropdown-menu';
import { SIDEBAR_CONSTANTS } from '@/lib/workspace/constants';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { SortableTab } from './sortable-tab';
import { TabContextMenuContent, TabContextMenuWrapper } from './tab-context-menu';

export function SidebarTabs() {
    const { sidebarTabs, sidebarActiveTab, setSidebarActiveTab, reorderTabs, removeTab } =
        useWorkspaceStore();

    // 右键菜单状态
    const [contextMenuTabId, setContextMenuTabId] = useState<string | null>(null);

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;

        const oldIndex = sidebarTabs.findIndex(tab => tab.id === active.id);
        const newIndex = sidebarTabs.findIndex(tab => tab.id === over.id);

        if (oldIndex !== -1 && newIndex !== -1) {
            const newTabIds = [...sidebarTabs.map(t => t.id)];
            newTabIds.splice(oldIndex, 1);
            newTabIds.splice(newIndex, 0, active.id as string);
            reorderTabs(newTabIds);
        }
    };

    const handleTabClick = (tabId: string) => {
        setSidebarActiveTab(tabId);
    };

    const handleTabRightClick = (e: React.MouseEvent, tabId: string) => {
        e.preventDefault();
        e.stopPropagation();
        setContextMenuTabId(tabId);
    };

    const handleDeleteTab = (tabId: string) => {
        removeTab(tabId);
        setContextMenuTabId(null);
    };

    const handleCloseContextMenu = () => {
        setContextMenuTabId(null);
    };

    return (
        <div
            className="flex items-center border-b px-2"
            style={{ height: `${SIDEBAR_CONSTANTS.TAB_HEIGHT}px` }}
        >
            <DndContext onDragEnd={handleDragEnd}>
                <SortableContext
                    items={sidebarTabs.map(t => t.id)}
                    strategy={horizontalListSortingStrategy}
                >
                    <div className="flex flex-1 items-center">
                        {sidebarTabs.map(tab => (
                            <DropdownMenu
                                key={tab.id}
                                open={contextMenuTabId === tab.id}
                                onOpenChange={open => {
                                    if (!open) handleCloseContextMenu();
                                }}
                            >
                                <TabContextMenuWrapper>
                                    <SortableTab
                                        tab={tab}
                                        isActive={sidebarActiveTab === tab.id}
                                        onTabClick={handleTabClick}
                                        onTabRightClick={handleTabRightClick}
                                    />
                                </TabContextMenuWrapper>
                                <DropdownMenuContent side="bottom" align="center">
                                    <TabContextMenuContent
                                        tabId={tab.id}
                                        tabLabel={tab.label}
                                        canDelete={tab.isDeletable}
                                        onDelete={handleDeleteTab}
                                    />
                                </DropdownMenuContent>
                            </DropdownMenu>
                        ))}
                    </div>
                </SortableContext>
            </DndContext>

            {/* 添加标签页按钮 (暂时作为占位符,阶段 5 实现) */}
            <button
                type="button"
                className="flex items-center justify-center rounded p-2 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
                aria-label="添加标签页"
                onClick={() => {
                    // TODO: 阶段 5 实现添加标签页对话框
                    console.log('添加标签页功能即将在阶段 5 实现');
                }}
            >
                <Plus className="h-4 w-4" />
            </button>
        </div>
    );
}
