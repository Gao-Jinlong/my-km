/**
 * RunStateRepository — Run 状态的 PG 权威读写层。
 *
 * P1 权威源：所有 run 状态查询/变更经此仓储，PG 为唯一权威。
 * 进程内 RunManager 仅作 owner 执行态缓存，委托此仓储读写持久态。
 */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { LeaseResult, RunRow } from './lease.types';

const ACTIVE_STATUSES = ['pending', 'running', 'interrupted'];

/** 默认租约 TTL（spec 2.4：30s 租约）—— acquireLease 与 heartbeat 共用 */
const DEFAULT_LEASE_TTL_MS = 30_000;

export interface CreateRunInput {
    id: string;
    threadId: string;
    status: string;
    model: string | null;
    provider: string | null;
    inputKind: string;
    content: string | null;
    requestContext: unknown;
    llmConfig: unknown;
    ownerId: string;
    leaseUntil: Date;
    traceId: string | null;
}

@Injectable()
export class RunStateRepository {
    constructor(private readonly prisma: PrismaService) {}

    findById(runId: string) {
        return this.prisma.run.findUnique({ where: { id: runId } });
    }

    findActiveRunByThread(threadId: string) {
        return this.prisma.run.findFirst({
            where: { threadId, status: { in: ACTIVE_STATUSES } },
            orderBy: { createdAt: 'desc' },
        });
    }

    async createRun(input: CreateRunInput): Promise<RunRow> {
        return this.prisma.run.create({
            data: {
                id: input.id,
                threadId: input.threadId,
                status: input.status,
                model: input.model,
                provider: input.provider,
                assistantId: 'default',
                inputKind: input.inputKind,
                content: input.content,
                requestContext: input.requestContext as never,
                llmConfig: input.llmConfig as never,
                ownerId: input.ownerId,
                leaseUntil: input.leaseUntil,
                lastSeq: 0,
                traceId: input.traceId,
            },
        });
    }

    async setStatus(runId: string, status: string): Promise<void> {
        const data: Record<string, unknown> = { status };
        if (status === 'running') data.startedAt = new Date();
        if (status === 'completed' || status === 'failed' || status === 'cancelled') {
            data.completedAt = new Date();
        }
        await this.prisma.run.update({ where: { id: runId }, data });
    }

    async saveResumePayload(runId: string, payload: unknown): Promise<void> {
        await this.prisma.run.update({
            where: { id: runId },
            data: { resumePayload: payload as never },
        });
    }

    async updateLastSeq(runId: string, lastSeq: number): Promise<void> {
        await this.prisma.run.update({ where: { id: runId }, data: { lastSeq } });
    }

    /**
     * 乐观租约抢占：单条带条件 WHERE 的 updateMany 由 PG 行锁保证原子性。
     * 仅当 row 当前可抢占（ownerId IS NULL | 是自己 | lease 已过期）时才写入 ownerId。
     * count===0 即抢占失败（有活跃的他人 owner）。Prisma updateMany 无 RETURNING，
     * 故成功后再 findUnique 取最新 run 行。
     */
    async acquireLease(
        runId: string,
        replicaId: string,
        ttlMs = DEFAULT_LEASE_TTL_MS,
    ): Promise<LeaseResult> {
        const leaseUntil = new Date(Date.now() + ttlMs);
        const result = await this.prisma.run.updateMany({
            where: {
                id: runId,
                OR: [{ ownerId: null }, { ownerId: replicaId }, { leaseUntil: { lt: new Date() } }],
            },
            data: { ownerId: replicaId, leaseUntil },
        });
        if (result.count === 0) {
            const current = await this.prisma.run.findUnique({
                where: { id: runId },
                select: { ownerId: true, leaseUntil: true },
            });
            return {
                acquired: false,
                run: null,
                conflict: current
                    ? { ownerId: current.ownerId, leaseUntil: current.leaseUntil }
                    : null,
            };
        }
        const run = await this.prisma.run.findUnique({ where: { id: runId } });
        return { acquired: true, run, conflict: null };
    }

    /** 释放租约：仅当调用方仍是 owner 时清空（ownerId/leaseUntil）。 */
    async releaseLease(runId: string, replicaId: string): Promise<void> {
        await this.prisma.run.updateMany({
            where: { id: runId, ownerId: replicaId },
            data: { ownerId: null, leaseUntil: null },
        });
    }

    /** 心跳续租：仅当调用方仍是 owner 时续期 leaseUntil。返回 false 表示租约已被抢占，调用方应停止执行。 */
    async heartbeat(
        runId: string,
        replicaId: string,
        ttlMs = DEFAULT_LEASE_TTL_MS,
    ): Promise<boolean> {
        const result = await this.prisma.run.updateMany({
            where: { id: runId, ownerId: replicaId },
            data: { leaseUntil: new Date(Date.now() + ttlMs) },
        });
        return result.count > 0;
    }

    /** 写入最终 token 用量（finalize 委托 PG）。 */
    async updateTokenUsage(
        runId: string,
        usage: { promptTokens: number; completionTokens: number; totalTokens: number },
    ): Promise<void> {
        await this.prisma.run.update({ where: { id: runId }, data: usage });
    }
}
