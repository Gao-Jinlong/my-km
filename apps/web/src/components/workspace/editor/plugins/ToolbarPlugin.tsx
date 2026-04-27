/**
 * ToolbarPlugin - 工具栏数据桥接插件
 *
 * 在 LexicalExtensionComposer 内部运行，监听选区变化并同步格式状态，
 * 将格式状态传递给纯 UI 组件 Toolbar。
 */

'use client';

import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
    $getSelection,
    $isRangeSelection,
    COMMAND_PRIORITY_LOW,
    SELECTION_CHANGE_COMMAND,
} from 'lexical';
import { useCallback, useEffect, useState } from 'react';
import type { FormatState } from '@/features/editor/types';
import { getContainer } from '@/platform/bootstrap';
import { EditorTabService } from '@/platform/editor-tab/service';
import { Toolbar } from '../toolbar';

/**
 * 创建空格式状态
 */
function createEmptyFormatState(): FormatState {
    return {
        bold: false,
        italic: false,
        underline: false,
        strikethrough: false,
        code: false,
        subscript: false,
        superscript: false,
        highlight: false,
    };
}

export function ToolbarPlugin({ documentId }: { documentId: string }) {
    const [editor] = useLexicalComposerContext();
    const [formatState, setFormatState] = useState<FormatState>(createEmptyFormatState);
    const [isActive, setIsActive] = useState(false);

    // 订阅活跃文档变化
    useEffect(() => {
        const editorTabService = getContainer().get(EditorTabService);
        const initialActive = editorTabService.getActiveDocumentId() === documentId;
        setIsActive(initialActive);

        const unsubscribe = editorTabService.onDidChangeActive(activeId => {
            setIsActive(activeId === documentId);
        });

        return () => {
            unsubscribe.dispose();
        };
    }, [documentId]);

    const syncFormatState = useCallback(() => {
        editor.read(() => {
            const selection = $getSelection();
            if ($isRangeSelection(selection)) {
                setFormatState({
                    bold: selection.hasFormat('bold'),
                    italic: selection.hasFormat('italic'),
                    underline: selection.hasFormat('underline'),
                    strikethrough: selection.hasFormat('strikethrough'),
                    code: selection.hasFormat('code'),
                    subscript: selection.hasFormat('subscript'),
                    superscript: selection.hasFormat('superscript'),
                    highlight: selection.hasFormat('highlight'),
                });
            }
        });
    }, [editor]);

    // 选区变化：纯光标移动、键盘导航
    useEffect(() => {
        return editor.registerCommand(
            SELECTION_CHANGE_COMMAND,
            () => {
                if (!isActive) return false;
                syncFormatState();
                return false;
            },
            COMMAND_PRIORITY_LOW,
        );
    }, [editor, isActive, syncFormatState]);

    // 内容/格式变化：FORMAT_TEXT_COMMAND 不会触发 SELECTION_CHANGE_COMMAND，
    // 但会通过 dirty 标记触发 registerUpdateListener
    useEffect(() => {
        return editor.registerUpdateListener(() => {
            if (!isActive) return;
            editor.read(() => {
                syncFormatState();
            });
        });
    }, [editor, isActive, syncFormatState]);

    return <Toolbar editor={editor} formatState={isActive ? formatState : null} />;
}
