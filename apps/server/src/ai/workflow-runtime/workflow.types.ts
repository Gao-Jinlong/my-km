/**
 * 工作流运行时类型定义（server 侧）
 */

import type { LLMConfig, NodeLLMConfigMap } from '../provider/provider.types';

/**
 * 工作流执行上下文
 */
export interface WorkflowExecutionContext {
    conversationId: string;
    sessionId: string;
    content: string;
    llmConfigMap?: NodeLLMConfigMap;
    defaultLlmConfig?: LLMConfig;
    tokenLimit?: number;
    abortSignal?: AbortSignal;
}

/**
 * 工作流执行结果
 */
export interface WorkflowExecutionResult {
    success: boolean;
    assistantMessage: string;
    error?: string;
}
