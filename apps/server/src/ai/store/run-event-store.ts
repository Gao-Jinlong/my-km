/**
 * RunEventStore — Run 事件流存储器
 *
 * 把 Run 执行过程中产生的所有 SSE 事件追加写入 PostgreSQL。
 * 核心场景：断线重连、运行回放、多客户端共享。
 *
 * 与 Checkpointer 的区别：
 * - Checkpointer 存储 graph 状态快照（用于跨进程恢复）
 * - EventStore 存储 SSE 事件流（用于客户端重连/回放）
 *
 * 缓冲策略：
 * - append() 将事件缓冲到内存，不立即写 DB
 * - 缓冲达到阈值（FLUSH_THRESHOLD=10）时自动 flush
 * - flushRun() 在 run 结束时显式调用，确保所有事件落盘
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/** 单个事件写入参数 */
export interface AppendEventOpts {
    eventType: string;
    eventName: string;
    seq: number;
    payload: Record<string, unknown>;
}

/** 批量事件写入参数（不含 runId/threadId） */
export type BatchEventOpts = Omit<AppendEventOpts, never>;

/** 查询选项 */
export interface GetEventsOpts {
    offset?: number;
    limit?: number;
}

/** 缓冲区条目 */
interface BufferEntry {
    runId: string;
    threadId: string;
    events: BatchEventOpts[];
}

@Injectable()
export class RunEventStore {
    private readonly logger = new Logger(RunEventStore.name);

    /** 内存缓冲区，按 runId 分组 */
    private readonly buffer = new Map<string, BufferEntry>();

    /** 缓冲阈值，达到后自动 flush */
    private readonly FLUSH_THRESHOLD = 10;

    constructor(private prisma: PrismaService) {}

    /**
     * 追加单个事件（缓冲，不立即写 DB）
     */
    async append(runId: string, threadId: string, event: AppendEventOpts) {
        let entry = this.buffer.get(runId);
        if (!entry) {
            entry = { runId, threadId, events: [] };
            this.buffer.set(runId, entry);
        }
        entry.events.push(event);

        // 阈值触发自动 flush
        if (entry.events.length >= this.FLUSH_THRESHOLD) {
            await this.flushRun(runId);
        }
    }

    /**
     * 刷新指定 run 的缓冲区到 DB
     */
    async flushRun(runId: string): Promise<void> {
        const entry = this.buffer.get(runId);
        if (!entry || entry.events.length === 0) return;

        try {
            await this.appendBatch(entry.runId, entry.threadId, entry.events);
            this.buffer.delete(runId);
        } catch (err) {
            this.logger.error(`flushRun(${runId}) failed: ${(err as Error).message}`);
            // 不清空缓冲区，下次 flush 可重试
        }
    }

    /**
     * 刷新所有缓冲区
     */
    async flushAll(): Promise<void> {
        const runIds = Array.from(this.buffer.keys());
        for (const runId of runIds) {
            await this.flushRun(runId);
        }
    }

    /**
     * 批量追加事件（高性能写入，直接写 DB）
     */
    async appendBatch(runId: string, threadId: string, events: BatchEventOpts[]) {
        if (events.length === 0) return { count: 0 };

        return this.prisma.runEvent.createMany({
            data: events.map(e => ({
                runId,
                threadId,
                seq: e.seq,
                eventType: e.eventType,
                eventName: e.eventName,
                // biome-ignore lint/suspicious/noExplicitAny: Prisma JsonValue compatible with any object
                payload: e.payload as any,
            })),
        });
    }

    /**
     * 回放某个 run 的所有事件（按序号升序）
     */
    async replay(runId: string) {
        return this.prisma.runEvent.findMany({
            where: { runId },
            orderBy: { seq: 'asc' },
        });
    }

    /**
     * 分页获取事件
     */
    async getEvents(runId: string, opts: GetEventsOpts = {}) {
        const { offset = 0, limit = 100 } = opts;

        return this.prisma.runEvent.findMany({
            where: { runId },
            orderBy: { seq: 'asc' },
            skip: offset,
            take: limit,
        });
    }

    /**
     * 清理过期事件
     *
     * @param maxAge 最大保留时间（秒），默认 7 天
     */
    async cleanup(maxAge: number = 7 * 24 * 3600) {
        const cutoff = new Date(Date.now() - maxAge * 1000);
        const result = await this.prisma.runEvent.deleteMany({
            where: {
                createdAt: { lt: cutoff },
            },
        });
        if (result.count > 0) {
            this.logger.log(`Cleaned up ${result.count} events older than ${maxAge}s`);
        }
        return result;
    }
}
