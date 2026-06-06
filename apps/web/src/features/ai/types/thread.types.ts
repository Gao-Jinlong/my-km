/**
 * Thread 记录类型
 *
 * 由 ConversationItem 和 ConversationList 使用。
 * 与后端 ThreadService 返回的内部 Thread 形态对齐。
 *
 * 注意：LangGraph SDK 的 Thread 类型使用 thread_id / metadata 字段，
 * 需要 ConversationList.toThreadRecord() 做格式转换。
 */
export interface ThreadRecord {
    id: string;
    userId: string | null;
    title: string | null;
    status: 'active' | 'archived' | 'deleted';
    model: string | null;
    provider: string | null;
    messageCount: number;
    createdAt: string;
    updatedAt: string;
}
