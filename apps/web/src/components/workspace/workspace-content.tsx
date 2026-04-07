'use client';

import { useEffect, useRef } from 'react';
import { Group, Panel, Separator } from 'react-resizable-panels';
import { PANEL_SIZES } from '@/lib/workspace/constants';
import { container } from '@/platform/bootstrap';
import { DialogProvider } from '@/platform/dialog';
import { PanelService } from '@/platform/panel/service';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { AIPanel } from './ai-panel/ai-panel';
import { EditorArea } from './editor/editor-area';
import { ActivityBar } from './sidebar/activity-bar';
import { Sidebar } from './sidebar/sidebar';
import { StatusBar } from './status-bar';
import { TopNav } from './top-nav';

const LAYOUT_VERSION = '1.0.0';
const VERSION_KEY = 'workspace-layout-version';

export function WorkspaceContent() {
    const { sidebarCollapsed, setSidebarCollapsed } = useWorkspaceStore();
    const panelServiceRef = useRef<PanelService | null>(null);

    // 初始化面板服务
    useEffect(() => {
        const panelService = container.get(PanelService);
        panelServiceRef.current = panelService;

        // 注册侧边栏面板
        panelService.register('sidebar', {
            id: 'sidebar',
            collapsible: true,
            hideable: true,
            defaultSize: 20,
            minSize: 15,
            maxSize: 40,
            collapsedSize: 0,
        });

        // 注册 AI 面板
        panelService.register('ai-panel', {
            id: 'ai-panel',
            collapsible: true,
            hideable: true,
            defaultSize: 25,
            minSize: 20,
            maxSize: 45,
            collapsedSize: 4,
        });

        // 设置自动隐藏阈值为 10%
        panelService.setAutoHideThreshold(10);

        // 监听面板大小变化，实现自动隐藏
        const dispose = panelService.onDidChangeSize(({ id, size }) => {
            if (size < 10 && panelService.isExpanded(id)) {
                // 当面板缩小到 10% 以下时，自动隐藏
                panelService.hide(id);
                if (id === 'sidebar') {
                    setSidebarCollapsed(true);
                }
            }
        });

        return () => {
            dispose.dispose();
        };
    }, [setSidebarCollapsed]);

    // 处理面板大小变化
    const handleSidebarResize = (panelSize: import('react-resizable-panels').PanelSize) => {
        const size = typeof panelSize === 'number' ? panelSize : 0;
        panelServiceRef.current?.setSize('sidebar', size, true);
    };

    const handleAIPanelResize = (panelSize: import('react-resizable-panels').PanelSize) => {
        const size = typeof panelSize === 'number' ? panelSize : 0;
        panelServiceRef.current?.setSize('ai-panel', size, true);
    };

    // 一次性清理：如果版本不匹配，清除旧的 panel 布局数据
    useEffect(() => {
        if (typeof window === 'undefined') return;

        const currentVersion = localStorage.getItem(VERSION_KEY);
        if (currentVersion !== LAYOUT_VERSION) {
            // 清除所有 react-resizable-panels 相关的数据
            const keysToRemove: string[] = [];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key?.startsWith('react-resizable-panels:')) {
                    keysToRemove.push(key);
                }
            }
            keysToRemove.forEach(key => {
                localStorage.removeItem(key);
            });

            // 设置新版本号
            localStorage.setItem(VERSION_KEY, LAYOUT_VERSION);
            console.log(`已清理旧的布局数据并更新到版本 ${LAYOUT_VERSION}`);
        }
    }, []);

    return (
        <DialogProvider>
            <div className="flex h-screen w-full flex-col bg-ws-bg-primary">
                <TopNav />

                <div className="flex flex-1 overflow-hidden">
                    {/* Activity Bar - always visible, outside collapsible panel */}
                    <ActivityBar />

                    <div className="flex-1 overflow-hidden">
                        <Group orientation="horizontal">
                            {/* Left Sidebar Content */}
                            <Panel
                            id="sidebar-panel"
                            defaultSize={PANEL_SIZES.SIDEBAR.DEFAULT}
                            minSize={PANEL_SIZES.SIDEBAR.MIN}
                            maxSize={PANEL_SIZES.SIDEBAR.MAX}
                            collapsible={true}
                            collapsedSize={PANEL_SIZES.SIDEBAR.COLLAPSED}
                            onResize={handleSidebarResize}
                        >
                            <Sidebar collapsed={sidebarCollapsed} />
                        </Panel>

                        <Separator className="w-px bg-ws-border transition-colors hover:bg-ws-accent/50" />

                        {/* Editor Area */}
                        <Panel
                            id="editor-panel"
                            defaultSize={PANEL_SIZES.EDITOR.DEFAULT}
                            minSize={PANEL_SIZES.EDITOR.MIN}
                        >
                            <EditorArea />
                        </Panel>

                        <Separator className="w-px bg-ws-border transition-colors hover:bg-ws-accent/50" />

                        {/* Right AI Panel */}
                        <Panel
                            id="ai-panel"
                            defaultSize={PANEL_SIZES.AI_PANEL.DEFAULT}
                            minSize={PANEL_SIZES.AI_PANEL.MIN}
                            maxSize={PANEL_SIZES.AI_PANEL.MAX}
                            collapsible={true}
                            collapsedSize={PANEL_SIZES.AI_PANEL.COLLAPSED}
                            onResize={handleAIPanelResize}
                        >
                            <AIPanel />
                        </Panel>
                    </Group>
                    </div>
                </div>

                <StatusBar />
            </div>
        </DialogProvider>
    );
}
