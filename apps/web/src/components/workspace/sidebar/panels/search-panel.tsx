'use client';

import { Search } from 'lucide-react';
import type { PanelComponentProps } from './index';

/**
 * 搜索面板组件
 * 用于全局搜索文件和内容
 *
 * TODO: 完整功能将在单独的任务中实现,包括:
 * - 搜索输入框
 * - 搜索类型选择(文件名/内容/标签/向量)
 * - 高级过滤选项
 * - 搜索结果展示
 * - 结果高亮
 */
export function SearchPanel({ state, onStateChange }: PanelComponentProps) {
    // 从状态中获取数据,如果没有则使用默认值
    const searchQuery = state?.searchQuery || '';
    const searchType = 'all'; // 默认搜索类型

    const handleSearchChange = (query: string) => {
        onStateChange({ searchQuery: query });
    };

    return (
        <div className="flex h-full flex-col bg-ws-bg-primary">
            {/* 搜索输入框 */}
            <div className="border-ws-border border-b p-2">
                <div className="relative">
                    <Search className="absolute top-1/2 left-2 h-4 w-4 -translate-y-1/2 text-ws-fg-muted" />
                    <input
                        type="text"
                        placeholder="搜索..."
                        value={searchQuery}
                        onChange={e => handleSearchChange(e.target.value)}
                        className="w-full rounded-md border border-ws-border bg-ws-bg-secondary py-1.5 pr-3 pl-8 text-sm text-ws-fg-primary placeholder:text-ws-fg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ws-accent"
                    />
                </div>
            </div>

            {/* 搜索类型选择 (占位符) */}
            <div className="border-ws-border border-b px-2 py-1">
                <div className="flex gap-1 overflow-x-auto">
                    {['全部', '文件名', '内容', '标签', '向量'].map(type => (
                        <button
                            key={type}
                            type="button"
                            className="rounded px-2 py-1 text-ws-fg-muted text-xs hover:bg-ws-bg-tertiary hover:text-ws-fg-primary disabled:opacity-50"
                            disabled
                        >
                            {type}
                        </button>
                    ))}
                </div>
            </div>

            {/* 搜索结果 (占位符) */}
            <div className="flex flex-1 flex-col items-center justify-center p-4 text-center">
                <Search className="mb-2 h-12 w-12 text-ws-icon" />
                <h3 className="mb-1 font-semibold text-sm text-ws-fg-primary">搜索</h3>
                <p className="text-sm text-ws-fg-muted">搜索界面将在此处显示</p>
                <p className="mt-2 text-ws-fg-muted/60 text-xs">输入关键词开始搜索</p>

                {/* 调试信息 */}
                {process.env.NODE_ENV === 'development' && (
                    <div className="mt-4 text-left text-ws-fg-muted/50 text-xs">
                        <p>搜索查询: {searchQuery || '无'}</p>
                        <p>搜索类型: {searchType}</p>
                    </div>
                )}
            </div>
        </div>
    );
}
