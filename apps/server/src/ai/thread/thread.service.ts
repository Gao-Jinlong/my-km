/**
 * ThreadService — Thread 生命周期管理
 *
 * 负责：
 * - Thread CRUD
 * - 元数据管理（标题、模型、provider）
 * - 统计和列表查询
 *
 * Thread 概念对齐 LangGraph：一次对话 = 一个 Thread，包含多次 Run。
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type {
    CreateThreadOpts,
    ListThreadOpts,
    ThreadStatus,
    UpdateThreadOpts,
} from '../types/thread.types';

const DEFAULT_LIMIT = 50;
const DEFAULT_OFFSET = 0;
const DEFAULT_STATUS: ThreadStatus = 'active';

@Injectable()
export class ThreadService {
    private readonly logger = new Logger(ThreadService.name);

    constructor(private prisma: PrismaService) {}

    /**
     * 创建新 Thread
     */
    async create(opts: CreateThreadOpts = {}) {
        const thread = await this.prisma.thread.create({
            data: {
                id: opts.id || undefined,
                userId: opts.userId || null,
                title: opts.title || null,
                model: opts.model || null,
                provider: opts.provider || null,
                status: DEFAULT_STATUS,
            },
        });

        this.logger.log(`Thread created: ${thread.id}`);
        return thread;
    }

    /**
     * findOrCreate — 如果 threadId 存在则返回，否则创建新 Thread
     *
     * 用于 Service.startRun() 中接受可选 threadId 的场景。
     */
    async findOrCreate(threadId: string | undefined, opts: CreateThreadOpts = {}) {
        if (threadId) {
            const existing = await this.findById(threadId);
            if (existing) return existing;
        }
        return this.create({ ...opts, id: threadId });
    }

    /**
     * 根据 ID 查找 Thread
     */
    async findById(id: string) {
        return this.prisma.thread.findUnique({
            where: { id },
        });
    }

    /**
     * 列出 Thread（按更新时间倒序）
     */
    async findAll(opts: ListThreadOpts = {}) {
        const { limit = DEFAULT_LIMIT, offset = DEFAULT_OFFSET, status = DEFAULT_STATUS } = opts;

        return this.prisma.thread.findMany({
            where: { status },
            orderBy: { updatedAt: 'desc' },
            take: limit,
            skip: offset,
            select: {
                id: true,
                userId: true,
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
     * 按用户 ID 列出 Thread
     */
    async findByUserId(userId: string, opts: ListThreadOpts = {}) {
        const { limit = DEFAULT_LIMIT, offset = DEFAULT_OFFSET, status = DEFAULT_STATUS } = opts;

        return this.prisma.thread.findMany({
            where: { userId, status },
            orderBy: { updatedAt: 'desc' },
            take: limit,
            skip: offset,
        });
    }

    /**
     * 更新 Thread 元数据
     */
    async update(id: string, opts: UpdateThreadOpts) {
        return this.prisma.thread.update({
            where: { id },
            data: {
                ...(opts.title !== undefined && { title: opts.title }),
                ...(opts.model !== undefined && { model: opts.model }),
                ...(opts.provider !== undefined && { provider: opts.provider }),
                ...(opts.status !== undefined && { status: opts.status }),
            },
        });
    }

    /**
     * 归档 Thread
     */
    async archive(id: string) {
        return this.prisma.thread.update({
            where: { id },
            data: { status: 'archived' },
        });
    }

    /**
     * 软删除 Thread
     */
    async delete(id: string) {
        return this.prisma.thread.update({
            where: { id },
            data: { status: 'deleted' },
        });
    }

    /**
     * 自增消息计数
     */
    async incrementMessageCount(id: string) {
        return this.prisma.thread.update({
            where: { id },
            data: { messageCount: { increment: 1 } },
        });
    }

    /**
     * 获取 Thread 统计信息
     */
    async getStats() {
        const [total, active] = await Promise.all([
            this.prisma.thread.count(),
            this.prisma.thread.count({ where: { status: 'active' } }),
        ]);
        return { total, active };
    }
}
