/**
 * ToolbarPlugin - Lexical 工具栏插件
 *
 * 监听选区变化，更新格式状态到 store
 */

'use client';

import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $getSelection, $isRangeSelection, type LexicalEditor } from 'lexical';
import { useEffect } from 'react';
import { container } from '@/platform/bootstrap';
import { EditorContainer } from '@/platform/editor/container/editor-container';

/**
 * 监听选区变化并更新格式状态
 */
export function ToolbarPlugin({ documentId }: { documentId: string }) {
    const [editor] = useLexicalComposerContext();

    useEffect(() => {
        // 注册更新监听器
        const unregisterUpdateListener = editor.registerUpdateListener(({ editorState }) => {
            editorState.read(() => {
                const selection = $getSelection();
                if ($isRangeSelection(selection)) {
                    // 获取格式状态
                    const _formatState = {
                        bold: selection.hasFormat('bold'),
                        italic: selection.hasFormat('italic'),
                        underline: selection.hasFormat('underline'),
                        strikethrough: selection.hasFormat('strikethrough'),
                        code: selection.hasFormat('code'),
                        highlight: selection.hasFormat('highlight'),
                        subscript: selection.hasFormat('subscript'),
                        superscript: selection.hasFormat('superscript'),
                    };

                    // 更新到 store
                    const editorContainer = container.get(EditorContainer);
                    const editorService = editorContainer.getService(documentId);
                    if (editorService) {
                        // TODO: 通过 store 更新格式状态
                        // 这里需要在 EditorService 上暴露 store 或提供更新方法
                    }
                }
            });
        });

        return () => {
            unregisterUpdateListener();
        };
    }, [editor, documentId]);

    return null;
}

/**
 * 切换文本格式
 */
export function toggleFormat(editor: LexicalEditor, format: string): void {
    editor.update(() => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
            // biome-ignore lint/suspicious/noExplicitAny: Lexical toggleFormat accepts format strings dynamically
            selection.toggleFormat(format as any);
        }
    });
}
