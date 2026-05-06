/**
 * Connection 模块类型定义
 */

export interface ClientMessage {
    type: string;
    conversationId?: string;
    content?: string;
    context?: Record<string, unknown>;
    toolCallId?: string;
    result?: unknown;
    error?: string;
}

export interface ServerEvent {
    type: string;
    [key: string]: unknown;
}
