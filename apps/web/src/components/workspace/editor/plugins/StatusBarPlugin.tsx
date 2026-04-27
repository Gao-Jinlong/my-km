/**
 * StatusBarPlugin - 状态栏数据同步插件
 *
 * 在 LexicalExtensionComposer 内部运行，监听选区和内容更新，
 * RAF 节流计算光标位置和字数，推送到独立 statusBarStore。
 */

'use client';

import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
    $getRoot,
    $getSelection,
    $isRangeSelection,
    COMMAND_PRIORITY_LOW,
    SELECTION_CHANGE_COMMAND,
} from 'lexical';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getContainer } from '@/platform/bootstrap';
import { EditorTabService } from '@/platform/editor-tab/service';
import { setStatusBarState } from '@/stores/status-bar-store';

export function StatusBarPlugin({ documentId }: { documentId: string }) {
    const [editor] = useLexicalComposerContext();
    const rafIdRef = useRef<number | null>(null);
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

    const scheduleUpdate = useCallback(() => {
        if (!isActive) return;
        if (rafIdRef.current !== null) return;

        rafIdRef.current = requestAnimationFrame(() => {
            editor.read(() => {
                const root = $getRoot();
                const selection = $getSelection();

                // 光标位置: 块索引 + 块内偏移
                let cursorLine = 1;
                let cursorCol = 1;
                if ($isRangeSelection(selection)) {
                    const anchor = selection.anchor;
                    const anchorNode = anchor.getNode();
                    const parent = anchorNode.getParent();
                    const blocks = root.getChildren();

                    // 找到光标所在块的索引
                    for (let i = 0; i < blocks.length; i++) {
                        if (blocks[i] === parent || blocks[i] === anchorNode) {
                            cursorLine = i + 1;
                            break;
                        }
                    }

                    // 块内偏移（1-based）
                    cursorCol = anchor.offset + 1;
                }

                // 字数
                const charCount = root.getTextContent().length;

                setStatusBarState(documentId, { cursorLine, cursorCol, charCount });
            });

            rafIdRef.current = null;
        });
    }, [editor, documentId, isActive]);

    // 选区变化：光标位置
    useEffect(() => {
        return editor.registerCommand(
            SELECTION_CHANGE_COMMAND,
            () => {
                scheduleUpdate();
                return false;
            },
            COMMAND_PRIORITY_LOW,
        );
    }, [editor, scheduleUpdate]);

    // 内容变化：字数统计
    useEffect(() => {
        return editor.registerUpdateListener(() => {
            scheduleUpdate();
        });
    }, [editor, scheduleUpdate]);

    return null;
}
