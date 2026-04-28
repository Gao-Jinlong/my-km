/**
 * AIPanel 工具注册设置
 *
 * 将前端工具注册到 AIHarnessService。
 */

import type { AIHarnessService } from '@/features/ai/harness';
import {
    getDocumentContentHandler,
    getFileTreeHandler,
    insertTextHandler,
    replaceTextHandler,
} from '@/features/ai/harness/tools';
import type { ToolHandler } from '@/features/ai/types/ai.types';

/**
 * 注册所有默认工具到 harness
 */
export function registerDefaultTools(harness: AIHarnessService): void {
    harness.registerTool('getDocumentContent', getDocumentContentHandler as ToolHandler);
    harness.registerTool('getFileTree', getFileTreeHandler as ToolHandler);
    harness.registerTool('insertText', insertTextHandler as ToolHandler);
    harness.registerTool('replaceText', replaceTextHandler as ToolHandler);
}
