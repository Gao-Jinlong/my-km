import { useEditorUIStore } from '@/stores/editor-ui-store';
import { EditorRoot } from './editor-root';
import { EditorTabs } from './editor-tabs';

/**
 * EditorArea - 编辑器区域组件
 *
 * 整合 EditorTabs 和 EditorRoot
 * 作为工作区编辑器的主入口
 */
export function EditorArea() {
    const { activeDocumentId, openDocuments } = useEditorUIStore();

    // 如果没有打开的文档，显示空状态
    if (openDocuments.length === 0) {
        return (
            <div className="flex h-full flex-col bg-ws-bg-secondary">
                <EditorTabs />
                <div className="flex flex-1 items-center justify-center">
                    <div className="text-center">
                        <p className="text-ws-fg-muted">未打开任何文档</p>
                        <p className="mt-1 text-sm text-ws-fg-placeholder">
                            从左侧文件树选择文件打开
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex h-full flex-col bg-ws-bg-secondary">
            {/* Tabs */}
            <EditorTabs />

            {/* Editor Content */}
            {activeDocumentId && <EditorRoot documentId={activeDocumentId} className="flex-1" />}
        </div>
    );
}
