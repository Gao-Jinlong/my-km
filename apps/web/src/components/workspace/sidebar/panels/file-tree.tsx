/**
 * FileTree - 文件树组件
 *
 * 显示项目文件结构
 * 支持文件夹展开/折叠、文件选择
 */

'use client';

import { ChevronRight, File, Folder, FolderOpen } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { projectManager } from '@/platform/file-system/project-manager';
import { fileSystemService } from '@/platform/file-system/service';
import type { FileStat } from '@/platform/file-system/types';
import { useEditorUIStore } from '@/stores/editor-ui-store';

interface FileTreeNodeProps {
    file: FileStat;
    depth: number;
    expandedNodes: string[];
    selectedFile: string | null;
    onToggleFolder: (path: string) => void;
    onSelectFile: (path: string) => void;
}

/**
 * 单个文件树节点组件
 */
function FileTreeNode({
    file,
    depth,
    expandedNodes,
    selectedFile,
    onToggleFolder,
    onSelectFile,
}: FileTreeNodeProps) {
    const [children, setChildren] = useState<FileStat[]>([]);
    const [isLoaded, setIsLoaded] = useState(false);

    const isExpanded = expandedNodes.includes(file.path);
    const isSelected = selectedFile === file.path;
    const isDirectory = file.type === 'directory';

    const handleClick = async () => {
        if (isDirectory) {
            if (!isLoaded) {
                // 首次展开时加载子目录
                try {
                    const childFiles = await fileSystemService.listFiles(file.path);
                    setChildren(childFiles);
                    setIsLoaded(true);
                } catch (err) {
                    console.error('加载子目录失败:', err);
                }
            }
            onToggleFolder(file.path);
        } else {
            onSelectFile(file.path);
        }
    };

    const handleDoubleClick = async () => {
        if (!isDirectory) {
            onSelectFile(file.path);
        }
    };

    return (
        <div>
            <div
                role="treeitem"
                aria-expanded={isDirectory ? isExpanded : undefined}
                aria-selected={isSelected}
                tabIndex={0}
                onClick={handleClick}
                onDoubleClick={handleDoubleClick}
                className={cn(
                    'flex cursor-pointer items-center gap-1.5 rounded-sm px-2 py-1 text-sm transition-colors',
                    isSelected
                        ? 'bg-ws-accent/20 text-ws-fg-primary'
                        : 'text-ws-fg-secondary hover:bg-ws-bg-secondary',
                )}
                style={{ paddingLeft: `${depth * 12 + 8}px` }}
            >
                {isDirectory && (
                    <ChevronRight
                        className={cn(
                            'h-3.5 w-3.5 transition-transform',
                            isExpanded && 'rotate-90',
                        )}
                    />
                )}
                {!isDirectory && <File className="h-3.5 w-3.5" />}
                {isDirectory &&
                    (isExpanded ? (
                        <FolderOpen className="h-4 w-4 text-ws-icon" />
                    ) : (
                        <Folder className="h-4 w-4 text-ws-icon" />
                    ))}
                <span className="truncate">{file.name}</span>
            </div>

            {isDirectory && isExpanded && children.length > 0 && (
                <div role="group">
                    {children.map(child => (
                        <FileTreeNode
                            key={child.path}
                            file={child}
                            depth={depth + 1}
                            expandedNodes={expandedNodes}
                            selectedFile={selectedFile}
                            onToggleFolder={onToggleFolder}
                            onSelectFile={onSelectFile}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

interface FileTreeProps {
    className?: string;
    onFileSelect?: (filePath: string) => void;
}

/**
 * FileTree - 文件树主组件
 */
export function FileTree({ className, onFileSelect }: FileTreeProps) {
    const [files, setFiles] = useState<FileStat[]>([]);
    const [expandedNodes, setExpandedNodes] = useState<string[]>([]);
    const [selectedFile, setSelectedFile] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const { openDocument } = useEditorUIStore();

    // 加载文件树
    const loadFiles = useCallback(async () => {
        setIsLoading(true);
        setError(null);

        try {
            // 检查是否有打开的项目
            if (!projectManager.hasOpenProject()) {
                setFiles([]);
                setIsLoading(false);
                return;
            }

            // 列出根目录内容
            const rootFiles = await fileSystemService.listFiles('file://');
            setFiles(rootFiles);

            // 默认展开第一层
            const directories = rootFiles.filter(f => f.type === 'directory').map(f => f.path);
            setExpandedNodes(directories);
        } catch (err) {
            setError(err instanceof Error ? err.message : '加载文件失败');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        loadFiles();
    }, [loadFiles]);

    const handleToggleFolder = useCallback((folderPath: string) => {
        setExpandedNodes(prev =>
            prev.includes(folderPath) ? prev.filter(p => p !== folderPath) : [...prev, folderPath],
        );
    }, []);

    const _handleSelectFile = useCallback(
        (filePath: string) => {
            setSelectedFile(filePath);
            onFileSelect?.(filePath);
        },
        [onFileSelect],
    );

    // 处理文件打开
    const handleFileOpen = useCallback(
        async (filePath: string) => {
            try {
                // 读取文件内容（不需要使用，直接打开）
                await fileSystemService.readFile(filePath);

                // 创建文档并打开
                const doc = {
                    id: `doc-${Date.now()}`,
                    path: filePath,
                    title: filePath.split('/').pop() || 'Untitled',
                    type: filePath.endsWith('.md') ? ('markdown' as const) : ('rich-text' as const),
                    content: [],
                    version: 1,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                };

                openDocument(doc);
            } catch (err) {
                console.error('打开文件失败:', err);
            }
        },
        [openDocument],
    );

    if (isLoading) {
        return (
            <div className={cn('flex h-full items-center justify-center', className)}>
                <p className="text-sm text-ws-fg-placeholder">加载文件树...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className={cn('flex h-full items-center justify-center p-4', className)}>
                <p className="text-center text-sm text-ws-fg-error">{error}</p>
            </div>
        );
    }

    if (files.length === 0) {
        return (
            <div className={cn('flex h-full items-center justify-center p-4', className)}>
                <p className="text-center text-sm text-ws-fg-placeholder">暂无文件</p>
                <p className="mt-2 text-ws-fg-muted text-xs">请先打开一个项目</p>
            </div>
        );
    }

    return (
        <div role="tree" className={cn('overflow-y-auto py-2', className)}>
            {files.map(file => (
                <FileTreeNode
                    key={file.path}
                    file={file}
                    depth={0}
                    expandedNodes={expandedNodes}
                    selectedFile={selectedFile}
                    onToggleFolder={handleToggleFolder}
                    onSelectFile={handleFileOpen}
                />
            ))}
        </div>
    );
}
