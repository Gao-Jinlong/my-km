'use client';

import { Files } from 'lucide-react';
import type { PanelComponentProps } from './index';

/**
 * 文件面板组件
 * 用于显示项目文件树
 *
 * TODO: 完整功能将在单独的任务中实现,包括:
 * - 文件树展示
 * - 展开/折叠文件夹
 * - 文件搜索
 * - 右键上下文菜单
 * - 拖拽上传
 */
export function FilesPanel({ state, onStateChange }: PanelComponentProps) {
    // 从状态中获取数据,如果没有则使用默认值
    const expandedFolders = state?.expandedNodes || [];
    const selectedFile = state?.selectedFile || null;

    const _handleToggleFolder = (folderPath: string) => {
        const isExpanded = expandedFolders.includes(folderPath);
        const newExpanded = isExpanded
            ? expandedFolders.filter(path => path !== folderPath)
            : [...expandedFolders, folderPath];

        onStateChange({ expandedNodes: newExpanded });
    };

    const _handleSelectFile = (filePath: string) => {
        onStateChange({ selectedFile: filePath });
    };

    return (
        <div className="flex h-full flex-col">
            {/* 文件搜索输入框 (占位符) */}
            <div className="border-b p-2">
                <input
                    type="text"
                    placeholder="搜索文件..."
                    className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled
                />
            </div>

            {/* 文件树内容 (占位符) */}
            <div className="flex flex-1 flex-col items-center justify-center p-4 text-center">
                <Files className="mb-2 h-12 w-12 text-muted-foreground" />
                <h3 className="mb-1 font-semibold">文件树</h3>
                <p className="text-muted-foreground text-sm">文件树将在此处显示</p>
                <p className="mt-2 text-muted-foreground/60 text-xs">完整功能即将推出</p>

                {/* 调试信息 */}
                {process.env.NODE_ENV === 'development' && (
                    <div className="mt-4 text-left text-muted-foreground/50 text-xs">
                        <p>展开的文件夹: {expandedFolders.length}</p>
                        <p>选中的文件: {selectedFile || '无'}</p>
                    </div>
                )}
            </div>
        </div>
    );
}
