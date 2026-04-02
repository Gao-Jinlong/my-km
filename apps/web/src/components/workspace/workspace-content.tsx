'use client';

import { useEffect } from 'react';
import { Group, Panel, Separator } from 'react-resizable-panels';
import { PANEL_SIZES } from '@/lib/workspace/constants';
import { DialogProvider } from '@/platform/dialog';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { AIPanel } from './ai-panel/ai-panel';
import { EditorArea } from './editor/editor-area';
import { Sidebar } from './sidebar/sidebar';
import { StatusBar } from './status-bar';
import { TopNav } from './top-nav';

const LAYOUT_VERSION = '1.0.0';
const VERSION_KEY = 'workspace-layout-version';

export function WorkspaceContent() {
    const { sidebarCollapsed } = useWorkspaceStore();

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

                <div className="flex-1 overflow-hidden">
                    <Group orientation="horizontal">
                        {/* Left Sidebar */}
                        <Panel
                            id="sidebar-panel"
                            defaultSize={PANEL_SIZES.SIDEBAR.DEFAULT}
                            minSize={PANEL_SIZES.SIDEBAR.MIN}
                            maxSize={PANEL_SIZES.SIDEBAR.MAX}
                            collapsible={true}
                            collapsedSize={PANEL_SIZES.SIDEBAR.COLLAPSED}
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
                        >
                            <AIPanel />
                        </Panel>
                    </Group>
                </div>

                <StatusBar />
            </div>
        </DialogProvider>
    );
}
