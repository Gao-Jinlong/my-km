import type { LangGraphThread } from './langgraph-thread.dto';

/**
 * 内部 Thread 模型需要提供的字段集合（结构化类型，Prisma Thread 行满足此 shape）。
 */
export interface ThreadLike {
    id: string;
    title: string | null;
    status: string;
    model: string | null;
    provider: string | null;
    createdAt: Date;
    updatedAt: Date;
}

/**
 * 将内部 Thread 模型转换为 LangGraph SDK 期望的格式。
 *
 * status 映射：内部 active|archived|deleted → SDK idle
 * （archived/deleted 不会出现在活跃查询中）。
 */
export function toLangGraphThread(thread: ThreadLike): LangGraphThread {
    return {
        thread_id: thread.id,
        metadata: {
            title: thread.title,
            model: thread.model,
            provider: thread.provider,
        },
        created_at: thread.createdAt.toISOString(),
        updated_at: thread.updatedAt.toISOString(),
        status: 'idle',
        values: {},
    };
}
