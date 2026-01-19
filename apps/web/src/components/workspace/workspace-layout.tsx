'use client';

import { Group, Panel, Separator } from 'react-resizable-panels';
import { PANEL_SIZES } from '@/lib/workspace/constants';
import { AIPanel } from './ai-panel/ai-panel';
import { EditorArea } from './editor/editor-area';
import { Sidebar } from './sidebar/sidebar';

export function WorkspaceLayout() {
    return (
        <div className="h-screen w-full">
            <Group orientation="horizontal">
                {/* Left Sidebar */}
                <Panel
                    defaultSize={PANEL_SIZES.SIDEBAR.DEFAULT}
                    minSize={PANEL_SIZES.SIDEBAR.MIN}
                    maxSize={PANEL_SIZES.SIDEBAR.MAX}
                    collapsible={true}
                    collapsedSize={PANEL_SIZES.SIDEBAR.COLLAPSED}
                >
                    <Sidebar />
                </Panel>

                <Separator className="w-1 bg-border transition-colors hover:bg-primary/50" />

                {/* Editor Area */}
                <Panel defaultSize={PANEL_SIZES.EDITOR.DEFAULT} minSize={PANEL_SIZES.EDITOR.MIN}>
                    <EditorArea />
                </Panel>

                <Separator className="w-1 bg-border transition-colors hover:bg-primary/50" />

                {/* Right AI Panel */}
                <Panel
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
    );
}
