'use client';

import { Bell } from 'lucide-react';
import { useEditorTabs } from '@/platform/editor-tab/use-editor-tabs';
import { useStatusBarState } from '@/stores/status-bar-store';

export function StatusBar() {
    const { activeDocumentId } = useEditorTabs();
    const statusBar = useStatusBarState(activeDocumentId);

    return (
        <div className="flex h-[22px] w-full shrink-0 items-center justify-between border-ws-border border-t bg-ws-bg-primary px-3 text-[11px] text-ws-fg-muted">
            {/* Left Section: Editor Status */}
            <div className="flex items-center gap-3">
                <span>
                    第 {statusBar?.cursorLine ?? 1} 行，第 {statusBar?.cursorCol ?? 1} 列
                </span>
                <span>{statusBar?.charCount ?? 0} 字</span>
            </div>

            {/* Right Section: File Info & Notifications */}
            <div className="flex items-center gap-4">
                <span>UTF-8</span>
                <span>.km</span>
                <Bell className="h-3.5 w-3.5 cursor-pointer text-ws-icon hover:text-ws-fg-primary" />
            </div>
        </div>
    );
}
