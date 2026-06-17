/**
 * LangGraph SDK Thread 协议 DTO
 *
 * 对应 @langchain/langgraph-sdk Client 期望的请求/响应格式。
 * 与内部 ThreadDto 区别：用 thread_id / metadata / values 字段名。
 */

/** threads.create() 请求体：{ metadata?, thread_id?, if_exists? } */
export interface CreateThreadBody {
    metadata?: Record<string, unknown>;
    thread_id?: string;
    if_exists?: 'raise' | 'do_nothing';
}

/** threads.search() 请求体：{ metadata?, limit?, offset?, status?, ... } */
export interface SearchThreadsBody {
    metadata?: Record<string, unknown>;
    limit?: number;
    offset?: number;
    status?: 'idle' | 'busy' | 'interrupted' | 'error';
}

/** threads.update() 请求体 */
export interface UpdateThreadBody {
    metadata?: Record<string, unknown>;
}

/** SDK 期望的 Thread 响应格式 */
export interface LangGraphThread {
    thread_id: string;
    metadata: Record<string, unknown>;
    created_at: string;
    updated_at: string;
    status: 'idle' | 'busy' | 'interrupted' | 'error';
    values: Record<string, unknown>;
}
