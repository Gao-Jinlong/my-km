/**
 * 工作流类型定义
 *
 * 纯类型定义，无运行时依赖。供 server 侧和 graph 定义共享。
 */

import type { RunnableConfig } from '@langchain/core/runnables';
import { Annotation } from '@langchain/langgraph';
import type {
    LLMMessage as AiLLMMessage,
    ToolDefinition as AiToolDefinition,
    LLMOutput,
} from '../../ai.types';

/**
 * Minimal interface for a compiled workflow graph.
 * CompiledStateGraph has deep generics (including specific node name literals) that
 * cannot be safely widened, so we type only the methods the executor actually uses.
 */
export interface CompiledWorkflowGraph {
    stream(
        input: Partial<WorkflowState>,
        options?: Partial<{ configurable: Partial<GraphConfig> }>,
    ): Promise<AsyncIterable<Partial<WorkflowState>>>;
    invoke(
        input: Partial<WorkflowState>,
        options?: Partial<{ configurable: Partial<GraphConfig> }>,
    ): Promise<unknown>;
    withConfig(config: RunnableConfig): this;
}

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
    /** 房间 ID */
    roomId: string;
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
    messages: LLMMessage[],
    abortSignal?: AbortSignal,
) => AsyncIterable<LLMOutput>;

/**
 * 工作流基础状态
 */
export const WorkflowStateAnnotation = Annotation.Root({
    /** 用户输入消息 */
    messages: Annotation<LLMMessage[]>({
        reducer: (existing: LLMMessage[], update: LLMMessage[]) => [...existing, ...update],
        default: () => [],
    }),
    /** 当前房间 ID */
    roomId: Annotation<string>,
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

export interface WorkflowState {
    /** 用户输入消息 */
    messages: LLMMessage[];
    /** 当前房间 ID */
    roomId: string;
    /** 最后一条助手回复 */
    lastAssistantMessage: string;
    /** 是否包含工具调用 */
    hasToolCalls: boolean;
    /** 待执行的工具调用列表 */
    pendingToolCalls: Array<{
        id: string;
        name: string;
        arguments: Record<string, unknown>;
    }>;
    /** 工具调用执行结果 */
    toolResults: Record<string, unknown>;
    /** 错误信息 */
    error: string | undefined;
    /** 工作流是否完成 */
    isDone: boolean;
}

/**
 * 向后兼容别名 — 指向 ai.types.ts 中的统一类型
 */
export type LLMMessage = AiLLMMessage;
export type WorkflowMessage = LLMMessage;
export type LLMStreamEvent = LLMOutput;
export type ToolDefinition = AiToolDefinition;

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
