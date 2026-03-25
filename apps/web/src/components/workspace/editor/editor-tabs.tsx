'use client';

import { FileText, X } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * 编辑器文档标签页接口
 */
export interface EditorTab {
    id: string;
    name: string;
    documentId: string;
    active: boolean;
}

/**
 * EditorTabsProps - EditorTabs 组件的属性
 */
interface EditorTabsProps {
    /** 文档列表 */
    documents?: EditorTab[];
    /** 标签页关闭处理函数 */
    onCloseTab?: (documentId: string) => void;
    /** 标签页切换处理函数 */
    onActivateTab?: (documentId: string) => void;
}

// 占位数据 - 未来将从 EditorContainer 或 store 获取
const placeholderTabs: EditorTab[] = [
    { id: '1', name: 'README.md', documentId: 'doc-1', active: true },
    { id: '2', name: 'document.md', documentId: 'doc-2', active: false },
];

/**
 * EditorTabs - 编辑器标签页组件
 *
 * 显示打开的文档标签页
 * 支持切换和关闭文档
 */
export function EditorTabs({
    documents = placeholderTabs,
    onCloseTab,
    onActivateTab,
}: EditorTabsProps) {
    const handleTabClick = (tab: EditorTab) => {
        onActivateTab?.(tab.documentId);
    };

    const handleCloseClick = (e: React.MouseEvent, tab: EditorTab) => {
        e.stopPropagation();
        onCloseTab?.(tab.documentId);
    };

    return (
        <div className="flex h-[36px] items-center bg-ws-bg-tertiary">
            {documents.map(tab => (
                <div
                    key={tab.id}
                    role="tab"
                    aria-selected={tab.active}
                    tabIndex={0}
                    onClick={() => handleTabClick(tab)}
                    onKeyDown={e => {
                        if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            handleTabClick(tab);
                        }
                    }}
                    className={cn(
                        'group flex cursor-pointer items-center gap-1.5 border-ws-border border-r px-2.5 py-2 text-sm transition-colors',
                        tab.active
                            ? 'bg-ws-bg-secondary text-ws-fg-primary'
                            : 'text-ws-fg-muted hover:bg-ws-bg-secondary/50',
                    )}
                >
                    <FileText className="h-3.5 w-3.5 text-ws-icon" />

                    <span className="text-[12px]">{tab.name}</span>

                    <button
                        type="button"
                        onClick={e => handleCloseClick(e, tab)}
                        className="rounded-sm p-0.5 opacity-0 transition-opacity hover:bg-ws-bg-tertiary group-hover:opacity-100"
                        aria-label="Close tab"
                    >
                        <X className="h-3 w-3 text-ws-icon" />
                    </button>
                </div>
            ))}
        </div>
    );
}

/**
 * EditorTabs - 编辑器标签页组件（无参数版本，使用内部状态）
 *
 * 简化版本，用于向后兼容
 */
export function EditorTabsDefault() {
    return <EditorTabs />;
}
