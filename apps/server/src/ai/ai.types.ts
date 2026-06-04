/**
 * AI 模块类型定义
 */

/**
 * LLM 输出流式片段
 */
export interface LLMOutput {
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
 *
 * 单一类型定义源，供 llm/ 和 langgraph/ 模块共享使用。
 */
export interface ToolDefinition {
    name: string;
    description: string;
    input_schema: Record<string, unknown>;
}

/**
 * 对话消息（LLM API 格式）
 */
export interface LLMMessage {
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
    /** OpenAI 格式：tool 消息关联的 tool_call ID */
    tool_call_id?: string;
    /** OpenAI 格式：assistant 消息中的工具调用列表 */
    tool_calls?: Array<{
        id: string;
        name: string;
        arguments: string;
    }>;
}

/**
 * 活跃的工具调用
 */
export interface InFlightToolCall {
    id: string;
    name: string;
    arguments: Record<string, unknown>;
    timestamp: Date;
}
