import type { InFlightToolCall } from '../ai.types';

/**
 * 统一的消息记录结构 — 所有 MessageStoreProvider 必须映射到此格式。
 * MessageStore 业务层只操作此类型，不感知底层存储实现。
 */
export interface MessageRecord {
    id: string;
    roomId: string;
    role: string; // 'user' | 'assistant' | 'tool' | 'system'
    content: string | null;
    toolCalls?: InFlightToolCall[];
    toolResultId?: string;
    tokenCount?: number;
    finishReason?: string;
    metadata?: Record<string, unknown>;
    createdAt: Date;
}

/**
 * Provider 创建输入 — 排除服务端自动生成的字段
 */
export type CreateMessageInput = Omit<MessageRecord, 'id' | 'createdAt'>;

/**
 * Provider 查询选项
 */
export interface FindByRoomOptions {
    limit?: number;
    offset?: number;
    orderBy?: 'asc' | 'desc';
}
