/**
 * Tool 模块类型定义
 */

import type { ToolDefinition } from '../ai.types';

export interface ToolResultPayload {
    toolCallId: string;
    result: unknown;
    error?: string;
}

export interface RegisteredTool {
    name: string;
    definition: ToolDefinition;
}
