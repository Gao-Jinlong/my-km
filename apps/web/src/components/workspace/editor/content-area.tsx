import { cn } from '@/lib/utils';

interface ContentAreaProps {
    documentId: string;
    className?: string;
}

/**
 * ContentArea - 内容区域组件
 *
 * 显示文档内容
 * 未来将集成 Lexical 编辑器
 */
export function ContentArea({ documentId, className }: ContentAreaProps) {
    // TODO: 集成 EditorService 获取文档内容
    // const { document, isLoading, error } = useEditorService(documentId);

    return (
        <div className={cn('flex-1 overflow-y-auto bg-ws-bg-primary p-4', className)}>
            <div className="mx-auto max-w-[800px]">
                {/* TODO: 渲染文档内容 */}
                <div className="text-sm text-ws-fg-muted">Document ID: {documentId}</div>
                <div className="mt-2 text-ws-fg-placeholder text-xs">
                    Editor content area - Lexical integration pending
                </div>
            </div>
        </div>
    );
}
