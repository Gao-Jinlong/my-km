/**
 * LexicalEditor - Lexical 编辑器组件
 *
 * 基于 @lexical/react 的富文本编辑器组件
 */

'use client';

import { CodeNode } from '@lexical/code';
import { LinkNode } from '@lexical/link';
import { ListItemNode, ListNode } from '@lexical/list';
import { AutoFocusPlugin } from '@lexical/react/LexicalAutoFocusPlugin';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { ListPlugin } from '@lexical/react/LexicalListPlugin';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { TabIndentationPlugin } from '@lexical/react/LexicalTabIndentationPlugin';
import { HeadingNode, QuoteNode } from '@lexical/rich-text';
import type { EditorThemeClasses } from 'lexical';
import { useEffect, useRef } from 'react';
import { EditorContainer } from '@/features/editor/container/EditorContainer';
import type { Document } from '@/features/editor/types';
import { cn } from '@/lib/utils';
import { container } from '@/platform/bootstrap';
import { ContextMenuService } from '@/platform/context-menu/service';
import type { ContextMenuContext } from '@/platform/context-menu/types';

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
 * EditorBridgePlugin - 将 Lexical 实例注入 EditorService
 */
function EditorBridgePlugin({ documentId, filePath }: { documentId: string; filePath: string }) {
    const [editor] = useLexicalComposerContext();
    const editorServiceRef = useRef<ReturnType<
        typeof EditorContainer.prototype.createInstance
    > | null>(null);

    useEffect(() => {
        // 获取 EditorContainer 并创建服务实例
        const editorContainer = container.get(EditorContainer);
        editorServiceRef.current = editorContainer.createInstance(documentId, filePath);

        // 将 Lexical 实例注入 EditorService
        if (editorServiceRef.current) {
            editorServiceRef.current.setEditor(editor);
        }

        // 清理时在容器上调用 disposeInstance
        return () => {
            if (editorServiceRef.current) {
                editorContainer.disposeInstance(documentId);
            }
        };
    }, [documentId, filePath, editor]);

    return null;
}

/**
 * EditorContentPlugin - 监听 document prop 变化并加载内容
 */
function EditorContentPlugin({ document: doc }: { document: Document | null }) {
    const [editor] = useLexicalComposerContext();
    const lastLoadedContentRef = useRef<string | null>(null);

    useEffect(() => {
        if (!doc || !editor) return;

        // 计算当前内容的 hash，防止重复加载
        const contentHash = JSON.stringify(doc.content);
        if (contentHash === lastLoadedContentRef.current) {
            return;
        }
        lastLoadedContentRef.current = contentHash;

        // 使用 BlockLexicalConverter 将 Block[] 渲染到编辑器
        blocksToLexical(doc.content, editor);
    }, [doc, editor]);

    return null;
}

/**
 * 编辑器初始化配置
 */
function getInitialConfig(documentId: string) {
    return {
        namespace: `editor-${documentId}`,
        theme,
        nodes: [ListNode, ListItemNode, HeadingNode, QuoteNode, CodeNode, LinkNode],
        onError: (error: Error) => {
            console.error('[LexicalEditor] Error:', error);
        },
    };
}

interface LexicalEditorProps {
    documentId: string;
    document: Document | null;
    filePath: string;
    className?: string;
    placeholder?: string;
}

/**
 * LexicalEditor 组件内部实现
 */
function LexicalEditorImpl({
    documentId,
    document,
    filePath,
    className,
    placeholder,
}: LexicalEditorProps) {
    const contextMenuServiceRef = useRef<ContextMenuService | null>(null);

    // 注册编辑器右键菜单提供者
    useEffect(() => {
        const contextMenuService = container.get(ContextMenuService);
        contextMenuServiceRef.current = contextMenuService;

        const dispose = contextMenuService.registerProvider(
            'editor',
            (_ctx: ContextMenuContext) => {
                return [
                    {
                        id: 'editor-actions',
                        entries: [
                            {
                                id: 'copy',
                                label: '复制',
                                action: async () => {
                                    // TODO: 复制选中文本
                                    console.log('[Editor ContextMenu] Copy');
                                },
                            },
                            {
                                id: 'paste',
                                label: '粘贴',
                                action: async () => {
                                    // TODO: 粘贴文本
                                    console.log('[Editor ContextMenu] Paste');
                                },
                            },
                            { id: 'separator-1', type: 'separator' },
                            {
                                id: 'select-all',
                                label: '全选',
                                action: async () => {
                                    // TODO: 全选文本
                                    console.log('[Editor ContextMenu] Select All');
                                },
                            },
                        ],
                    },
                ];
            },
        );

        return () => {
            dispose.dispose();
        };
    }, []);

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
                                <ContentEditable
                                    className="prose prose-ws min-h-[500px] max-w-none outline-none"
                                    onContextMenu={e => {
                                        // 触发编辑器右键菜单
                                        const contextMenuService =
                                            container.get(ContextMenuService);
                                        contextMenuService.show(e, {
                                            target: e.currentTarget,
                                            data: {
                                                documentId,
                                                type: 'editor',
                                            },
                                            x: e.clientX,
                                            y: e.clientY,
                                        });
                                    }}
                                />
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

            {/* EditorBridgePlugin - 注入 Lexical 实例到 EditorService */}
            <EditorBridgePlugin documentId={documentId} filePath={filePath} />

            {/* EditorContentPlugin - 监听 document 变化并加载内容 */}
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
    filePath,
    className,
    placeholder = '开始输入...',
}: LexicalEditorProps) {
    return (
        <LexicalEditorImpl
            documentId={documentId}
            document={document}
            filePath={filePath}
            className={className}
            placeholder={placeholder}
        />
    );
}
