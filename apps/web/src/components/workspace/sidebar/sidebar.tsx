'use client';

import { useCallback } from 'react';
import { useWorkspaceStore } from '@/stores/workspace-store';
import type { TabPanelState } from '@/types/workspace';
import { getPanelComponent, hasPanel } from './panels';
import { SidebarFooter } from './sidebar-footer';
import { SidebarTabs } from './sidebar-tabs';

interface SidebarProps {
    collapsed?: boolean;
}

export function Sidebar({ collapsed = false }: SidebarProps) {
    const { sidebarActiveTab, sidebarTabs, tabPanelStates, setTabPanelState } = useWorkspaceStore();

    // 获取当前激活的标签页配置
    const activeTab = sidebarTabs.find(t => t.id === sidebarActiveTab);

    // 获取当前面板状态
    const currentPanelState = tabPanelStates.get(sidebarActiveTab) as TabPanelState | undefined;

    // 处理面板状态变化
    const handleStateChange = useCallback(
        (newState: Partial<TabPanelState>) => {
            setTabPanelState(sidebarActiveTab, newState);
        },
        [sidebarActiveTab, setTabPanelState],
    );

    // 获取面板组件
    const PanelComponent = activeTab?.panelId ? getPanelComponent(activeTab.panelId) : null;

    return (
        <div className="flex h-full flex-col bg-muted">
            {/* Header / Tabs - 固定高度 48px */}
            {!collapsed && <SidebarTabs />}

            {/* Content Area - 可伸缩,支持滚动 */}
            <div className="flex-1 overflow-y-auto">
                {PanelComponent ? (
                    <PanelComponent state={currentPanelState} onStateChange={handleStateChange} />
                ) : activeTab?.panelId && !hasPanel(activeTab.panelId) ? (
                    // 面板尚未实现
                    <div className="flex h-full flex-col items-center justify-center p-4 text-center">
                        <p className="text-muted-foreground text-sm">
                            {activeTab.label} 面板即将推出
                        </p>
                    </div>
                ) : (
                    // 没有激活的面板
                    <div className="flex h-full flex-col items-center justify-center p-4 text-center">
                        <p className="text-muted-foreground text-sm">请选择一个标签页</p>
                    </div>
                )}
            </div>

            {/* Footer - 固定高度 56px */}
            {!collapsed && <SidebarFooter />}
        </div>
    );
}
