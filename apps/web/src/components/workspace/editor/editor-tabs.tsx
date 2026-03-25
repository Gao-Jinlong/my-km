'use client';

import { FileText, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useEditorUIStore } from '@/stores/editor-ui-store';
import { useCallback, useEffect } from 'react';

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
    } = useEditorUIStore();

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
            {openDocuments.map(tab => (
                <div
                    key={tab.id}
                    role="tab"
                    aria-selected={tab.id === activeDocumentId}
                    tabIndex={0}
                    onClick={() => handleTabClick(tab.id)}
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
                    <FileText className="h-3.5 w-3.5 text-ws-icon" />

                    <span className="text-[12px]">{tab.title}</span>

                    {tab.isDirty && (
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
            ))}
        </div>
    );
}
