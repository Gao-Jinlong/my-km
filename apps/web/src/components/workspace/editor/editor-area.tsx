import { useEditorTabs } from '@/platform/editor-tab/use-editor-tabs';
import { EditorRoot } from './editor-root';
import { EditorTabs } from './editor-tabs';
import { WelcomePage } from './welcome-page';

/**
 * EditorArea - 编辑器区域组件
 *
 * 整合 EditorTabs 和 EditorRoot
 * 渲染所有已打开的文档编辑器，用 CSS 可见性控制活动文档
 * 每个文档有独立的 Lexical 实例（通过 key={doc.id} 隔离）
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
            {/* 渲染所有已打开的文档编辑器，每个文档独立 Lexical 实例 */}
            {/* 非活动编辑器用 hidden 隐藏但保持挂载，保留 undo history 和光标位置 */}
            {openDocuments.map(doc => (
                <div
                    key={doc.id}
                    className={doc.id === activeDocumentId ? 'flex-1 overflow-hidden' : 'hidden'}
                >
                    <EditorRoot documentId={doc.id} className="h-full" />
                </div>
            ))}
        </div>
    );
}
