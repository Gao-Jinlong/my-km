'use client';

import { Bell, RefreshCw } from 'lucide-react';

export function StatusBar() {
    return (
        <div className="flex h-[22px] w-full shrink-0 items-center justify-between border-ws-border border-t bg-ws-bg-primary px-3 text-[11px] text-ws-fg-muted">
            {/* Left Section: Editor Status */}
            <div className="flex items-center gap-3">
                <RefreshCw className="h-3 w-3" />
                <span>第 1 行，第 1 列</span>
                <span>128 字</span>
            </div>

            {/* Right Section: File Info & Notifications */}
            <div className="flex items-center gap-4">
                <span>UTF-8</span>
                <span>Markdown</span>
                <Bell className="h-3.5 w-3.5 cursor-pointer text-ws-icon hover:text-ws-fg-primary" />
            </div>
        </div>
    );
}
