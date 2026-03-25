import { EditorRoot } from './editor-root';
import { EditorTabs } from './editor-tabs';

// TODO: 从 workspace store 或 EditorContainer 获取活动文档 ID
const ACTIVE_DOCUMENT_ID = 'doc-1';

/**
 * EditorArea - 编辑器区域组件
 *
 * 整合 EditorTabs 和 EditorRoot
 * 作为工作区编辑器的主入口
 */
export function EditorArea() {
    return (
        <div className="flex h-full flex-col bg-ws-bg-secondary">
            {/* Tabs */}
            <EditorTabs />

            {/* Editor Content */}
            <EditorRoot documentId={ACTIVE_DOCUMENT_ID} className="flex-1" />
        </div>
    );
}
