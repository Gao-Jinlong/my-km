/**
 * FileTree - 文件树组件
 *
 * 显示项目文件结构
 * 支持文件夹展开/折叠、文件选择、右键菜单
 */

'use client';

import { ChevronRight, Folder, FolderOpen } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getFileIconComponent } from '@/lib/file-icon';
import { cn } from '@/lib/utils';
import { container } from '@/platform/bootstrap';
import { ContextMenuService } from '@/platform/context-menu/service';
import type { ContextMenuContext } from '@/platform/context-menu/types';
import { DialogService } from '@/platform/dialog/service';
import { useEditorTabs } from '@/platform/editor-tab/use-editor-tabs';
import { FileOpenService } from '@/platform/file-open/service';
import { projectManager } from '@/platform/file-system/project-manager';
import { FileSystemService } from '@/platform/file-system/service';
import type { FileStat } from '@/platform/file-system/types';

/**
 * 文件图标组件 - 根据文件类型显示对应图标
 */
function FileIcon({ path }: { path: string }) {
    const { Icon, props } = getFileIconComponent({ path });
    return <Icon {...props} />;
}

interface FileTreeNodeProps {
    file: FileStat;
    depth: number;
    expandedNodes: string[];
    selectedFile: string | null;
    activeDocumentId: string | null;
    loadedChildren: Map<string, FileStat[]>;
    onToggleFolder: (path: string) => void;
    onSelectFile: (path: string) => void;
    onOpenFile: (path: string) => Promise<void>;
    onContextMenu: (e: React.MouseEvent, file: FileStat) => void;
}

/**
 * 单个文件树节点组件
 */
