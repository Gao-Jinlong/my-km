/**
 * MessageService — 消息查询服务
 *
 * 负责：
 * - 按 Thread/Room ID 查询消息历史
 * - 消息分页
 *
 * 消息持久化由 LangGraph Checkpointer 管理，
 * 此服务提供查询接口供 Controller 使用。
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface MessageQueryOpts {
    limit?: number;
    offset?: number;
}

@Injectable()
export class MessageService {
    private readonly logger = new Logger(MessageService.name);

    constructor(private prisma: PrismaService) {}

    /**
     * 按 Thread ID 查询消息历史
     */
    async findByRoomId(threadId: string, opts: MessageQueryOpts = {}) {
        const { limit = 100, offset = 0 } = opts;

        return this.prisma.message.findMany({
            where: { threadId },
            orderBy: { createdAt: 'asc' },
            take: limit,
            skip: offset,
        });
    }
}
