/**
 * Message 模块类型定义
 */

export interface MessageListItem {
    id: string;
    role: string;
    content: string | null;
    toolCalls?: Array<{ name: string }>;
    toolCallId?: string;
    createdAt: string;
}
