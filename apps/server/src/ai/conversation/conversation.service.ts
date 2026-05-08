/**
 * ConversationService — 对话生命周期管理
 *
 * 负责：
 * - Conversation CRUD
 * - 元数据管理（标题、模型、provider）
 * - 统计和列表查询
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type {
    ConversationStats,
    CreateConversationOpts,
    ListOpts,
    UpdateConversationOpts,
} from './conversation.types';
import { CONVERSATION_STATUS } from './conversation-state';

@Injectable()
export class ConversationService {
    private readonly logger = new Logger(ConversationService.name);

    constructor(private prisma: PrismaService) {}

    /**
     * 创建新对话
     */
    async create(opts: CreateConversationOpts = {}) {
        const conversation = await this.prisma.conversation.create({
            data: {
                id: opts.id || undefined,
                userId: opts.userId || null,
                title: opts.title || null,
                model: opts.model || null,
                provider: opts.provider || null,
                status: CONVERSATION_STATUS.ACTIVE,
            },
        });

        this.logger.log(`Conversation created: ${conversation.id}`);
        return conversation;
    }

    /**
     * 根据 ID 查找对话
     */
    async findById(id: string) {
        return this.prisma.conversation.findUnique({
            where: { id },
        });
    }

    /**
     * 根据用户 ID 列出对话
     */
    async findByUserId(userId: string, opts: ListOpts = {}) {
        const { limit = 50, offset = 0, status = CONVERSATION_STATUS.ACTIVE } = opts;

        return this.prisma.conversation.findMany({
            where: { userId, status },
            orderBy: { updatedAt: 'desc' },
            take: limit,
            skip: offset,
            select: {
                id: true,
                title: true,
                status: true,
                model: true,
                provider: true,
                messageCount: true,
                createdAt: true,
                updatedAt: true,
            },
        });
    }

    /**
     * 更新对话元数据
     */
    async updateMetadata(id: string, updates: UpdateConversationOpts) {
        const conversation = await this.prisma.conversation.update({
            where: { id },
            data: {
                ...(updates.title !== undefined && { title: updates.title }),
                ...(updates.model !== undefined && { model: updates.model }),
                ...(updates.provider !== undefined && { provider: updates.provider }),
                ...(updates.status !== undefined && { status: updates.status }),
            },
        });

        this.logger.log(`Conversation updated: ${id}`);
        return conversation;
    }

    /**
     * 归档对话
     */
    async archive(id: string) {
        await this.prisma.conversation.update({
            where: { id },
            data: { status: CONVERSATION_STATUS.ARCHIVED },
        });

        this.logger.log(`Conversation archived: ${id}`);
    }

    /**
     * 软删除对话
     */
    async delete(id: string) {
        await this.prisma.conversation.update({
            where: { id },
            data: { status: CONVERSATION_STATUS.DELETED },
        });

        this.logger.log(`Conversation deleted: ${id}`);
    }

    /**
     * 获取用户统计
     */
    async getStats(userId: string): Promise<ConversationStats> {
        const [total, active] = await Promise.all([
            this.prisma.conversation.count({ where: { userId } }),
            this.prisma.conversation.count({
                where: { userId, status: CONVERSATION_STATUS.ACTIVE },
            }),
        ]);

        // Token 统计需要遍历 Message，这里先返回占位
        const tokenUsage = 0;

        return { total, active, tokenUsage };
    }

    /**
     * 增加消息计数（原子操作）
     */
    async incrementMessageCount(id: string) {
        await this.prisma.conversation.update({
            where: { id },
            data: { messageCount: { increment: 1 } },
        });
    }
}
