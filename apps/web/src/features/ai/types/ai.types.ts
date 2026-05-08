/**
 * AI 模块共享类型定义
 */

import type { FormatState, Position } from '@/features/editor/types';

/**
 * AI 上下文线格式（前端 → 后端）
 */
export interface AIContextWire {
    documentId: string;
    documentTitle: string;
    documentPath: string;
    selectedText: string | null;
    fullContent: string | null;
    cursorPosition: Position | null;
    formatState: FormatState | null;
}

/**
 * 消息线格式（历史加载用）
 */
export interface MessageWire {
    id: string;
    role: 'user' | 'assistant' | 'tool' | 'system';
    content: string | null;
    toolCalls?: Array<{ name: string }>;
    toolCallId?: string;
    createdAt: string;
}

/**
 * 客户端 → 服务端消息
 */
export type ClientMessage =
    | { type: 'join'; conversationId: string }
    | { type: 'create_conversation'; conversationId: string; title?: string }
    | { type: 'message'; conversationId: string; content: string; context: AIContextWire | null }
    | {
          type: 'tool_result';
          conversationId: string;
          toolCallId: string;
          result: unknown;
          error?: string;
      }
    | { type: 'stop'; conversationId: string };

/**
 * 服务端 → 客户端消息
 */
export type ServerMessage =
    | { type: 'joined'; conversationId: string }
    | { type: 'history'; messages: MessageWire[] }
    | { type: 'stream_chunk'; content: string }
    | { type: 'stream_done' }
    | { type: 'tool_call'; id: string; name: string; arguments: object }
    | { type: 'tool_timeout'; toolCallId: string; message: string }
    | { type: 'error'; message: string; code: string };

/**
 * 工具处理器接口
 */
export interface ToolHandler<TArgs = object, TResult = unknown> {
    name: string;
    description: string;
    inputSchema: object;
    execute: (args: TArgs) => Promise<TResult>;
}
