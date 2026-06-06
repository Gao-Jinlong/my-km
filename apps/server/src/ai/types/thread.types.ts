/**
 * Thread 相关类型定义
 */

/** Thread 状态 */
export type ThreadStatus = 'active' | 'archived' | 'deleted';

/** 创建 Thread 选项 */
export interface CreateThreadOpts {
    id?: string;
    userId?: string;
    title?: string;
    model?: string;
    provider?: string;
}

/** 更新 Thread 选项 */
export interface UpdateThreadOpts {
    title?: string;
    model?: string;
    provider?: string;
    status?: ThreadStatus;
}

/** 列表查询选项 */
export interface ListThreadOpts {
    limit?: number;
    offset?: number;
    userId?: string;
    status?: ThreadStatus;
}

/** Thread DTO（返回给客户端） */
export interface ThreadDto {
    id: string;
    userId: string | null;
    title: string | null;
    status: ThreadStatus;
    model: string | null;
    provider: string | null;
    createdAt: string;
    updatedAt: string;
}
