/**
 * RunEventStore — Run 事件流存储器
 *
 * 把 Run 执行过程中产生的所有 SSE 事件追加写入 PostgreSQL。
 * 核心场景：断线重连、运行回放、多客户端共享。
 *
 * 与 Checkpointer 的区别：
 * - Checkpointer 存储 graph 状态快照（用于跨进程恢复）
 * - EventStore 存储 SSE 事件流（用于客户端重连/回放）
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

@Injectable()
export class RunEventStore {
    private readonly logger = new Logger(RunEventStore.name);

    constructor(private prisma: PrismaService) {}

    /**
     * 追加单个事件
     */
    async append(runId: string, threadId: string, event: AppendEventOpts) {
        return this.prisma.runEvent.create({
            data: {
                runId,
                threadId,
                seq: event.seq,
                eventType: event.eventType,
                eventName: event.eventName,
                // biome-ignore lint/suspicious/noExplicitAny: Prisma JsonValue compatible with any object
                payload: event.payload as any,
            },
        });
    }

    /**
     * 批量追加事件（高性能写入）
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
