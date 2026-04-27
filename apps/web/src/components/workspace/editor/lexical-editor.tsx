/**
 * LexicalEditor - Lexical 编辑器组件
 *
 * 基于 @lexical/extension 的 Extensions API 构建。
 * 使用 LexicalExtensionComposer 替代旧的 LexicalComposer + initialConfig 模式。
 */

'use client';

import { CodeExtension } from '@lexical/code';
import { TabIndentationExtension } from '@lexical/extension';
import { HistoryExtension } from '@lexical/history';
import { LinkExtension } from '@lexical/link';
import { ListExtension } from '@lexical/list';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { LexicalExtensionComposer } from '@lexical/react/LexicalExtensionComposer';
import { useLexicalIsTextContentEmpty } from '@lexical/react/useLexicalIsTextContentEmpty';
import { RichTextExtension } from '@lexical/rich-text';
import { TableExtension } from '@lexical/table';
import type { EditorThemeClasses } from 'lexical';
import { $getRoot, defineExtension } from 'lexical';
import { useEffect, useRef } from 'react';
import { EditorContainer } from '@/features/editor/container/EditorContainer';
import {
    type AutoSaveService,
    createAutoSaveService,
} from '@/features/editor/service/AutoSaveService';
import { cn } from '@/lib/utils';
import { getContainer } from '@/platform/bootstrap';
import { ContextMenuService } from '@/platform/context-menu/service';
import type { ContextMenuContext } from '@/platform/context-menu/types';
import { EditorTabService } from '@/platform/editor-tab/service';
import type { FileSystemService } from '@/platform/file-system/service';
import { MonitorService } from '@/platform/monitor/service';
import { StatusBarPlugin } from './plugins/StatusBarPlugin';
import { ToolbarPlugin } from './plugins/ToolbarPlugin';

/**
 * 模块级 AutoSaveService 单例
 */
let globalAutoSaveService: AutoSaveService | null = null;

/**
 * 获取或创建 AutoSaveService 单例
 */
function getAutoSaveService(): AutoSaveService {
    if (!globalAutoSaveService) {
        const container = getContainer();
        const fileSystemService = container.get<FileSystemService>('FileSystemService');
        globalAutoSaveService = createAutoSaveService(fileSystemService);
    }
    return globalAutoSaveService;
}

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
    // 文本格式 — 必须嵌套在 text 属性下，Lexical 的 createTextInnerDOM 读取 theme.text
    text: {
        bold: 'font-bold',
        code: 'font-mono bg-ws-bg-secondary px-1 rounded',
        highlight: 'bg-yellow-200',
        italic: 'italic',
        strikethrough: 'line-through',
        underline: 'underline',
        underlineStrikethrough: 'underline line-through',
    },

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
 * 根 Extension — 组合所有编辑器功能
 *
 * 使用 defineExtension 定义根扩展，通过 dependencies 声明所有功能依赖。
 * 各内置 Extension 负责注册各自的节点：
 * - RichTextExtension → HeadingNode, QuoteNode
 * - ListExtension → ListNode, ListItemNode
 * - TableExtension → TableNode, TableRowNode, TableCellNode
 * - CodeExtension → CodeNode, CodeHighlightNode
 * - LinkExtension → LinkNode
 */
const rootExtension = defineExtension({
    name: '[my-km-editor]',
    dependencies: [
        RichTextExtension,
        HistoryExtension,
        ListExtension,
        TabIndentationExtension,
        TableExtension,
        CodeExtension,
        LinkExtension,
    ],
    theme,
    onError: (error: Error) => {
        getLogger().error('LexicalEditor error:', error);
    },
});

/**
 * EditorPlaceholder - 占位符组件
 *
 * 使用 useLexicalIsTextContentEmpty 控制显示，
 * 替代旧的 RichTextPlugin 内置占位符逻辑。
 */
function EditorPlaceholder({ content }: { content?: string }) {
    const [editor] = useLexicalComposerContext();
    const isEmpty = useLexicalIsTextContentEmpty(editor);

    if (!isEmpty || !content) return null;

    return (
        <div className="pointer-events-none absolute top-6 left-4 text-ws-fg-placeholder">
            {content}
        </div>
    );
}

/**
 * EditorBridgePlugin - 将 Lexical 实例注入 EditorService
 *
 * 每个文档有独立的 LexicalExtensionComposer（通过 key={doc.id} 隔离），
 * 此插件在挂载时创建/复用 EditorService 并注入 Lexical 实例。
 * 同时注册 AutoSaveService，当 Lexical 实例就绪后启用自动保存。
 * 清理时注销 AutoSaveService，不销毁 EditorService（由 FileOpenService 在关闭文档时销毁）。
 */
