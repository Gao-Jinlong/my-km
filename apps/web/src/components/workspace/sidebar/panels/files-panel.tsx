'use client';

import type { PanelComponentProps } from './index';
import { FileTree } from './file-tree';

export function FilesPanel({ state, onStateChange }: PanelComponentProps) {
    const expandedFolders = state?.expandedNodes ?? [];
    const selectedFile = state?.selectedFile ?? null;

    const handleFileSelect = (filePath: string) => {
        onStateChange({ selectedFile: filePath });
    };

    return (
        <div className="flex h-full flex-col">
            {/* 搜索框 - 暂时禁用 */}
            <div className="border-ws-border border-b p-3">
                <input
                    type="text"
                    placeholder="搜索文件..."
                    className="w-full rounded-md border border-ws-border bg-ws-bg-secondary px-3 py-1.5 text-sm text-ws-fg-primary placeholder:text-ws-fg-muted focus:outline-none"
                    disabled
                />
            </div>

            {/* 文件树 */}
            <FileTree onFileSelect={handleFileSelect} />

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
