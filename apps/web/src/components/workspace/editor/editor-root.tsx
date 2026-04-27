import { ContentArea } from './content-area';
import { DocumentStatusIndicator } from './document-status-indicator';
import { EditorShell } from './editor-shell';

interface EditorRootProps {
    documentId: string;
    className?: string;
}

/**
 * EditorRoot - 编辑器根组件
 *
 * 提供 EditorShell 容器和右上角文档状态指示器。
 * 工具栏已内聚到 LexicalEditor 内部（ToolbarPlugin），
 * 编辑内容由 ContentArea → LexicalEditor 渲染。
 */
export function EditorRoot({ documentId, className }: EditorRootProps) {
    return (
        <EditorShell className={className}>
            {/* 内容区域 - LexicalEditor 包含 toolbar + content */}
            <ContentArea documentId={documentId} />
            {/* 文档状态指示器 - 右上角浮动 */}
            <div className="absolute top-2 right-2 z-10">
                <DocumentStatusIndicator documentId={documentId} />
            </div>
        </EditorShell>
    );
}
