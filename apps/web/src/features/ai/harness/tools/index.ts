/**
 * 前端工具实现 — 从 shared 导入 schema + 提供 execute 逻辑
 */

import {
    getDocumentContentTool,
    getFileTreeTool,
    insertTextTool,
    replaceTextTool,
} from '@workspace/shared/ai';
import { getContainer } from '@/platform/bootstrap';
import { EditorContainer } from '@/platform/editor/container';
import type { ToolHandler } from '../../types/ai.types';

/**
 * 获取文档内容工具
 */
export const getDocumentContentHandler: ToolHandler<
    { documentId: string; selectionOnly?: boolean },
    { success: boolean; content?: string | null; title?: string; error?: string }
> = {
    ...getDocumentContentTool,
    execute: async ({ documentId, selectionOnly }) => {
        const harness = getContainer().get('aiHarness') as any;
        const context = await harness.getContext(documentId);
        if (!context) {
            return { success: false, error: 'Document not found' };
        }
        return {
            success: true,
            content: selectionOnly ? context.selectedText : context.fullContent,
            title: context.documentTitle,
        };
    },
};

/**
 * 获取文件树工具
 */
export const getFileTreeHandler: ToolHandler<
    { maxDepth?: number },
    { success: boolean; tree: unknown[]; note?: string }
> = {
    ...getFileTreeTool,
    execute: async ({ maxDepth = 3 }) => {
        // TODO: 接入 FileSystemService 获取目录树
        return { success: true, tree: [], note: 'File tree not yet implemented' };
    },
};

/**
 * 插入文本工具
 */
export const insertTextHandler: ToolHandler<
    { text: string },
    { success: boolean; error?: string }
> = {
    ...insertTextTool,
    execute: async ({ text }) => {
        const editorContainer = getContainer().get(EditorContainer);
        const editorService = (editorContainer as any).getActiveInstance?.() ?? null;
        if (!editorService) {
            return { success: false, error: 'No active editor' };
        }

        try {
            editorService.focus();
            editorService.insertTextAtCursor?.(text);
            return { success: true };
        } catch (error) {
            return { success: false, error: (error as Error).message };
        }
    },
};

/**
 * 替换文本工具
 */
export const replaceTextHandler: ToolHandler<
    { newText: string },
    { success: boolean; error?: string }
> = {
    ...replaceTextTool,
    execute: async ({ newText }) => {
        const editorContainer = getContainer().get(EditorContainer);
        const editorService = (editorContainer as any).getActiveInstance?.() ?? null;
        if (!editorService) {
            return { success: false, error: 'No active editor' };
        }

        const selection = editorService.getSelection();
        if (!selection?.text) {
            return { success: false, error: 'No text selected' };
        }

        try {
            editorService.replaceSelection?.(newText);
            return { success: true };
        } catch (error) {
            return { success: false, error: (error as Error).message };
        }
    },
};
