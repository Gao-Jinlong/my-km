/**
 * Tool 模块类型定义
 */

import type { ToolDefinition } from '../ai.types';

/**
 * Where the tool is executed
 */
export type ToolExecution = 'backend' | 'frontend';

/**
 * Danger level for backend tools (controls user confirmation)
 * Only meaningful when execution === 'backend'
 */
export type ToolDanger = 'low' | 'high';

export interface RegisteredTool {
    name: string;
    definition: ToolDefinition;
    execution?: ToolExecution;
    danger?: ToolDanger;
}
