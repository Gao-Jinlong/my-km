/**
 * 工作流类型定义
 *
 * 纯类型定义，无运行时依赖。供 server 侧和 graph 定义共享。
 */

import { Annotation } from '@langchain/langgraph';

/**
 * 单个 LLM 配置（工作流包内部定义，避免循环依赖）
 */
export interface WorkflowLLMConfig {
    provider: string;
    model: string;
    temperature?: number;
    maxTokens?: number;
    [key: string]: unknown;
}

/**
 * 节点级 LLM 配置映射（运行时注入）
 */
export type NodeLLMConfigMap = Record<string, WorkflowLLMConfig>;

/**
 * 工作流节点标识
 */
export type NodeId = string;

/**
 * 节点执行上下文
 */
export interface NodeContext {
    /** 当前节点 ID */
    nodeId: NodeId;
    /** 对话 ID */
    conversationId: string;
    /** 会话 ID */
    sessionId?: string;
    /** 中止信号 */
    abortSignal?: AbortSignal;
    /** 自定义上下文数据 */
    metadata?: Record<string, unknown>;
}

/**
 * LangGraph configurable 上下文
 * 通过 graph.stream(input, { configurable: { ... } }) 传入
 */
export interface GraphConfig {
    /** LLM 调用函数 — 由 server 侧注入 */
    llmCaller: LLMCaller;
    /** 工具定义列表 */
    tools?: ToolDefinition[];
    /** 中止信号 */
    abortSignal?: AbortSignal;
    /** 节点级回调，用于流式输出推送 */
    onChunk?: (content: string) => void;
}

/**
 * LLM 调用函数签名
 * 由 server 侧创建并传入 LangGraph 节点
 */
export type LLMCaller = (
    messages: WorkflowMessage[],
    abortSignal?: AbortSignal,
) => AsyncIterable<LLMStreamEvent>;

/**
 * LLM 输出流式事件
 */
export interface LLMStreamEvent {
    type: 'text_chunk' | 'tool_call' | 'done';
    content?: string;
    toolCall?: {
        id: string;
        name: string;
        arguments: Record<string, unknown>;
    };
}

/**
 * 工具定义（发送给 LLM 的 JSON Schema）
 */
export interface ToolDefinition {
    name: string;
    description: string;
    input_schema: Record<string, unknown>;
}

/**
 * 工作流消息格式
 * 兼容 LLM API 格式，但序列化存储在状态中
 */
export interface WorkflowMessage {
    role: 'user' | 'assistant' | 'tool';
    content:
        | string
        | Array<{
              type: 'text' | 'tool_use' | 'tool_result';
              text?: string;
              id?: string;
              name?: string;
              input?: Record<string, unknown>;
              tool_use_id?: string;
              content?: string;
          }>;
}

/**
 * 工作流基础状态
 */
export const WorkflowStateAnnotation = Annotation.Root({
    /** 用户输入消息 */
    messages: Annotation<WorkflowMessage[]>({
        reducer: (existing: WorkflowMessage[], update: WorkflowMessage[]) => [
            ...existing,
            ...update,
        ],
        default: () => [],
    }),
    /** 当前对话 ID */
    conversationId: Annotation<string>,
    /** 最后一条助手回复 */
    lastAssistantMessage: Annotation<string>,
    /** 是否包含工具调用 */
    hasToolCalls: Annotation<boolean>,
    /** 待执行的工具调用列表 */
    pendingToolCalls: Annotation<
        Array<{
            id: string;
            name: string;
            arguments: Record<string, unknown>;
        }>
    >({
        reducer: (_existing, update) => update,
        default: () => [],
    }),
    /** 工具调用执行结果 */
    toolResults: Annotation<Record<string, unknown>>({
        reducer: (existing, update) => ({ ...existing, ...update }),
        default: () => ({}),
    }),
    /** 错误信息 */
    error: Annotation<string | undefined>,
    /** 工作流是否完成 */
    isDone: Annotation<boolean>,
});

export type WorkflowState = typeof WorkflowStateAnnotation.State;

/**
 * LLM 调用结果
 */
export interface LLMCallResult {
    text: string;
    toolCalls: Array<{
        id: string;
        name: string;
        arguments: Record<string, unknown>;
    }>;
}
