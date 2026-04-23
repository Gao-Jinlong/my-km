import { cn } from '@/lib/utils';
import { useDocument } from '@/platform/document-store/use-document';
import { LexicalEditor } from './lexical-editor';

interface ContentAreaProps {
    documentId: string;
    className?: string;
}

/**
 * ContentArea - 内容区域组件
 *
 * 显示文档内容，集成 Lexical 编辑器。
 * 文档内容由 EditorService 管理（在 FileOpenService.openFile 中加载）。
 */
export function ContentArea({ documentId, className }: ContentAreaProps) {
    const docMeta = useDocument(documentId);
    const filePath = docMeta?.path || '';

    return (
        <div className={cn('flex-1 overflow-y-auto bg-ws-bg-primary', className)}>
            <LexicalEditor documentId={documentId} filePath={filePath} className="h-full" />
        </div>
    );
}
