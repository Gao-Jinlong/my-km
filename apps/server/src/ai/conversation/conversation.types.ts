/**
 * Conversation 模块类型定义
 */

export type ConversationStatus = 'active' | 'archived' | 'deleted';

export interface CreateConversationOpts {
    id?: string; // 前端生成的 ID（如 nanoid），可选
    userId?: string;
    title?: string;
    model?: string;
    provider?: string;
}

export interface UpdateConversationOpts {
    title?: string;
    model?: string;
    provider?: string;
    status?: ConversationStatus;
}

export interface ListOpts {
    limit?: number;
    offset?: number;
    status?: ConversationStatus;
}

export interface ConversationStats {
    total: number;
    active: number;
    tokenUsage: number;
}
