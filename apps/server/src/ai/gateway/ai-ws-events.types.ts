/**
 * AI WebSocket Event Types — Server-Client Protocol
 *
 * ClientMessage: Frontend → Backend
 * ServerMessage: Backend → Frontend
 *
 * All events use discriminated union with `type` field.
 */

/**
 * Editor context (collected by frontend, sent with messages)
 */
export interface EditorContext {
    documentId: string;
    documentTitle: string;
    documentPath: string;
    selectedText: string | null;
    fullContent: string | null;
    cursorPosition: { line: number; column: number } | null;
    formatState: Record<string, unknown> | null;
}

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
    | { type: 'send_message'; conversationId: string; content: string; context?: EditorContext }
    | { type: 'tool_result'; conversationId: string; toolCallId: string; result: unknown }
    | { type: 'stop'; conversationId: string }
    | { type: 'join'; conversationId: string };

// === Server → Client ===

export type StatusType = 'thinking' | 'tool_executing' | 'generating';
export type FinishReason = 'complete' | 'max_turns' | 'stopped' | 'error' | 'interrupted';
export type ErrorCode =
    | 'CONVERSATION_NOT_FOUND'
    | 'LLM_UNAVAILABLE'
    | 'LLM_TIMEOUT'
    | 'TOOL_TIMEOUT'
    | 'TOOL_EXECUTION_ERROR'
    | 'CONVERSATION_BUSY';

export type ServerMessage =
    | { type: 'created'; conversationId: string }
    | { type: 'history'; conversationId: string; messages: MessageWire[] }
    | { type: 'text_chunk'; conversationId: string; content: string }
    | {
          type: 'tool_call';
          conversationId: string;
          toolCallId: string;
          toolName: string;
          input: unknown;
          requiresConfirmation: boolean;
      }
    | { type: 'status'; conversationId: string; status: StatusType; message?: string }
    | { type: 'done'; conversationId: string; finishReason: FinishReason; error?: string }
    | { type: 'error'; conversationId: string; code: ErrorCode; message: string };
