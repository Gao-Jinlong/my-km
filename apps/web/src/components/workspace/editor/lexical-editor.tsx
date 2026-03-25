/**
 * LexicalEditor - Lexical 编辑器组件
 *
 * 基于 @lexical/react 的富文本编辑器组件
 */

'use client';

import { AutoFocusPlugin } from '@lexical/react/LexicalAutoFocusPlugin';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { ListPlugin } from '@lexical/react/LexicalListPlugin';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { TabIndentationPlugin } from '@lexical/react/LexicalTabIndentationPlugin';
import type { EditorThemeClasses } from 'lexical';
import { $createParagraphNode, $createTextNode, $getRoot } from 'lexical';
import { useEffect, useState } from 'react';
import { EditorContainer } from '@/features/editor/container/EditorContainer';
import { blockRegistry } from '@/features/editor/registry/BlockRegistry';
import type { Document } from '@/features/editor/types';
import { cn } from '@/lib/utils';

/**
 * 编辑器主题配置
 */
const theme: EditorThemeClasses = {
    // 文本格式
    bold: 'font-bold',
    code: 'font-mono bg-ws-bg-secondary px-1 rounded',
    highlight: 'bg-yellow-200',
    italic: 'italic',
    strikethrough: 'line-through',
    underline: 'underline',
    underlineStrikethrough: 'underline line-through',

    // 段落
    paragraph: 'my-2',

    // 标题
    heading: {
        h1: 'text-3xl font-bold my-4',
        h2: 'text-2xl font-semibold my-3',
        h3: 'text-xl font-semibold my-2',
        h4: 'text-lg font-medium my-2',
        h5: 'text-base font-medium my-1',
        h6: 'text-sm font-medium my-1',
    },

    // 列表
    list: {
        listitem: 'list-item ml-4',
        listitemChecked: 'list-itemChecked',
        listitemUnchecked: 'list-itemUnchecked',
        nested: {
            listitem: 'list-item ml-4',
        },
    },

    // 引用
    quote: 'border-l-4 border-ws-accent pl-4 italic my-4 text-ws-fg-muted',

    // 代码块
    codeBlock: 'bg-ws-bg-secondary rounded-md p-4 font-mono text-sm overflow-x-auto',

    // 表格
    table: 'border-collapse w-full my-4',
    tableCell: 'border border-ws-border p-2',
    tableCellHeader: 'border border-ws-border p-2 font-bold bg-ws-bg-secondary',

    // 链接
    link: 'text-ws-accent hover:underline',

    // 占位符
    placeholder: 'text-ws-fg-placeholder pointer-events-none',
};

/**
 * 编辑器初始化配置
 */
function getInitialConfig(documentId: string) {
    return {
        namespace: `editor-${documentId}`,
        theme,
        onError: (error: Error) => {
            console.error('[LexicalEditor] Error:', error);
        },
    };
}

/**
 * 编辑器内容插件 - 负责加载文档内容
 */
function EditorContentPlugin({ document: doc }: { document: Document | null }) {
    const [editor] = useLexicalComposerContext();

    useEffect(() => {
        if (!doc || !editor) return;

        // 读取文档内容并加载到编辑器
        editor.update(() => {
            const root = $getRoot();
            root.clear();

            // 将 Block 内容转换为 Lexical 节点
            if (doc.content && doc.content.length > 0) {
                doc.content.forEach(block => {
                    const paragraph = $createParagraphNode();
                    const text = $createTextNode(
                        typeof block.content === 'string'
                            ? block.content
                            : JSON.stringify(block.content),
                    );
                    paragraph.append(text);
                    root.append(paragraph);
                });
            } else {
                // 空文档，创建空段落
                const paragraph = $createParagraphNode();
                root.append(paragraph);
            }
        });
    }, [doc, editor]);

    return null;
}

interface LexicalEditorProps {
    documentId: string;
    document: Document | null;
    className?: string;
    placeholder?: string;
}

/**
 * LexicalEditor 组件内部实现
 */
function LexicalEditorImpl({ documentId, document, className, placeholder }: LexicalEditorProps) {
    const [editorContainer] = useState(() => EditorContainer.getInstance(blockRegistry));

    // 创建 EditorService 实例
    useEffect(() => {
        const _editorService = editorContainer.createInstance(documentId);

        return () => {
            editorContainer.disposeInstance(documentId);
        };
    }, [documentId, editorContainer]);

    const initialConfig = getInitialConfig(documentId);

    return (
        <LexicalComposer initialConfig={initialConfig}>
            <div className={cn('relative flex h-full flex-col', className)}>
                {/* 工具栏区域 - 预留 */}
                <div className="border-ws-border border-b bg-ws-bg-secondary px-3 py-2">
                    <div className="flex items-center gap-2">
                        {/* TODO: 集成 Toolbar */}
                        <span className="text-ws-fg-placeholder text-xs">工具栏</span>
                    </div>
                </div>

                {/* 编辑区域 */}
                <div className="flex-1 overflow-y-auto">
                    <div className="mx-auto max-w-[800px] px-4 py-6">
                        <RichTextPlugin
                            contentEditable={
                                <ContentEditable className="prose prose-ws min-h-[500px] max-w-none outline-none" />
                            }
                            placeholder={
                                <div className="pointer-events-none absolute top-6 left-4 text-ws-fg-placeholder">
                                    {placeholder}
                                </div>
                            }
                            ErrorBoundary={() => <div>编辑器加载失败</div>}
                        />
                        <HistoryPlugin />
                        <ListPlugin />
                        <TabIndentationPlugin />
                        <AutoFocusPlugin />
                    </div>
                </div>
            </div>

            {/* 内容加载插件 */}
            <EditorContentPlugin document={document} />
        </LexicalComposer>
    );
}

/**
 * LexicalEditor - 主组件
 *
 * 使用 EditorContainer 管理编辑器实例
 * 从 store 获取文档内容
 */
export function LexicalEditor({
    documentId,
    document,
    className,
    placeholder = '开始输入...',
}: LexicalEditorProps) {
    return (
        <LexicalEditorImpl
            documentId={documentId}
            document={document}
            className={className}
            placeholder={placeholder}
        />
    );
}
