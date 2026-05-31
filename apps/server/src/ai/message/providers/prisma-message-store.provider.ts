/**
 * PrismaMessageStoreProvider — PostgreSQL 存储实现。
 *
 * 将 MessageRecord 映射到 Prisma Message 模型，
 * 使用 $transaction 保证 createMany 的事务语义。
 */

import { Prisma } from '@my-km/prisma';
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import type { CreateMessageInput, FindByRoomOptions, MessageRecord } from '../message-store.types';
import type { MessageStoreProvider } from './message-store-provider.interface';

@Injectable()
export class PrismaMessageStoreProvider implements MessageStoreProvider {
    private readonly logger = new Logger(PrismaMessageStoreProvider.name);

    constructor(private prisma: PrismaService) {}

    async create(record: CreateMessageInput): Promise<MessageRecord> {
        const result = await this.prisma.message.create({
            data: {
                roomId: record.roomId,
                role: record.role,
                content: record.content,
                toolCalls: record.toolCalls?.length
                    ? (record.toolCalls as unknown as Prisma.InputJsonValue)
                    : undefined,
                toolResultId: record.toolResultId,
                tokenCount: record.tokenCount,
                finishReason: record.finishReason,
                metadata: record.metadata ? (record.metadata as Prisma.InputJsonValue) : undefined,
            },
        });
        return this._toRecord(result);
    }

    async createMany(records: CreateMessageInput[]): Promise<MessageRecord[]> {
        if (records.length === 0) return [];

        const results = await this.prisma.$transaction(
            records.map(r =>
                this.prisma.message.create({
                    data: {
                        roomId: r.roomId,
                        role: r.role,
                        content: r.content,
                        toolCalls: r.toolCalls?.length
                            ? (r.toolCalls as unknown as Prisma.InputJsonValue)
                            : undefined,
                        toolResultId: r.toolResultId,
                        tokenCount: r.tokenCount,
                        finishReason: r.finishReason,
                        metadata: r.metadata ? (r.metadata as Prisma.InputJsonValue) : undefined,
                    },
                }),
            ),
        );
        return results.map(r => this._toRecord(r));
    }

    async findByRoom(roomId: string, opts: FindByRoomOptions = {}): Promise<MessageRecord[]> {
        const { limit, offset = 0, orderBy = 'asc' } = opts;

        const results = await this.prisma.message.findMany({
            where: { roomId },
            orderBy: { createdAt: orderBy },
            ...(limit !== undefined && { take: limit }),
            ...(offset > 0 && { skip: offset }),
            select: {
                id: true,
                roomId: true,
                role: true,
                content: true,
                toolCalls: true,
                toolResultId: true,
                tokenCount: true,
                finishReason: true,
                metadata: true,
                createdAt: true,
            },
        });

        return results.map(r => this._toRecord(r));
    }

    async aggregateTokens(roomId: string): Promise<number> {
        const result = await this.prisma.message.aggregate({
            where: { roomId },
            _sum: { tokenCount: true },
        });
        return result._sum.tokenCount ?? 0;
    }

    async healthCheck(): Promise<boolean> {
        try {
            await this.prisma.message.count({ take: 1 });
            return true;
        } catch {
            return false;
        }
    }

    // ========== 私有方法 ==========

    /**
     * 将 Prisma 返回的 Message 记录映射为 MessageRecord
     */
    private _toRecord(db: {
        id: string;
        roomId: string;
        role: string;
        content: string | null;
        toolCalls: Prisma.JsonValue | null;
        toolResultId: string | null;
        tokenCount: number | null;
        finishReason: string | null;
        metadata: Prisma.JsonValue | null;
        createdAt: Date;
    }): MessageRecord {
        return {
            id: db.id,
            roomId: db.roomId,
            role: db.role,
            content: db.content,
            toolCalls: db.toolCalls
                ? (db.toolCalls as unknown as MessageRecord['toolCalls'])
                : undefined,
            toolResultId: db.toolResultId ?? undefined,
            tokenCount: db.tokenCount ?? undefined,
            finishReason: db.finishReason ?? undefined,
            metadata: db.metadata ? (db.metadata as Record<string, unknown>) : undefined,
            createdAt: db.createdAt,
        };
    }
}
