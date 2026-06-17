import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * RunQueryService — Run 查询服务
 *
 * 替代 controller 直接持有 PrismaService（违反分层）。
 * 仅负责读查询；Run 的生命周期（创建/取消/状态变更）由 AiChatService + RunManager 处理。
 */
@Injectable()
export class RunQueryService {
    constructor(private readonly prisma: PrismaService) {}

    /** 列出某 Thread 下的 Run（按创建时间倒序，默认 50 条）。 */
    async listByThread(threadId: string, limit = 50) {
        return this.prisma.run.findMany({
            where: { threadId },
            orderBy: { createdAt: 'desc' },
            take: limit,
        });
    }

    /** 按 id 查找单个 Run，不存在返回 null。 */
    async findById(runId: string) {
        return this.prisma.run.findUnique({
            where: { id: runId },
        });
    }
}
