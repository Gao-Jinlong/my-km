/**
 * AI 模块共享类型定义
 *
 * Updated 2026-05-12: New event protocol with discriminated unions.
 * All events include roomId. Events are single-responsibility.
 */

import type { FormatState, Position } from '@/features/editor/types';

/**
 * Editor context (collected by frontend, sent with messages)
 */
export interface EditorContext {
    documentId: string;
    documentTitle: string;
    documentPath: string;
    selectedText: string | null;
    fullContent: string | null;
    cursorPosition: Position | null;
    formatState: FormatState | null;
}

/** @deprecated Use EditorContext instead */
export type AIContextWire = EditorContext;

/**
 * Message wire format for history
 */
export interface MessageWire {
    id: string;
    role: 'user' | 'assistant' | 'tool' | 'system';
    content: string | null;
    toolCalls?: Array<{ id: string; name: string }>;
    toolCallId?: string;
    createdAt: string;
}

// === Client → Server ===

export type ClientMessage =
    | { type: 'create_and_send'; content: string; context?: EditorContext }
    | { type: 'send_message'; roomId: string; content: string; context?: EditorContext }
    | { type: 'tool_result'; roomId: string; toolCallId: string; result: unknown }
    | { type: 'stop'; roomId: string }
    | { type: 'join'; roomId: string };

// === Server → Client ===

export type StatusType = 'thinking' | 'tool_executing' | 'generating';
export type FinishReason = 'complete' | 'max_turns' | 'stopped' | 'error' | 'interrupted';
export type ErrorCode =
    | 'ROOM_NOT_FOUND'
    | 'LLM_UNAVAILABLE'
    | 'LLM_TIMEOUT'
    | 'TOOL_TIMEOUT'
    | 'TOOL_EXECUTION_ERROR'
    | 'ROOM_BUSY';

export type ServerMessage =
    | { type: 'created'; roomId: string }
    | { type: 'history'; roomId: string; messages: MessageWire[] }
    | { type: 'text_chunk'; roomId: string; content: string }
    | {
          type: 'tool_call';
          roomId: string;
          toolCallId: string;
          toolName: string;
          input: unknown;
          requiresConfirmation: boolean;
      }
    | { type: 'status'; roomId: string; status: StatusType; message?: string }
    | { type: 'done'; roomId: string; finishReason: FinishReason; error?: string }
    | { type: 'error'; roomId: string; code: ErrorCode; message: string };

// === Legacy type kept for backward compatibility during migration ===
/** @deprecated Use ServerMessage instead */
export type LegacyServerMessage = {
    type:
        | 'joined'
        | 'history'
        | 'stream_chunk'
        | 'stream_done'
        | 'tool_call'
        | 'tool_timeout'
        | 'error';
} & Record<string, unknown>;

/**
 * 工具处理器接口
 */
export interface ToolHandler<TArgs = object, TResult = unknown> {
    name: string;
    description: string;
    inputSchema: object;
    execute: (args: TArgs) => Promise<TResult>;
}
