'use client';

import { Search } from 'lucide-react';
import type { PanelComponentProps } from './index';

export function SearchPanel({ state, onStateChange }: PanelComponentProps) {
    const searchQuery = state?.searchQuery ?? '';

    const handleSearchChange = (query: string) => {
        onStateChange({ searchQuery: query });
    };

    return (
        <div className="flex h-full flex-col">
            <div className="border-ws-border border-b p-3">
                <div className="relative">
                    <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ws-fg-muted" />
                    <input
                        type="text"
                        placeholder="搜索..."
                        value={searchQuery}
                        onChange={e => handleSearchChange(e.target.value)}
                        className="w-full rounded-md border border-ws-border bg-ws-bg-secondary py-1.5 pr-3 pl-9 text-sm text-ws-fg-primary placeholder:text-ws-fg-muted focus:outline-none"
                    />
                </div>
            </div>

            <div className="border-ws-border border-b px-3 py-2">
                <div className="flex gap-1 overflow-x-auto">
                    {['全部', '文件名', '内容', '标签', '向量'].map(type => (
                        <button
                            key={type}
                            type="button"
                            className="rounded-md px-2 py-1 text-ws-fg-muted text-xs hover:bg-ws-bg-secondary"
                            disabled
                        >
                            {type}
                        </button>
                    ))}
                </div>
            </div>

            <div className="flex flex-1 flex-col items-center justify-center p-4 text-center">
                <Search className="mb-3 h-10 w-10 text-ws-fg-muted" />
                <h3 className="mb-1 font-medium text-sm text-ws-fg-primary">搜索面板</h3>
                <p className="text-sm text-ws-fg-muted">搜索结果区域尚未接入</p>
                <p className="mt-2 text-ws-fg-muted/70 text-xs">当前只保留查询状态和占位界面</p>
            </div>
        </div>
    );
}