function EditorBridgePlugin({ documentId, filePath }: { documentId: string; filePath: string }) {
    const [editor] = useLexicalComposerContext();

    useEffect(() => {
        const container = getContainer();
        const editorContainer = container.get(EditorContainer);

        let editorService = editorContainer.getService(documentId);
        if (!editorService) {
            editorService = editorContainer.createInstance(documentId, filePath);
        }

        editorService.setEditor(editor);

        // 注册自动保存
        const autoSaveService = getAutoSaveService();
        autoSaveService.register(documentId, editorService);

        return () => {
            autoSaveService.unregister(documentId);
        };
    }, [documentId, filePath, editor]);

    return null;
}

/**
 * EditorContentPlugin - 编辑器内容管理插件
 *
 * 内容由 FileOpenService.openFile() 通过 EditorService.loadDocument() 加载，
 * 此插件负责：挂载时聚焦到编辑器末尾、切换 tab 时重新聚焦。
 */
function EditorContentPlugin({ documentId }: { documentId: string }) {
    const [editor] = useLexicalComposerContext();

    // 挂载时自动聚焦到编辑器末尾
    useEffect(() => {
        if (!editor) return;

        setTimeout(() => {
            editor.focus(() => {
                editor.update(() => {
                    const root = $getRoot();
                    const lastNode = root.getLastDescendant();
                    if (lastNode) {
                        lastNode.selectEnd();
                    } else {
                        root.selectEnd();
                    }
                });
            });
        }, 0);
    }, [editor]);

    // 监听文档激活事件，切换 tab 时让编辑器获得焦点
    useEffect(() => {
        const container = getContainer();
        const editorTabService = container.get(EditorTabService);

        if (!editorTabService) return;

        const unsubscribe = editorTabService.onDidChangeActive((activeId: string | null) => {
            if (activeId === documentId && editor) {
                editor.focus(() => {
                    editor.update(() => {
                        const root = $getRoot();
                        const lastNode = root.getLastDescendant();
                        if (lastNode) {
                            lastNode.selectEnd();
                        } else {
                            root.selectEnd();
                        }
                    });
                });
            }
        });

        return () => {
            unsubscribe.dispose();
        };
    }, [documentId, editor]);

    return null;
}

interface LexicalEditorProps {
    documentId: string;
    filePath: string;
    className?: string;
    placeholder?: string;
}

/**
 * LexicalEditor 组件内部实现
 */
function LexicalEditorImpl({ documentId, filePath, className, placeholder }: LexicalEditorProps) {
    const contextMenuServiceRef = useRef<ContextMenuService | null>(null);

    // 注册编辑器右键菜单提供者
    useEffect(() => {
        const contextMenuService = getContainer().get(ContextMenuService);
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

    return (
        <LexicalExtensionComposer extension={rootExtension} contentEditable={null}>
            <div className={cn('relative flex h-full flex-col', className)}>
                {/* 工具栏 - 在 composer 内部 */}
                <ToolbarPlugin documentId={documentId} />

                {/* 编辑区域 */}
                <div className="flex-1 overflow-y-auto">
                    <div className="mx-auto max-w-200 px-4 py-6">
                        <ContentEditable
                            className="prose prose-ws min-h-125 max-w-none outline-none"
                            onContextMenu={e => {
                                const contextMenuService = getContainer().get(ContextMenuService);
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
                    </div>
                </div>

                {/* 占位符 */}
                <EditorPlaceholder content={placeholder} />
            </div>

            {/* StatusBarPlugin - 状态栏数据同步 */}
            <StatusBarPlugin documentId={documentId} />

            {/* EditorBridgePlugin - 注入 Lexical 实例到 EditorService */}
            <EditorBridgePlugin documentId={documentId} filePath={filePath} />

            {/* EditorContentPlugin - 编辑器内容管理 */}
            <EditorContentPlugin documentId={documentId} />
        </LexicalExtensionComposer>
    );
}

/**
 * LexicalEditor - 主组件
 *
 * 使用 EditorContainer 管理编辑器实例
 * 文档内容由 FileOpenService.openFile() 直接加载到 EditorService
 */
export function LexicalEditor({
    documentId,
    filePath,
    className,
    placeholder,
}: LexicalEditorProps) {
    return (
        <LexicalEditorImpl
            documentId={documentId}
            filePath={filePath}
            className={className}
            placeholder={placeholder}
        />
    );
}
