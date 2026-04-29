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
import { FileSystemService } from '@/platform/file-system/service';
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
        const harness = getContainer().get('aiHarness') as import('../index').AIHarnessService;
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
        try {
            const fileSystem = getContainer().get(FileSystemService);
            const files = await fileSystem.listFiles('/');
            const tree = buildFileTree(files, maxDepth, 0);
            return { success: true, tree };
        } catch (error) {
            return {
                success: false,
                tree: [],
                note: (error as Error).message,
            };
        }
    },
};

/**
 * 递归构建文件树
 */
function buildFileTree(
    files: Array<{ name: string; type: string; path?: string }>,
    maxDepth: number,
    currentDepth: number,
): unknown[] {
    if (currentDepth >= maxDepth) {
        return [];
    }
    return files.map(file => {
        const node: { name: string; type: string; children?: unknown[] } = {
            name: file.name,
            type: file.type,
        };
        if (file.type === 'directory' && file.path) {
            try {
                const fileSystem = getContainer().get(FileSystemService);
                fileSystem.listFiles(file.path);
                node.children = [];
            } catch {
                node.children = [];
            }
        }
        return node;
    });
}

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
        const editorService = editorContainer.getActiveInstance();
        if (!editorService) {
            return { success: false, error: 'No active editor' };
        }

        try {
            editorService.insertTextAtCursor(text);
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
        const editorService = editorContainer.getActiveInstance();
        if (!editorService) {
            return { success: false, error: 'No active editor' };
        }

        const selection = editorService.getSelection();
        if (!selection?.text) {
            return { success: false, error: 'No text selected' };
        }

        try {
            editorService.replaceSelection(newText);
            return { success: true };
        } catch (error) {
            return { success: false, error: (error as Error).message };
        }
    },
};
