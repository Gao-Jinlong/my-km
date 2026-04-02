import { useEditorTabs } from '@/platform/editor-tab/use-editor-tabs';
import { EditorRoot } from './editor-root';
import { EditorTabs } from './editor-tabs';
import { WelcomePage } from './welcome-page';

/**
 * EditorArea - 编辑器区域组件
 *
 * 整合 EditorTabs 和 EditorRoot
 * 作为工作区编辑器的主入口
 */
export function EditorArea() {
    const { activeDocumentId, openDocuments } = useEditorTabs();

    if (openDocuments.length === 0) {
        return (
            <div className="flex h-full flex-col bg-ws-bg-secondary">
                <WelcomePage />
            </div>
        );
    }

    return (
        <div className="flex h-full flex-col bg-ws-bg-secondary">
            <EditorTabs />
            {activeDocumentId && <EditorRoot documentId={activeDocumentId} className="flex-1" />}
        </div>
    );
}
