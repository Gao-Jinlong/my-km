/**
 * ToolDefinitions — 共享 schema 转 LangChain Tool 实例
 *
 * 这些"前端工具"在后端不真正执行：tool-node.ts 通过 LangGraph `interrupt()`
 * 暂停 graph，等待前端通过 SDK `command.resume` 提供结果。
 */

import { type StructuredToolInterface, tool } from '@langchain/core/tools';
import { docEditTool, docReadTool, fileOpsTool, searchTool } from '@my-km/shared';
import { z } from 'zod';

/**
 * 前端工具名称集合 — 这些工具需要前端执行，触发 interrupt
 */
export const FRONTEND_TOOLS = new Set([
    'file_ops',
    'doc_read',
    'doc_edit',
    'search',
]);

function _makeFrontendTool(def: {
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
}): StructuredToolInterface {
    return tool(
        async () => {
            throw new Error(
                `Frontend tool "${def.name}" should be executed by client via LangGraph interrupt/resume, not invoked server-side`,
            );
        },
        {
            name: def.name,
            description: def.description,
            schema: z.any(),
        },
    );
}

export const frontendTools: StructuredToolInterface[] = [
    _makeFrontendTool(fileOpsTool),
    _makeFrontendTool(docReadTool),
    _makeFrontendTool(docEditTool),
    _makeFrontendTool(searchTool),
];

export function isFrontendTool(toolName: string): boolean {
    return FRONTEND_TOOLS.has(toolName);
}
