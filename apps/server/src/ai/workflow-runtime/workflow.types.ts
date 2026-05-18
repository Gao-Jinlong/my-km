/**
 * 工作流运行时类型定义（server 侧）
 */

import type { LLMConfig, NodeLLMConfigMap } from '../provider/provider.types';

/**
 * Tool call information emitted from WorkflowExecutor.
 */
export interface WorkflowToolCall {
    toolCallId: string;
    toolName: string;
    input: unknown;
    requiresConfirmation: boolean;
}

/**
 * Callback interface for WorkflowExecutor events.
 * Allows the business layer to signal lifecycle events without
 * depending on the transport layer (RoomStateMachine).
 */
export interface WorkflowCallbacks {
    onTextChunk(roomId: string, content: string): void;
    onToolCall(roomId: string, info: WorkflowToolCall): void;
    onLlmDone(roomId: string): void;
    onError(roomId: string, code: string, message: string): void;
    onStop?(roomId: string): void;
}

/**
 * 工作流执行上下文
 */
export interface WorkflowExecutionContext {
    roomId: string;
    sessionId: string;
    content: string;
    llmConfigMap?: NodeLLMConfigMap;
    defaultLlmConfig?: LLMConfig;
    tokenLimit?: number;
    abortSignal?: AbortSignal;
    /** Callbacks for emitting lifecycle events (injected by the transport layer). */
    callbacks?: WorkflowCallbacks;
}

/**
 * 工作流执行结果
 */
export interface WorkflowExecutionResult {
    success: boolean;
    assistantMessage: string;
    error?: string;
}
