'use client';

import { Files } from 'lucide-react';
import type { PanelComponentProps } from './index';

export function FilesPanel({ state, onStateChange }: PanelComponentProps) {
    const expandedFolders = state?.expandedNodes ?? [];
    const selectedFile = state?.selectedFile ?? null;

    const handleToggleFolder = (folderPath: string) => {
        const isExpanded = expandedFolders.includes(folderPath);
        const nextExpandedFolders = isExpanded
            ? expandedFolders.filter(path => path !== folderPath)
            : [...expandedFolders, folderPath];

        onStateChange({ expandedNodes: nextExpandedFolders });
    };

    const handleSelectFile = (filePath: string) => {
        onStateChange({ selectedFile: filePath });
    };

    return (
        <div className="flex h-full flex-col">
            <div className="border-ws-border border-b p-3">
                <input
                    type="text"
                    placeholder="搜索文件..."
                    className="w-full rounded-md border border-ws-border bg-ws-bg-secondary px-3 py-1.5 text-sm text-ws-fg-primary placeholder:text-ws-fg-muted focus:outline-none"
                    disabled
                />
            </div>

            <div className="flex flex-1 flex-col items-center justify-center p-4 text-center">
                <Files className="mb-3 h-10 w-10 text-ws-fg-muted" />
                <h3 className="mb-1 font-medium text-sm text-ws-fg-primary">文件面板</h3>
                <p className="text-sm text-ws-fg-muted">文件树将在这里恢复</p>
                <p className="mt-2 text-ws-fg-muted/70 text-xs">当前先保留为占位实现</p>

                {process.env.NODE_ENV === 'development' && (
                    <div className="mt-4 space-y-1 text-left text-ws-fg-muted/70 text-xs">
                        <p>展开节点数: {expandedFolders.length}</p>
                        <p>选中文件: {selectedFile ?? '无'}</p>
                        <button
                            type="button"
                            className="hidden"
                            onClick={() => handleToggleFolder('/')}
                        >
                            toggle
                        </button>
                        <button
                            type="button"
                            className="hidden"
                            onClick={() => handleSelectFile('/README.md')}
                        >
                            select
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
