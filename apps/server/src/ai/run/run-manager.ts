/**
 * RunManager — owner 副本的执行态缓存 + 委托 PG 权威。
 *
 * P1 重构后职责：
 * - 内存缓存 Map<string, RunRecord> 仅是 owner 副本的执行态（abortController/graphIterator）
 * - run 状态/租约/查询的权威读写委托 RunStateRepository（PG）
 * - getActiveRunByThread 委托 PG，返回 RunRow（非 RunRecord）
 * - adoptRun: resume 时把从 RunRow 重建的 RunRecord 注入内存，标记本副本为 owner
 *
 * 缓存可随时丢弃，重建只需读 PG + checkpoint。
 */
import { Injectable, Logger } from '@nestjs/common';
import { RunStatus } from '../types/run.types';
import type { LeaseResult, RunRow } from './lease.types';
import type { RunContext } from './run-context';
import { type RunExecutionSnapshot, RunRecord } from './run-record';
import { RunStateRepository } from './run-state.repository';

const ACTIVE_STATUSES: RunStatus[] = [RunStatus.Pending, RunStatus.Running, RunStatus.Interrupted];

export interface CreateRunOpts {
    /** 抢占租约的副本 ID（owner） */
    replicaId: string;
    /** 运行 traceId（可选，写入 Run.traceId） */
    traceId?: string | null;
}

@Injectable()
export class RunManager {
    private readonly logger = new Logger(RunManager.name);
    /** owner 执行态缓存：runId → RunRecord（仅 owner 副本持有） */
    private readonly runs = new Map<string, RunRecord>();

    constructor(private readonly runStateRepo: RunStateRepository) {}

    async createRun(
        threadId: string,
        runContext: RunContext,
        snapshot: RunExecutionSnapshot,
        opts: CreateRunOpts,
    ): Promise<RunRecord> {
        const id = crypto.randomUUID();
        const record = new RunRecord({ id, threadId, runContext, snapshot });

        this.runs.set(id, record);

        try {
            await this.runStateRepo.createRun({
                id,
                threadId,
                status: RunStatus.Pending,
                model: runContext.llmConfig.model ?? null,
                provider: runContext.llmConfig.provider ?? null,
                inputKind: 'message',
                content: snapshot.content,
                requestContext: snapshot.requestContext ?? null,
                llmConfig: runContext.llmConfig,
                ownerId: opts.replicaId,
                leaseUntil: new Date(Date.now() + 30_000),
                traceId: opts.traceId ?? null,
            });
        } catch (err) {
            this.logger.error(`Failed to persist Run ${id}: ${(err as Error).message}`);
        }

        this.logger.log(`Run created: ${id} for thread: ${threadId}`);
        return record;
    }

    /**
     * 把外部重建的 RunRecord 注入缓存（resume 路径）。
     * 调用方负责确保本副本已成功 acquireLease 成为 owner。
     */
    adoptRun(record: RunRecord): void {
        this.runs.set(record.id, record);
    }

    async setStatus(runId: string, status: RunStatus): Promise<void> {
        const record = this.runs.get(runId);
        if (record) record.setStatus(status);
        try {
            await this.runStateRepo.setStatus(runId, status);
        } catch (err) {
            this.logger.error(`Failed to update Run ${runId} status: ${(err as Error).message}`);
        }
    }

    async finalize(
        runId: string,
        tokenUsage?: { promptTokens: number; completionTokens: number; totalTokens: number },
    ): Promise<void> {
        const record = this.runs.get(runId);
        const usage =
            tokenUsage ??
            (record ? record.finalize() : { promptTokens: 0, completionTokens: 0, totalTokens: 0 });
        try {
            await this.runStateRepo.updateTokenUsage(runId, usage);
        } catch (err) {
            this.logger.error(`Failed to finalize Run ${runId}: ${(err as Error).message}`);
        }
    }

    getRun(runId: string): RunRecord | undefined {
        return this.runs.get(runId);
    }

    /** 委托 PG：返回 thread 上的活跃 RunRow（owner 可能不是本副本）。 */
    async getActiveRunByThread(threadId: string): Promise<RunRow | null> {
        return this.runStateRepo.findActiveRunByThread(threadId);
    }

    async acquireLease(runId: string, replicaId: string): Promise<LeaseResult> {
        return this.runStateRepo.acquireLease(runId, replicaId);
    }

    async releaseLease(runId: string, replicaId: string): Promise<void> {
        return this.runStateRepo.releaseLease(runId, replicaId);
    }

    async cancelRun(runId: string): Promise<void> {
        const run = this.runs.get(runId);
        if (run) {
            run.abort();
            await this.setStatus(runId, RunStatus.Cancelled);
            this.logger.log(`Run cancelled: ${runId}`);
        }
    }

    cleanup(): void {
        for (const [id, run] of this.runs.entries()) {
            if (!ACTIVE_STATUSES.includes(run.status)) {
                this.runs.delete(id);
            }
        }
    }
}
