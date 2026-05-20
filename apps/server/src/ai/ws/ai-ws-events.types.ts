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

/**
 * LLM configuration sent from frontend with messages
 */
export interface LlmConfig {
    provider: string;
    model?: string;
}

// === Client → Server ===

export enum ClientMessageType {
    CreateAndSend = 'create_and_send',
    SendMessage = 'send_message',
    Join = 'join',
    Stop = 'stop',
    ToolResult = 'tool_result',
}

/** Transport-level message types (not part of ClientMessage protocol). */
export enum TransportMessageType {
    Disconnect = 'disconnect',
}

export type ClientMessage =
    | {
          type: ClientMessageType.CreateAndSend;
          content: string;
          context?: EditorContext;
          llmConfig?: LlmConfig;
      }
    | {
          type: ClientMessageType.SendMessage;
          roomId: string;
          content: string;
          context?: EditorContext;
          llmConfig?: LlmConfig;
      }
    | { type: ClientMessageType.ToolResult; roomId: string; toolCallId: string; result: unknown }
    | { type: ClientMessageType.Stop; roomId: string }
    | { type: ClientMessageType.Join; roomId: string };

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
