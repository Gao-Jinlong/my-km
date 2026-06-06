/**
 * RunManager — Run 生命周期管理
 *
 * 负责：
 * - 创建和追踪活跃的 RunRecord（内存）
 * - 同步写入 Prisma Run 表（持久化）
 * - 按 thread 查找活跃 Run（用于并发控制）
 * - 取消 Run（内存 + DB）
 * - 清理已完成的 Run（释放内存，DB 记录保留）
 *
 * 双写策略：
 * - 内存 Map<string, RunRecord> 用于进程内状态管理和并发控制
 * - Prisma Run 表用于持久化和历史查询
 * - createRun → prisma.run.create()
 * - setStatus → prisma.run.update()
 * - finalize  → prisma.run.update()（token 用量 + completedAt）
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RunStatus } from '../types/run.types';
import type { RunContext } from './run-context';
import { type RunExecutionSnapshot, RunRecord } from './run-record';

const ACTIVE_STATUSES: RunStatus[] = [RunStatus.Pending, RunStatus.Running, RunStatus.Interrupted];

@Injectable()
export class RunManager {
    private readonly logger = new Logger(RunManager.name);
    private readonly runs = new Map<string, RunRecord>();

    constructor(private readonly prisma: PrismaService) {}

    /**
     * 创建新的 RunRecord
     *
     * 同步写入 Prisma Run 表和内存 Map。
     *
     * @param threadId Thread ID
     * @param runContext per-run 上下文快照
     * @param snapshot 执行输入快照
     */
    async createRun(
        threadId: string,
        runContext: RunContext,
        snapshot: RunExecutionSnapshot,
    ): Promise<RunRecord> {
        const id = crypto.randomUUID();

        const record = new RunRecord({
            id,
            threadId,
            runContext,
            snapshot,
        });

        // 写入内存 Map
        this.runs.set(id, record);

        // 同步写入 DB
        try {
            await this.prisma.run.create({
                data: {
                    id,
                    threadId,
                    status: RunStatus.Pending,
                    model: runContext.llmConfig.model ?? null,
                    provider: runContext.llmConfig.provider ?? null,
                },
            });
        } catch (err) {
            this.logger.error(`Failed to persist Run ${id} to DB: ${(err as Error).message}`);
            // DB 写入失败不阻塞内存创建，RunRecord 仍然可用
        }

        this.logger.log(`Run created: ${id} for thread: ${threadId}`);
        return record;
    }

    /**
     * 更新 Run 状态（内存 + DB 同步）
     */
    async setStatus(runId: string, status: RunStatus): Promise<void> {
        const record = this.runs.get(runId);
        if (record) {
            record.setStatus(status);
        }

        // 同步写入 DB
        try {
            const updateData: Record<string, unknown> = { status };

            if (status === RunStatus.Running) {
                updateData.startedAt = new Date();
            }
            if (
                status === RunStatus.Completed ||
                status === RunStatus.Failed ||
                status === RunStatus.Cancelled
            ) {
                updateData.completedAt = new Date();
            }

            await this.prisma.run.update({
                where: { id: runId },
                data: updateData,
            });
        } catch (err) {
            this.logger.error(
                `Failed to update Run ${runId} status in DB: ${(err as Error).message}`,
            );
        }
    }

    /**
     * 完成 Run，写入最终 token 用量
     */
    async finalize(runId: string): Promise<void> {
        const record = this.runs.get(runId);
        if (!record) return;

        const tokenUsage = record.finalize();

        try {
            await this.prisma.run.update({
                where: { id: runId },
                data: {
                    promptTokens: tokenUsage.promptTokens,
                    completionTokens: tokenUsage.completionTokens,
                    totalTokens: tokenUsage.totalTokens,
                },
            });
        } catch (err) {
            this.logger.error(
                `Failed to finalize Run ${runId} token usage in DB: ${(err as Error).message}`,
            );
        }
    }

    /**
     * 获取 RunRecord by ID（内存查找）
     */
    getRun(runId: string): RunRecord | undefined {
        return this.runs.get(runId);
    }

    /**
     * 获取指定 thread 的活跃 Run（内存查找）
     */
    getActiveRunForThread(threadId: string): RunRecord | undefined {
        for (const run of this.runs.values()) {
            if (run.threadId === threadId && ACTIVE_STATUSES.includes(run.status)) {
                return run;
            }
        }
        return undefined;
    }

    /**
     * 取消指定 Run（内存 + DB）
     */
    async cancelRun(runId: string): Promise<void> {
        const run = this.runs.get(runId);
        if (run) {
            run.abort();
            await this.setStatus(runId, RunStatus.Cancelled);
            this.logger.log(`Run cancelled: ${runId}`);
        }
    }

    /**
     * 清理已完成的 Run（仅释放内存，DB 记录保留）
     */
    cleanup(): void {
        for (const [id, run] of this.runs.entries()) {
            if (!ACTIVE_STATUSES.includes(run.status)) {
                this.runs.delete(id);
            }
        }
    }
}
