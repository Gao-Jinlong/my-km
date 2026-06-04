/**
 * ToolDefinitions — 从共享 schema 转换为后端 ToolDefinition 格式
 *
 * 将 packages/shared 中的工具 schema 转换为 LLM Provider 期望的
 * { name, description, input_schema } 格式。
 *
 * 这些定义会注入 SSEExecutor，发送给 LLM 作为 tool call 协议的一部分。
 */

import {
    getDocumentContentTool,
    getFileTreeTool,
    insertTextTool,
    replaceTextTool,
} from '@my-km/shared';
import type { ToolDefinition } from '../types/ai.types';

/**
 * 前端工具名称集合 — 这些工具需要前端执行，触发 interrupt
 */
export const FRONTEND_TOOLS = new Set([
    'get_document_content',
    'get_file_tree',
    'insert_text',
    'replace_text',
]);

/**
 * 将共享 schema 的 inputSchema 字段映射为后端的 input_schema 字段
 */
function toToolDefinition(tool: {
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
}): ToolDefinition {
    return {
        name: tool.name,
        description: tool.description,
        input_schema: tool.inputSchema as Record<string, unknown>,
    };
}

/**
 * 所有前端工具定义 — 发送给 LLM
 */
export const frontendToolDefinitions: ToolDefinition[] = [
    toToolDefinition(getDocumentContentTool),
    toToolDefinition(getFileTreeTool),
    toToolDefinition(insertTextTool),
    toToolDefinition(replaceTextTool),
];

/**
 * 检查工具是否为前端工具（需要 interrupt）
 */
export function isFrontendTool(toolName: string): boolean {
    return FRONTEND_TOOLS.has(toolName);
}
