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
import type { EditorContainer } from '@/features/editor/container/EditorContainer';
import type { EditorService } from '@/features/editor/service/EditorService';
import type { Document } from '@/features/editor/types';
import { cn } from '@/lib/utils';
import { getContainer } from '@/platform/bootstrap';
import type { ContextMenuService } from '@/platform/context-menu/service';
import type { ContextMenuContext } from '@/platform/context-menu/types';
import type { EditorTabService } from '@/platform/editor-tab/service';
import { MonitorService } from '@/platform/monitor/service';
import { registerEditorService, unregisterEditorService } from './document-status-indicator';

/**
 * 惰性获取 logger，避免模块级循环依赖
 */
function getLogger() {
    return getContainer().get(MonitorService).getLogger('editor');
}

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
 *
 * 每个文档有独立的 LexicalComposer（通过 key={doc.id} 隔离），
 * 此插件在挂载时创建/复用 EditorService 并注入 Lexical 实例。
 * 清理时只取消订阅，不销毁 EditorService（由 FileOpenService 在关闭文档时销毁）。
 */
function EditorBridgePlugin({ documentId, filePath }: { documentId: string; filePath: string }) {
    const [editor] = useLexicalComposerContext();
    const disposableRef = useRef<ReturnType<EditorService['onChange']> | null>(null);

    useEffect(() => {
        // 获取服务实例
        const container = getContainer();
        const editorContainer = container.get('EditorContainer') as EditorContainer;
        const editorTabService = container.get('EditorTabService') as EditorTabService;

        // 复用或创建 EditorService 实例
        let editorService = editorContainer.getService(documentId);
        if (!editorService) {
            editorService = editorContainer.createInstance(documentId, filePath);
        }

        // 将 Lexical 实例注入 EditorService
        editorService.setEditor(editor);
        registerEditorService(documentId, editorService);

        // 订阅 EditorService 状态变化，同步 isDirty 到 EditorTabService
        disposableRef.current = editorService.onChange(state => {
            editorTabService.updateDocument(documentId, { isDirty: state.isDirty });
        });

        // 初始同步一次
        const initialState = editorService.getState();
        editorTabService.updateDocument(documentId, { isDirty: initialState.isDirty });

        // 清理时取消订阅，但不销毁 EditorService 实例
        // EditorService 只在关闭文档时由 FileOpenService 销毁
        return () => {
            if (disposableRef.current) {
                disposableRef.current.dispose();
            }
            unregisterEditorService(documentId);
        };
    }, [documentId, filePath, editor]);

    return null;
}

/**
 * EditorContentPlugin - 挂载时通过 EditorService.loadDocument 加载文档内容
 *
 * 必须通过 EditorService.loadDocument 加载（而非直接调用 blocksToLexical），
 * 这样 EditorService 才能记录 currentDocument，saveDocument 才能正常工作。
 */
function EditorContentPlugin({
    document: doc,
    documentId,
}: {
    document: Document | null;
    documentId: string;
}) {
    const loadedRef = useRef(false);

    useEffect(() => {
        if (!doc || loadedRef.current) return;

        const container = getContainer();
        const editorContainer = container.get('EditorContainer') as EditorContainer;
        const editorService = editorContainer.getService(documentId);
        if (editorService) {
            loadedRef.current = true;
            editorService.loadDocument(doc);
        }
    }, [doc, documentId]);

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
            getLogger().error('LexicalEditor error:', error);
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
        const contextMenuService = getContainer().get('ContextMenuService') as ContextMenuService;
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
                                    getLogger().debug('[Editor ContextMenu] Copy');
                                },
                            },
                            {
                                id: 'paste',
                                label: '粘贴',
                                action: async () => {
                                    // TODO: 粘贴文本
                                    getLogger().debug('[Editor ContextMenu] Paste');
                                },
                            },
                            { id: 'separator-1', type: 'separator' },
                            {
                                id: 'select-all',
                                label: '全选',
                                action: async () => {
                                    // TODO: 全选文本
                                    getLogger().debug('[Editor ContextMenu] Select All');
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
                {/* 编辑区域 */}
                <div className="flex-1 overflow-y-auto">
                    <div className="mx-auto max-w-200 px-4 py-6">
                        <RichTextPlugin
                            contentEditable={
                                <ContentEditable
                                    className="prose prose-ws min-h-125 max-w-none outline-none"
                                    onContextMenu={e => {
                                        // 触发编辑器右键菜单
                                        const contextMenuService = getContainer().get(
                                            'ContextMenuService',
                                        ) as ContextMenuService;
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
            <EditorContentPlugin document={document} documentId={documentId} />
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
    placeholder,
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
