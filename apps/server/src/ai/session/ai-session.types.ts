/**
 * AISession 类型定义
 */

export type AISessionStatus =
    | 'pending'
    | 'streaming'
    | 'waiting_tool'
    | 'completed'
    | 'error'
    | 'aborted';

export interface AISession {
    id: string; // `${clientId}:${roomId}`
    roomId: string;
    clientId: string;
    status: AISessionStatus;
    abortController: AbortController;
    startedAt: Date;
    lastActivityAt: Date;
}

export interface CreateAISessionOpts {
    roomId: string;
    clientId: string;
}
