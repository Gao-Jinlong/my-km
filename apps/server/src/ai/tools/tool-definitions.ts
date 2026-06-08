/**
 * ToolDefinitions — 共享 schema 转 LangChain Tool 实例
 *
 * 重构(Plan A1):
 * 这些"前端工具"在后端不真正执行,所以 tool function 永远不会被调用
 * (`tool-node.ts` 通过 LangGraph `interrupt()` 暂停 graph,
 *  等待前端通过 SDK `command.resume` 提供结果)。
 *
 * `tool()` 工厂在这里只是为了:
 *   1. 给 ChatModel.bindTools() 提供 LangChain Tool 实例
 *   2. 把 JSON Schema(zod-compatible)挂载到工具上,
 *      让 LLM 知道工具签名
 */

import { type StructuredToolInterface, tool } from '@langchain/core/tools';
import {
    getDocumentContentTool,
    getFileTreeTool,
    insertTextTool,
    replaceTextTool,
} from '@my-km/shared';
import { z } from 'zod';

/**
 * 前端工具名称集合 — 这些工具需要前端执行,触发 interrupt
 */
export const FRONTEND_TOOLS = new Set([
    'get_document_content',
    'get_file_tree',
    'insert_text',
    'replace_text',
]);

/**
 * 把 JSON Schema 包装成最宽松的 zod schema(`z.any()`)
 *
 * 我们不需要真正校验入参(LLM 输出由 ChatModel 自身按工具 schema 校验);
 * 这里只是把工具签名暴露给 bindTools()。
 */
function _makeFrontendTool(def: {
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
}): StructuredToolInterface {
    return tool(
        async () => {
            // 永远不会执行:tool-node 在 LLM 决定调用前端工具时
            // 通过 interrupt() 暂停 graph,等待前端 resume
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

/**
 * 所有前端工具 — 供 ChatModel.bindTools() 使用
 */
export const frontendTools: StructuredToolInterface[] = [
    // _makeFrontendTool(getDocumentContentTool),
    // _makeFrontendTool(getFileTreeTool),
    // _makeFrontendTool(insertTextTool),
    // _makeFrontendTool(replaceTextTool),
];

/**
 * 检查工具是否为前端工具(需要 interrupt)
 */
export function isFrontendTool(toolName: string): boolean {
    return FRONTEND_TOOLS.has(toolName);
}
