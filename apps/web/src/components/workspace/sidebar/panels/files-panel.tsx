'use client';

import { ChevronDown, ChevronRight, FileText, Library } from 'lucide-react';
import { useCallback } from 'react';
import { cn } from '@/lib/utils';
import type { PanelComponentProps } from './index';

/**
 * 文件树节点类型
 */
interface FileNode {
    id: string;
    name: string;
    type: 'folder' | 'file';
    children?: FileNode[];
}

/**
 * 示例文件树数据
 */
const exampleFileTree: FileNode[] = [
    {
        id: 'folder-1',
        name: '我的知识库',
        type: 'folder',
        children: [
            { id: 'file-1', name: '2026年度计划.md', type: 'file' },
            { id: 'file-2', name: '春节旅行清单.md', type: 'file' },
            { id: 'file-3', name: '周会记录.md', type: 'file' },
        ],
    },
];

/**
 * 文件树项组件
 */
interface FileTreeItemProps {
    node: FileNode;
    level: number;
    isSelected: boolean;
    isExpanded: boolean;
    onToggleFolder: (nodeId: string) => void;
    onSelectFile: (nodeId: string) => void;
}

function FileTreeItem({
    node,
    level,
    isSelected,
    isExpanded,
    onToggleFolder,
    onSelectFile,
}: FileTreeItemProps) {
    const isFolder = node.type === 'folder';
    const paddingLeft = 8 + level * 16; // 基础 8px + 每级 16px

    const handleClick = useCallback(() => {
        if (isFolder) {
            onToggleFolder(node.id);
        } else {
            onSelectFile(node.id);
        }
    }, [isFolder, node.id, onToggleFolder, onSelectFile]);

    return (
        <div>
            {/* 文件夹/文件项 */}
            <button
                type="button"
                className={cn(
                    'flex h-6 w-full items-center gap-2 rounded px-2 py-1.5',
                    'cursor-pointer font-normal text-[13px] text-ws-fg-primary',
                    'transition-colors duration-150',
                    'hover:bg-ws-bg-tertiary',
                    isSelected && 'bg-ws-bg-tertiary',
                )}
                style={{ paddingLeft: `${paddingLeft}px` }}
                onClick={handleClick}
            >
                {/* 展开/折叠图标 (仅文件夹) */}
                {isFolder && (
                    <div className="shrink-0">
                        {isExpanded ? (
                            <ChevronDown className="h-4 w-4 text-ws-icon" />
                        ) : (
                            <ChevronRight className="h-4 w-4 text-ws-icon" />
                        )}
                    </div>
                )}

                {/* 文件夹/文件图标 */}
                <div className="shrink-0">
                    {isFolder ? (
                        <Library className="h-4 w-4 text-ws-icon" />
                    ) : (
                        <FileText className="h-4 w-4 text-ws-icon" />
                    )}
                </div>

                {/* 名称 */}
                <span className="truncate">{node.name}</span>
            </button>

            {/* 子节点 (仅文件夹且展开时显示) */}
            {isFolder && isExpanded && node.children && (
                <div className="flex flex-col gap-1">
                    {node.children.map(child => (
                        <FileTreeItem
                            key={child.id}
                            node={child}
                            level={level + 1}
                            isSelected={false}
                            isExpanded={false}
                            onToggleFolder={onToggleFolder}
                            onSelectFile={onSelectFile}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

/**
 * 文件面板组件
 * 用于显示项目文件树
 */
export function FilesPanel({ state, onStateChange }: PanelComponentProps) {
    // 从状态中获取数据,如果没有则使用默认值
    const expandedFolders = state?.expandedNodes || [];
    const selectedFile = state?.selectedFile || null;

    /**
     * 判断文件夹是否展开
     */
    const isFolderExpanded = useCallback(
        (nodeId: string) => {
            return expandedFolders.includes(nodeId);
        },
        [expandedFolders],
    );

    /**
     * 判断文件是否被选中
     */
    const isFileSelected = useCallback(
        (nodeId: string) => {
            return selectedFile === nodeId;
        },
        [selectedFile],
    );

    /**
     * 切换文件夹展开/折叠状态
     */
    const handleToggleFolder = useCallback(
        (nodeId: string) => {
            const isExpanded = expandedFolders.includes(nodeId);
            const newExpanded = isExpanded
                ? expandedFolders.filter(id => id !== nodeId)
                : [...expandedFolders, nodeId];

            onStateChange({ expandedNodes: newExpanded });
        },
        [expandedFolders, onStateChange],
    );

    /**
     * 选中文件
     */
    const handleSelectFile = useCallback(
        (nodeId: string) => {
            onStateChange({ selectedFile: nodeId });
        },
        [onStateChange],
    );

    return (
        <div className="flex h-full flex-col">
            {/* 文件树内容 */}
            <div className="flex flex-1 flex-col gap-1 p-2">
                {exampleFileTree.map(node => (
                    <FileTreeItem
                        key={node.id}
                        node={node}
                        level={0}
                        isSelected={isFileSelected(node.id)}
                        isExpanded={isFolderExpanded(node.id)}
                        onToggleFolder={handleToggleFolder}
                        onSelectFile={handleSelectFile}
                    />
                ))}
            </div>
        </div>
    );
}
