import { ContentArea } from './content-area';
import { EditorShell } from './editor-shell';
import { Toolbar } from './toolbar';

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
    const formatState = null;
    const onFormatToggle = (_format: string) => {
        console.log('Toggle format:', _format);
    };

    return (
        <EditorShell className={className}>
            <Toolbar formatState={formatState} onFormatToggle={onFormatToggle} />
            <ContentArea documentId={documentId} />
        </EditorShell>
    );
}
