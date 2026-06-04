/**
 * AI 模块共享类型定义
 *
 * 跨层共享的核心类型：LLM 消息、流式输出、工具定义。
 * 无运行时依赖，纯类型。
 */

// ========== LLM 消息 ==========

/**
 * LLM 对话消息（同时兼容 Anthropic 和 OpenAI 格式）
 *
 * - `content` 可以是字符串（OpenAI 风格）或 content block 数组（Anthropic 风格）
 * - `tool_calls` 是 OpenAI 风格的 assistant 消息工具调用
 * - `tool_call_id` 是 OpenAI 风格的 tool 消息关联 ID
 */
export interface LLMMessage {
    role: 'user' | 'assistant' | 'system' | 'tool';

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

    /** OpenAI 风格：tool 消息关联的 tool_call ID */
    tool_call_id?: string;

    /** OpenAI 风格：assistant 消息中的工具调用列表 */
    tool_calls?: Array<{
        id: string;
        name: string;
        arguments: string;
    }>;
}

// ========== LLM 流式输出 ==========

/**
 * LLM provider 的流式输出事件
 */
export interface LLMOutput {
    type: 'text_chunk' | 'tool_call' | 'usage' | 'done';
    /** type === 'text_chunk' 时的内容 */
    content?: string;
    /** type === 'tool_call' 时的工具调用 */
    toolCall?: {
        id: string;
        name: string;
        arguments: Record<string, unknown>;
    };
    /** type === 'usage' 时的 token 用量 */
    usage?: TokenUsage;
}

/**
 * Token 用量统计
 */
export interface TokenUsage {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
}

// ========== 工具定义 ==========

/**
 * LLM 工具定义（发送给 LLM 的 JSON Schema）
 */
export interface ToolDefinition {
    name: string;
    description: string;
    input_schema: Record<string, unknown>;
}

/**
 * 工具调用记录
 */
export interface ToolCall {
    id: string;
    name: string;
    arguments: Record<string, unknown>;
}

/**
 * 活跃的工具调用（带时间戳）
 */
export interface InFlightToolCall extends ToolCall {
    timestamp: Date;
}