function FileTreeNode({
    file,
    depth,
    expandedNodes,
    selectedFile,
    activeDocumentId,
    loadedChildren,
    onToggleFolder,
    onSelectFile,
    onOpenFile,
    onContextMenu,
}: FileTreeNodeProps) {
    const isExpanded = expandedNodes.includes(file.path);
    const isSelected = selectedFile === file.path;
    const isDirectory = file.type === 'directory';
    const children = loadedChildren.get(file.path) || [];

    const handleClick = async () => {
        if (isDirectory) {
            onToggleFolder(file.path);
        } else {
            // 点击文件时，先更新选中状态，然后打开文件
            onSelectFile(file.path);
            await onOpenFile(file.path);
        }
    };

    const handleDoubleClick = async () => {
        if (!isDirectory) {
            onSelectFile(file.path);
        }
    };

    const handleContextMenuClick = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        onContextMenu(e, file);
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
                onKeyUp={e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        handleClick();
                    }
                }}
                onContextMenu={handleContextMenuClick}
                className={cn(
                    'flex cursor-pointer items-center gap-1.5 rounded-sm px-2 py-1 text-sm transition-colors',
                    !isDirectory && activeDocumentId === `file:${file.path}`
                        ? 'bg-ws-accent/20 font-medium text-ws-fg-primary'
                        : isSelected
                          ? 'bg-ws-accent/10 text-ws-fg-primary'
                          : 'text-ws-fg-secondary hover:bg-ws-bg-secondary',
                )}
                style={{ paddingLeft: `${depth * 20 + 8}px` }}
            >
                {isDirectory && (
                    <ChevronRight
                        className={cn(
                            'h-3.5 w-3.5 transition-transform',
                            isExpanded && 'rotate-90',
                        )}
                    />
                )}
                {!isDirectory && <FileIcon path={file.path} />}
                {isDirectory &&
                    (isExpanded ? (
                        <FolderOpen className="h-4 w-4 text-ws-icon" />
                    ) : (
                        <Folder className="h-4 w-4 text-ws-icon" />
                    ))}
                <span className="truncate">{file.name}</span>
            </div>

            {isDirectory && isExpanded && children.length > 0 && (
                // biome-ignore lint/a11y/useSemanticElements: 保持 div 结构以便于样式控制
                <div role="group">
                    {children.map(child => (
                        <FileTreeNode
                            key={child.path}
                            file={child}
                            depth={depth + 1}
                            expandedNodes={expandedNodes}
                            selectedFile={selectedFile}
                            activeDocumentId={activeDocumentId}
                            loadedChildren={loadedChildren}
                            onToggleFolder={onToggleFolder}
                            onSelectFile={onSelectFile}
                            onOpenFile={onOpenFile}
                            onContextMenu={onContextMenu}
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
    const [selectedFile, setSelectedFile] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // 展开状态（不持久化，每次刷新重置）
    const [expandedNodes, setExpandedNodes] = useState<string[]>([]);
    const expandedNodesRef = useRef<string[]>([]);
    expandedNodesRef.current = expandedNodes;

    // 已加载的子目录映射：path -> children
    const [loadedChildren, setLoadedChildren] = useState<Map<string, FileStat[]>>(() => new Map());

    const { activeDocumentId, closeDocument, openDocuments } = useEditorTabs();

    // 获取服务实例
    const fileSystemService = container.get<FileSystemService>(FileSystemService);
    const fileOpenService = container.get<FileOpenService>(FileOpenService);
    const contextMenuService = container.get<ContextMenuService>(ContextMenuService);
    const dialogService = container.get<DialogService>(DialogService);

    // 清除失效的缓存（当文件/文件夹被重命名或删除后）
    const clearStaleCache = useCallback((affectedPath: string, isDirectory: boolean) => {
        setLoadedChildren(prevMap => {
            const newMap = new Map(prevMap);
            // 删除被操作目录的缓存
            newMap.delete(affectedPath);
            // 删除所有子目录的缓存
            for (const key of newMap.keys()) {
                if (key.startsWith(`${affectedPath}/`)) {
                    newMap.delete(key);
                }
            }
            // 如果是文件，删除其父目录的缓存以刷新显示
            if (!isDirectory) {
                const parentPath = affectedPath.substring(0, affectedPath.lastIndexOf('/'));
                if (parentPath) {
                    newMap.delete(parentPath);
                }
            }
            return newMap;
        });
    }, []);

    // 加载文件树
    const loadFiles = useCallback(async () => {
        setIsLoading(true);
        setError(null);

        try {
            if (!projectManager.hasOpenProject()) {
                setFiles([]);
                setIsLoading(false);
                return;
            }

            const rootFiles = await fileSystemService.listFiles('file://');
            setFiles(rootFiles);
        } catch (err) {
            setError(err instanceof Error ? err.message : '加载文件失败');
        } finally {
            setIsLoading(false);
        }
    }, [fileSystemService]);

    useEffect(() => {
        loadFiles();
    }, [loadFiles]);

    // 刷新整个文件树（根目录 + 所有已展开目录的子节点）
    const refreshTree = useCallback(async () => {
        await loadFiles();
        // 重新加载所有已展开目录的子节点
        const currentExpanded = expandedNodesRef.current;
        for (const folderPath of currentExpanded) {
            try {
                const childFiles = await fileSystemService.listFiles(folderPath);
                setLoadedChildren(prevMap => new Map(prevMap).set(folderPath, childFiles));
            } catch (err) {
                console.error('刷新目录失败:', folderPath, err);
            }
        }
    }, [loadFiles, fileSystemService]);

    // 注册文件树右键菜单提供者
    useEffect(() => {
        const dispose = contextMenuService.registerProvider(
            'fileTree',
            (ctx: ContextMenuContext) => {
                const fileData = ctx.data as { path: string; type: 'file' | 'directory' | 'root' };
                const isDirectory = fileData.type === 'directory';
                const isRoot = fileData.type === 'root';

                // 计算创建文件/文件夹的目标目录路径
                // - 右键文件夹：在文件夹内创建
                // - 右键文件：在文件所在目录创建
                // - 右键空白：在根目录创建
                const getTargetDirectory = (): string => {
                    if (isRoot) {
                        return 'file://';
                    }
                    if (isDirectory) {
                        return fileData.path;
                    }
                    // 右键文件时，返回文件所在的父目录
                    const lastSlashIndex = fileData.path.lastIndexOf('/');
                    return lastSlashIndex > 0
                        ? fileData.path.substring(0, lastSlashIndex)
                        : 'file://';
                };

                const targetDir = getTargetDirectory();

                return [
                    {
                        id: 'file-actions',
                        entries: [
                            {
                                id: 'new-file',
                                label: '新建文件',
                                action: async () => {
                                    const fileName = await dialogService.askText('请输入文件名:');
                                    if (!fileName) return;

                                    try {
                                        const newFilePath = `${targetDir}/${fileName}`;
                                        await fileSystemService.writeFile(
                                            newFilePath,
                                            new Uint8Array(),
                                        );
                                        clearStaleCache(targetDir, true);
                                        await refreshTree();
                                        console.log('新建文件成功:', newFilePath);
                                    } catch (err) {
                                        console.error('新建文件失败:', err);
                                        await dialogService.alert(
                                            `新建文件失败：${(err as Error).message}`,
                                        );
                                    }
                                },
                            },
                            {
                                id: 'new-folder',
                                label: '新建文件夹',
                                action: async () => {
                                    const folderName =
                                        await dialogService.askText('请输入文件夹名称:');
                                    if (!folderName) return;

                                    try {
                                        const newFolderPath = `${targetDir}/${folderName}`;
                                        await fileSystemService.createDirectory(newFolderPath);
                                        clearStaleCache(targetDir, true);
                                        await refreshTree();
                                        console.log('新建文件夹成功:', newFolderPath);
                                    } catch (err) {
                                        console.error('新建文件夹失败:', err);
                                        await dialogService.alert(
                                            `新建文件夹失败：${(err as Error).message}`,
                                        );
                                    }
                                },
                            },
                            // separator-1: 只在 open 显示时显示（右键文件）
                            { id: 'separator-1', type: 'separator', hidden: isDirectory || isRoot },
                            {
                                id: 'open',
                                label: '打开',
                                hidden: isDirectory || isRoot,
                                action: async () => {
                                    await fileOpenService.openFile(fileData.path);
                                },
                            },
                            // separator-2: 只在 rename/delete 显示时显示（非根目录）
                            { id: 'separator-2', type: 'separator', hidden: isRoot },
                            {
                                id: 'rename',
                                label: '重命名',
                                hidden: isRoot,
                                action: async () => {
                                    const currentName = fileData.path.split('/').pop() || '';
                                    const newName = await dialogService.askText(
                                        '请输入新名称:',
                                        currentName,
                                    );
                                    if (!newName || newName === currentName) return;

                                    try {
                                        const oldPath = fileData.path;

                                        if (isDirectory) {
                                            await fileSystemService.renameDirectory(
                                                fileData.path,
                                                newName,
                                            );
                                        } else {
                                            await fileSystemService.renameFile(
                                                fileData.path,
                                                newName,
                                            );
                                        }
                                        clearStaleCache(oldPath, isDirectory);
                                        await refreshTree();
                                        console.log('重命名成功:', fileData.path, '->', newName);
                                    } catch (err) {
                                        console.error('重命名失败:', err);
                                        await dialogService.alert(
                                            `重命名失败：${(err as Error).message}`,
                                        );
                                    }
                                },
                            },
                            {
                                id: 'delete',
                                label: '删除',
                                hidden: isRoot,
                                action: async () => {
                                    const currentName = fileData.path.split('/').pop() || '';
                                    const confirmed = await dialogService.confirm(
                                        `确定要删除 "${currentName}" 吗？${isDirectory ? '文件夹及其内容' : '文件'}将被永久删除。`,
                                    );
                                    if (!confirmed) {
                                        return;
                                    }

                                    try {
                                        if (isDirectory) {
                                            await fileSystemService.deleteDirectory(fileData.path);
                                        } else {
                                            await fileSystemService.deleteFile(fileData.path);
                                        }
                                        clearStaleCache(fileData.path, isDirectory);
                                        // 关闭被删除文件对应的编辑器 tab
                                        if (isDirectory) {
                                            // 目录：关闭所有以该目录路径开头的 tab
                                            const prefix = `file:${fileData.path}/`;
                                            for (const doc of openDocuments) {
                                                if (doc.id.startsWith(prefix)) {
                                                    closeDocument(doc.id);
                                                }
                                            }
                                        } else {
                                            closeDocument(`file:${fileData.path}`);
                                        }
                                        await refreshTree();
                                        console.log('删除成功:', fileData.path);
                                    } catch (err) {
                                        console.error('删除失败:', err);
                                        await dialogService.alert(
                                            `删除失败：${(err as Error).message}`,
                                        );
                                    }
                                },
                            },
                        ],
                    },
                ];
            },
        );

        return () => {
            dispose.dispose();
        };
    }, [
        contextMenuService,
        dialogService,
        fileOpenService,
        fileSystemService,
        clearStaleCache,
        refreshTree,
        closeDocument,
        openDocuments,
    ]);

    const handleToggleFolder = useCallback(
        (folderPath: string) => {
            setExpandedNodes(prev => {
                const isExpanded = prev.includes(folderPath);
                if (isExpanded) {
                    // 折叠
                    return prev.filter(p => p !== folderPath);
                } else {
                    // 展开 - 如果还未加载，先加载
                    if (!loadedChildren.has(folderPath)) {
                        // 异步加载，先返回展开状态
                        setTimeout(async () => {
                            try {
                                const fileSystemService =
                                    container.get<FileSystemService>(FileSystemService);
                                const childFiles = await fileSystemService.listFiles(folderPath);
                                setLoadedChildren(prevMap =>
                                    new Map(prevMap).set(folderPath, childFiles),
                                );
                            } catch (err) {
                                console.error('加载子目录失败:', err);
                            }
                        }, 0);
                    }
                    return [...prev, folderPath];
                }
            });
        },
        [loadedChildren],
    );

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
                await fileOpenService.openFile(filePath);
            } catch (err) {
                console.error('打开文件失败:', err);
            }
        },
        [fileOpenService],
    );

    // 处理右键菜单
    const handleContextMenu = useCallback(
        (e: React.MouseEvent, file: FileStat) => {
            contextMenuService.show(e, {
                target: e.currentTarget as HTMLElement,
                data: {
                    path: file.path,
                    type: file.type as 'file' | 'directory',
                },
                x: e.clientX,
                y: e.clientY,
            });
        },
        [contextMenuService],
    );

    // 处理空白区域右键菜单
    const handleEmptySpaceContextMenu = useCallback(
        (e: React.MouseEvent) => {
            // 只在点击空白区域时触发（不是文件节点）
            const target = e.target as HTMLElement;
            if (target.closest('[role="treeitem"]')) {
                return;
            }

            contextMenuService.show(e, {
                target: e.currentTarget as HTMLElement,
                data: {
                    path: 'file://',
                    type: 'root',
                },
                x: e.clientX,
                y: e.clientY,
            });
        },
        [contextMenuService],
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
            <div
                role="tree"
                className={cn('flex h-full flex-col items-center justify-center p-4', className)}
                onContextMenu={handleEmptySpaceContextMenu}
            >
                <p className="text-sm text-ws-fg-placeholder">暂无文件</p>
                <p className="mt-1 text-ws-fg-muted text-xs">请先打开一个项目</p>
            </div>
        );
    }

    return (
        <div
            role="tree"
            className={cn('h-full overflow-y-auto py-2', className)}
            onContextMenu={handleEmptySpaceContextMenu}
        >
            {files.map(file => (
                <FileTreeNode
                    key={file.path}
                    file={file}
                    depth={0}
                    expandedNodes={expandedNodes}
                    selectedFile={selectedFile}
                    activeDocumentId={activeDocumentId}
                    loadedChildren={loadedChildren}
                    onToggleFolder={handleToggleFolder}
                    onSelectFile={_handleSelectFile}
                    onOpenFile={handleFileOpen}
                    onContextMenu={handleContextMenu}
                />
            ))}
        </div>
    );
}
