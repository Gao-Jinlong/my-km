/**
 * 工作流类型定义
 *
 * 重构(Plan A1):
 * - state.messages 改用 LangChain `MessagesAnnotation`(BaseMessage[] + messagesStateReducer)
 * - 删除冗余的 lastAssistantMessage/hasToolCalls/pendingToolCalls/toolResults
 *   (这些信息已包含在 BaseMessage.tool_calls / ToolMessage 中)
 * - 路由直接基于最后一条 AIMessage 的 tool_calls 字段判断
 */

import type { BaseMessage } from '@langchain/core/messages';
import type { RunnableConfig } from '@langchain/core/runnables';
import { Annotation, MessagesAnnotation } from '@langchain/langgraph';

/**
 * Minimal interface for a compiled workflow graph.
 */
export interface CompiledWorkflowGraph {
    stream(
        input: Partial<WorkflowState>,
        options?: Partial<{ configurable: Partial<GraphConfig> }> & {
            streamMode?: string | string[];
            subgraphs?: boolean;
        },
    ): Promise<AsyncIterable<unknown>>;
    invoke(
        input: Partial<WorkflowState>,
        options?: Partial<{ configurable: Partial<GraphConfig> }>,
    ): Promise<unknown>;
    withConfig(config: RunnableConfig): this;
}

/**
 * 单个 LLM 配置(工作流包内部定义,避免循环依赖)
 */
export interface WorkflowLLMConfig {
    provider: string;
    model: string;
    temperature?: number;
    maxTokens?: number;
    [key: string]: unknown;
}

export type NodeLLMConfigMap = Record<string, WorkflowLLMConfig>;

export type NodeId = string;

export interface NodeContext {
    nodeId: NodeId;
    threadId: string;
    sessionId?: string;
    abortSignal?: AbortSignal;
    metadata?: Record<string, unknown>;
}

/**
 * LangGraph configurable 上下文
 * 通过 graph.stream(input, { configurable: { ... } }) 传入
 */
export interface GraphConfig {
    /** LangChain ChatModel 实例(已 bindTools) */
    // biome-ignore lint/suspicious/noExplicitAny: BaseChatModel
    chatModel: any;
    /** 工具列表(LangChain Tool 实例) */
    // biome-ignore lint/suspicious/noExplicitAny: LangChain Tool type
    tools?: any[];
    /** 中止信号 */
    abortSignal?: AbortSignal;
    /** OTel: LLM provider（用于 span attributes） */
    provider?: string;
    /** OTel: LLM model（用于 span attributes） */
    model?: string;
    /** OTel: 第几轮 LLM 调用（用于 span attributes） */
    llmRound?: number;
}

/**
 * 工作流状态 — 基于 MessagesAnnotation
 *
 * MessagesAnnotation.spec.messages 提供:
 * - 字段: BaseMessage[]
 * - reducer: messagesStateReducer(支持 id 去重、RemoveMessage 等语义)
 *
 * 额外字段:
 * - threadId: 当前 thread 标识(由 runtime 注入)
 * - error: 节点错误信息(由 llm-node 在异常时写入)
 */
export const WorkflowStateAnnotation = Annotation.Root({
    ...MessagesAnnotation.spec,
    threadId: Annotation<string>,
    error: Annotation<string | undefined>,
});

export interface WorkflowState {
    messages: BaseMessage[];
    threadId: string;
    error: string | undefined;
}
