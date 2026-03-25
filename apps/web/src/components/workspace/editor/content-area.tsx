import { cn } from '@/lib/utils';
import { LexicalEditor } from './lexical-editor';
import { useEditorUIStore } from '@/stores/editor-ui-store';
import type { Document } from '@/features/editor/types';

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
    // 从 store 获取文档信息
    const { openDocuments } = useEditorUIStore();
    const openDoc = openDocuments.find(d => d.id === documentId);

    // 构造文档对象（MVP 简化版本）
    const document: Document | null = openDoc
        ? {
              id: openDoc.id,
              path: openDoc.path,
              title: openDoc.title,
              type: openDoc.type,
              content: [], // MVP 阶段先使用空内容
              version: 1,
              createdAt: openDoc.openedAt,
              updatedAt: openDoc.openedAt,
          }
        : null;

    return (
        <div className={cn('flex-1 overflow-y-auto bg-ws-bg-primary', className)}>
            <LexicalEditor
                documentId={documentId}
                document={document}
                className="h-full"
                placeholder="开始编写内容..."
            />
        </div>
    );
}
