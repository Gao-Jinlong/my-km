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
 * 负责整合 EditorShell、Toolbar 和 ContentArea
 * 管理编辑器状态和格式控制
 */
export function EditorRoot({ documentId, className }: EditorRootProps) {
    // TODO: 集成 EditorService 获取 formatState
    // const { formatState, onFormatToggle } = useEditorService(documentId);

    // 临时占位实现

    return (
        <EditorShell className={className}>
            {/* 工具栏区域 */}
            <div className="border-ws-border border-b bg-ws-bg-secondary px-3 py-2">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <span className="text-ws-fg-placeholder text-xs">工具栏</span>
                    </div>
                    <DocumentStatusIndicator documentId={documentId} />
                </div>
            </div>
            <ContentArea documentId={documentId} />
        </EditorShell>
    );
}
