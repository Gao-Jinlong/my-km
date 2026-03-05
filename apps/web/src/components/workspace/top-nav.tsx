'use client';

import { BookOpen, PanelLeft, PanelRight, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useWorkspaceStore } from '@/stores/workspace-store';

export function TopNav() {
    // Assuming we have these in the store, otherwise we might need to add them or just mock for now
    const { toggleSidebar, toggleAIPanel } = useWorkspaceStore();

    return (
        <div className="flex h-12 w-full shrink-0 items-center justify-between border-ws-border border-b bg-ws-bg-primary px-4">
            {/* Left Section: Logo & Project Name */}
            <div className="flex items-center gap-2">
                <div className="flex items-center gap-2">
                    <BookOpen className="h-5 w-5 text-ws-accent" />
                    <span className="font-semibold text-[13px] text-ws-fg-primary">智能知识库</span>
                </div>
                <span className="text-[13px] text-ws-fg-muted">my-km-project</span>
            </div>

            {/* Right Section: Navigation Actions */}
            <div className="flex items-center gap-3">
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 bg-ws-bg-tertiary text-ws-icon hover:bg-ws-bg-secondary focus-visible:ring-0 focus-visible:ring-offset-0"
                    onClick={() => toggleSidebar()}
                    title="Toggle Sidebar"
                >
                    <PanelLeft className="h-[18px] w-[18px]" />
                </Button>

                <div className="h-4 w-[1px] bg-ws-border" />

                <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 bg-ws-bg-tertiary text-ws-icon hover:bg-ws-bg-secondary focus-visible:ring-0 focus-visible:ring-offset-0"
                    onClick={() => toggleAIPanel()}
                    title="Toggle AI Panel"
                >
                    <PanelRight className="h-[18px] w-[18px]" />
                </Button>

                <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 bg-ws-bg-tertiary text-ws-icon hover:bg-ws-bg-secondary focus-visible:ring-0 focus-visible:ring-offset-0"
                    title="Global Search"
                >
                    <Search className="h-[18px] w-[18px]" />
                </Button>
            </div>
        </div>
    );
}
