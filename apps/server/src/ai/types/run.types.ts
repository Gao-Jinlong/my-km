/**
 * Run 相关类型定义
 */

/** Run 状态 */
export enum RunStatus {
    Pending = 'pending',
    Running = 'running',
    Interrupted = 'interrupted',
    Completed = 'completed',
    Failed = 'failed',
    Cancelled = 'cancelled',
}

/** 并发策略 */
export enum ConcurrencyPolicy {
    Rejected = 'rejected',
    Interrupt = 'interrupt',
    Rollback = 'rollback',
}

/** Run 记录（用于返回给客户端） */
export interface RunDto {
    id: string;
    threadId: string;
    status: RunStatus;
    model?: string;
    provider?: string;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    startedAt?: string;
    completedAt?: string;
    createdAt: string;
}
