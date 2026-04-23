'use client';

import { X } from 'lucide-react';
import { useCallback, useEffect } from 'react';
import { getFileIconComponent } from '@/lib/file-icon';
import { cn } from '@/lib/utils';
import { container } from '@/platform/bootstrap';
import type { ContextMenuService } from '@/platform/context-menu/service';
import { DocumentStore } from '@/platform/document-store/service';
import { useAllEditorServiceStates } from '@/platform/editor/use-editor-service-state';
import { useEditorTabs } from '@/platform/editor-tab/use-editor-tabs';

/**
 * EditorTabs - 编辑器标签页组件
 *
 * 显示打开的文档标签页
 * 支持切换和关闭文档
 */
export function EditorTabs() {
    const {
        openDocuments,
        activeDocumentId,
        activateDocument,
        closeDocument,
        closeOtherDocuments,
        closeAllDocuments,
    } = useEditorTabs();
    const editorStates = useAllEditorServiceStates();

    const handleTabClick = useCallback(
        (documentId: string) => {
            activateDocument(documentId);
        },
        [activateDocument],
    );

    const handleCloseClick = useCallback(
        (e: React.MouseEvent, documentId: string) => {
            e.stopPropagation();
            closeDocument(documentId);
        },
        [closeDocument],
    );

    // 右键菜单处理
    const handleTabContextMenu = useCallback((e: React.MouseEvent, tabId: string) => {
        e.preventDefault();
        const contextMenuService = container.get('ContextMenuService') as ContextMenuService;
        contextMenuService.show(e, { data: { tabId } });
    }, []);

    // 从 DocumentStore 获取 tab 的路径（用于图标和复制路径）
    const getPath = useCallback((id: string): string => {
        const docStore = container.get(DocumentStore);
        return docStore.get(id)?.path ?? '';
    }, []);

    // 注册编辑器标签页右键菜单
    useEffect(() => {
        const contextMenuService = container.get('ContextMenuService') as ContextMenuService;
        const dispose = contextMenuService.registerProvider('editorTab', async ctx => {
            const tabId = ctx.data?.tabId as string;
            const tab = openDocuments.find(d => d.id === tabId);
            if (!tab) return [];

            return [
                {
                    id: 'tab-actions',
                    entries: [
                        { id: 'close', label: '关闭', action: () => closeDocument(tabId) },
                        {
                            id: 'close-others',
                            label: '关闭其他',
                            action: () => closeOtherDocuments(tabId),
                        },
                        {
                            id: 'close-all',
                            label: '关闭所有',
                            action: () => closeAllDocuments(),
                        },
                        { id: 'sep-1', type: 'separator' as const },
                        {
                            id: 'copy-path',
                            label: '复制路径',
                            action: () => navigator.clipboard.writeText(getPath(tabId)),
                        },
                    ],
                },
            ];
        });
        return () => dispose.dispose();
    }, [openDocuments, closeDocument, closeOtherDocuments, closeAllDocuments, getPath]);

    // 键盘快捷键处理
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Ctrl+W 关闭当前标签
            if (e.ctrlKey && e.key === 'w') {
                e.preventDefault();
                if (activeDocumentId) {
                    closeDocument(activeDocumentId);
                }
            }
            // Ctrl+Tab 切换到下一个标签
            if (e.ctrlKey && e.key === 'Tab') {
                e.preventDefault();
                const currentIndex = openDocuments.findIndex(d => d.id === activeDocumentId);
                if (currentIndex !== -1) {
                    const nextIndex = (currentIndex + 1) % openDocuments.length;
                    activateDocument(openDocuments[nextIndex].id);
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [activeDocumentId, openDocuments, closeDocument, activateDocument]);

    return (
        <div className="flex h-[36px] items-center bg-ws-bg-tertiary">
            {openDocuments.map(tab => {
                const filePath = getPath(tab.id);
                const { Icon, props } = getFileIconComponent({ path: filePath });

                return (
                    <div
                        key={tab.id}
                        role="tab"
                        aria-selected={tab.id === activeDocumentId}
                        tabIndex={0}
                        onClick={() => handleTabClick(tab.id)}
                        onContextMenu={e => handleTabContextMenu(e, tab.id)}
                        onKeyDown={e => {
                            if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                handleTabClick(tab.id);
                            }
                        }}
                        className={cn(
                            'group flex cursor-pointer items-center gap-1.5 border-ws-border border-r px-2.5 py-2 text-sm transition-colors',
                            tab.id === activeDocumentId
                                ? 'bg-ws-bg-secondary text-ws-fg-primary'
                                : 'text-ws-fg-muted hover:bg-ws-bg-secondary/50',
                        )}
                    >
                        <Icon {...props} />

                        <span className="text-[12px]">{tab.title}</span>

                        {(editorStates.get(tab.id)?.isDirty ?? false) && (
                            <span className="h-1.5 w-1.5 rounded-full bg-ws-accent" />
                        )}

                        <button
                            type="button"
                            onClick={e => handleCloseClick(e, tab.id)}
                            className="rounded-sm p-0.5 opacity-0 transition-opacity hover:bg-ws-bg-tertiary group-hover:opacity-100"
                            aria-label="Close tab"
                        >
                            <X className="h-3 w-3 text-ws-icon" />
                        </button>
                    </div>
                );
            })}
        </div>
    );
}
