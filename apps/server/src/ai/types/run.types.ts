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

/**
 * 并发策略 — 对齐 LangGraph Platform 协议 multitask_strategy 字面量
 *
 * - 'reject'    — 拒绝新 run（默认）
 * - 'interrupt' — 中断当前 run，启动新 run
 * - 'rollback'  — 中断 + 回滚 checkpoint（rollback 语义 TODO）
 * - 'enqueue'   — 排队（当前未实现真正的队列，fallback 到 'reject' 并 logger.warn）
 *
 * 详见 LangGraph 文档：https://langchain-ai.github.io/langgraph/cloud/concepts/api/
 */
export type MultitaskStrategy = 'reject' | 'interrupt' | 'rollback' | 'enqueue';

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
