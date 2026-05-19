/**
 * Executor types — Phase 4 rewrite.
 *
 * Defines the per-execution context, callbacks, and dependency bundle.
 */

import type { FinishReason } from '../gateway/ai-ws-events.types';
import type { MessageService } from '../message/message.service';
import type { NodeLLMConfigMap } from '../provider/provider.types';
import type { ToolDispatcher } from '../tools/tool.dispatcher';
import type { ToolRouter } from '../tools/tool-router';
import type { GraphRegistry } from './graph-registry';
import type { LLMResolver } from './llm-resolver';

/**
 * Tool call info emitted during execution.
 */
export interface WorkflowToolCall {
    toolCallId: string;
    toolName: string;
    input: unknown;
    requiresConfirmation: boolean;
}

/**
 * Callback interface for Executor events.
 * Decouples Executor from the transport layer (FSM/WebSocket).
 */
export interface WorkflowCallbacks {
    onTextChunk(roomId: string, content: string): void;
    onToolCall(roomId: string, info: WorkflowToolCall): void;
    onLlmDone(roomId: string, finishReason?: FinishReason): void;
    onError(roomId: string, code: string, message: string): void;
    onStop?(roomId: string): void;
}

/**
 * Execution context — passed to Executor constructor.
 * Created per-request by RequestDispatcher.
 */
export interface ExecutionCtx {
    roomId: string;
    clientId: string;
    content: string;
    callbacks: WorkflowCallbacks;
    abortSignal: AbortSignal;
    llmConfigMap?: NodeLLMConfigMap;
    graphName?: string;
    tokenLimit?: number;
}

/**
 * Dependencies bundle — injected services Executor needs.
 * Passed from RequestDispatcher to keep Executor testable without NestJS DI.
 */
export interface ExecutorDependencies {
    messageService: MessageService;
    graphRegistry: GraphRegistry;
    llmResolver: LLMResolver;
    toolDispatcher: ToolDispatcher;
    toolRouter: ToolRouter;
}
