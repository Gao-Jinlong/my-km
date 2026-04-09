import { useMemo } from 'react';
import type { Document } from '@/features/editor/types';
import { cn } from '@/lib/utils';
import { useEditorTabs } from '@/platform/editor-tab/use-editor-tabs';
import { LexicalEditor } from './lexical-editor';

interface ContentAreaProps {
    documentId: string;
    className?: string;
}

/**
 * ContentArea - 内容区域组件
 *
 * 显示文档内容，集成 Lexical 编辑器
 */
export function ContentArea({ documentId, className }: ContentAreaProps) {
    const { openDocuments } = useEditorTabs();

    const document = useMemo<Document | null>(() => {
        const openDoc = openDocuments.find(d => d.id === documentId);
        if (!openDoc) return null;
        return {
            id: openDoc.id,
            path: openDoc.path,
            title: openDoc.title,
            type: openDoc.type,
            content: openDoc.content ? JSON.parse(openDoc.content) || [] : [],
            version: 1,
            createdAt: openDoc.openedAt,
            updatedAt: openDoc.openedAt,
        };
    }, [openDocuments, documentId]);

    const filePath = useMemo(() => {
        const openDoc = openDocuments.find(d => d.id === documentId);
        return openDoc?.path || '';
    }, [openDocuments, documentId]);

    return (
        <div className={cn('flex-1 overflow-y-auto bg-ws-bg-primary', className)}>
            <LexicalEditor
                documentId={documentId}
                document={document}
                filePath={filePath}
                className="h-full"
            />
        </div>
    );
}
