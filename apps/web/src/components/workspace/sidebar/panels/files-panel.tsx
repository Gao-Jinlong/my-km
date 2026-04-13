'use client';

import { Search } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { container } from '@/platform/bootstrap';
import type { EventBusService } from '@/platform/event-bus/service';
import { FileTree } from './file-tree';
import type { PanelComponentProps } from './index';

/**
 * 文件搜索聚焦事件类型
 */
const FILE_SEARCH_FOCUS_EVENT = 'file-search.focus';

export function FilesPanel({ state, onStateChange }: PanelComponentProps) {
    const expandedFolders = state?.expandedNodes ?? [];
    const selectedFile = state?.selectedFile ?? null;
    const [showSearch, setShowSearch] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const searchInputRef = useRef<HTMLInputElement>(null);
    const eventBusRef = useRef<EventBusService | null>(null);

    // 聚焦搜索框方法
    const focusSearch = useCallback(() => {
        setShowSearch(true);
        // 等待 DOM 更新后聚焦
        setTimeout(() => {
            searchInputRef.current?.focus();
        }, 0);
    }, []);

    // 订阅事件总线，响应外部快捷键触发
    useEffect(() => {
        const eventBus = container.get('EventBusService') as EventBusService;
        eventBusRef.current = eventBus;

        // 订阅文件搜索聚焦事件
        const subscription = eventBus.subscribe(FILE_SEARCH_FOCUS_EVENT, () => {
            focusSearch();
        });

        return () => {
            subscription.dispose();
        };
    }, [focusSearch]);

    const handleFileSelect = (filePath: string) => {
        onStateChange({ selectedFile: filePath });
    };

    return (
        <div className="flex h-full flex-col">
            {/* 搜索框 - 按 Ctrl+F 唤出 */}
            {showSearch && (
                <div className="border-ws-border border-b p-2">
                    <div className="relative flex items-center gap-2">
                        <Search className="h-4 w-4 text-ws-fg-muted" />
                        <input
                            ref={searchInputRef}
                            type="text"
                            placeholder="搜索文件... (Esc 关闭)"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            onKeyDown={e => {
                                if (e.key === 'Escape') {
                                    setShowSearch(false);
                                    setSearchQuery('');
                                }
                            }}
                            className="w-full rounded-md border border-ws-border bg-ws-bg-secondary px-3 py-1.5 pl-8 text-sm text-ws-fg-primary placeholder:text-ws-fg-muted focus:outline-none focus:ring-1 focus:ring-ws-accent"
                        />
                    </div>
                </div>
            )}

            {/* 文件树 */}
            <FileTree onFileSelect={handleFileSelect} className="flex-1" />

            {/* 调试信息（仅开发环境） */}
            {process.env.NODE_ENV === 'development' && (
                <div className="border-ws-border border-t p-2 text-left text-ws-fg-muted/70 text-xs">
                    <p>展开节点数：{expandedFolders.length}</p>
                    <p>选中文件：{selectedFile ?? '无'}</p>
                </div>
            )}
        </div>
    );
}
