/**
 * Editor Context — 编辑器上下文收集
 *
 * 从旧的 ContextCollector 迁移而来。
 * 收集编辑器的选中文本、光标位置、文档内容等信息，
 * 在发送 AI 消息时作为 context 传递给后端。
 */

import type { EditorService } from '@/features/editor/service';
import { getContainer } from '@/platform/bootstrap';

export interface EditorContext {
    documentId: string;
    documentTitle: string;
    documentPath: string;
    selectedText: string | null;
    fullContent: string | null;
    cursorPosition: { blockId: string; offset: number } | null;
}

/**
 * 收集当前活动编辑器的上下文
 */
export function collectEditorContext(): EditorContext | null {
    try {
        const container = getContainer();

        // 尝试获取 EditorContainer
        const editorContainer = container.get<{
            getActiveInstance(): EditorService | null;
        }>('editorContainer');

        const editorService = editorContainer?.getActiveInstance?.();
        if (!editorService) return null;

        const fullContent = editorService.getFullContent();
        const selection = editorService.getSelection();

        return {
            documentId: '',
            documentTitle: '',
            documentPath: '',
            selectedText: selection?.text ?? null,
            fullContent: fullContent?.slice(0, 50 * 1024) ?? null, // 最大 50KB
            cursorPosition: selection?.head ?? null,
        };
    } catch {
        return null;
    }
}
