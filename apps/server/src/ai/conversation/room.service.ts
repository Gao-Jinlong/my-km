/**
 * RoomService — 对话生命周期管理
 *
 * 负责：
 * - Room CRUD
 * - 元数据管理（标题、模型、provider）
 * - 统计和列表查询
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { CreateRoomOpts, ListOpts, RoomStats, UpdateRoomOpts } from './room.types';
import { ROOM_STATUS } from './room-state';

@Injectable()
export class RoomService {
    private readonly logger = new Logger(RoomService.name);

    constructor(private prisma: PrismaService) {}

    /**
     * 创建新对话
     */
    async create(opts: CreateRoomOpts = {}) {
        const room = await this.prisma.room.create({
            data: {
                id: opts.id || undefined,
                userId: opts.userId || null,
                title: opts.title || null,
                model: opts.model || null,
                provider: opts.provider || null,
                status: ROOM_STATUS.ACTIVE,
            },
        });

        this.logger.log(`Room created: ${room.id}`);
        return room;
    }

    /**
     * 根据 ID 查找对话
     */
    async findById(id: string) {
        return this.prisma.room.findUnique({
            where: { id },
        });
    }

    /**
     * 获取所有对话（不限用户）
     * TODO: 接入 auth 后改为 findByUserId
     */
    async findAll(opts: ListOpts = {}) {
        const { limit = 50, offset = 0, status = ROOM_STATUS.ACTIVE } = opts;

        return this.prisma.room.findMany({
            where: { status },
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
     * 根据用户 ID 列出对话
     */
    async findByUserId(userId: string, opts: ListOpts = {}) {
        const { limit = 50, offset = 0, status = ROOM_STATUS.ACTIVE } = opts;

        return this.prisma.room.findMany({
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
    async updateMetadata(id: string, updates: UpdateRoomOpts) {
        const room = await this.prisma.room.update({
            where: { id },
            data: {
                ...(updates.title !== undefined && { title: updates.title }),
                ...(updates.model !== undefined && { model: updates.model }),
                ...(updates.provider !== undefined && { provider: updates.provider }),
                ...(updates.status !== undefined && { status: updates.status }),
            },
        });

        this.logger.log(`Room updated: ${id}`);
        return room;
    }

    /**
     * 归档对话
     */
    async archive(id: string) {
        await this.prisma.room.update({
            where: { id },
            data: { status: ROOM_STATUS.ARCHIVED },
        });

        this.logger.log(`Room archived: ${id}`);
    }

    /**
     * 软删除对话
     */
    async delete(id: string) {
        await this.prisma.room.update({
            where: { id },
            data: { status: ROOM_STATUS.DELETED },
        });

        this.logger.log(`Room deleted: ${id}`);
    }

    /**
     * 获取用户统计
     */
    async getStats(userId: string): Promise<RoomStats> {
        const [total, active] = await Promise.all([
            this.prisma.room.count({ where: { userId } }),
            this.prisma.room.count({
                where: { userId, status: ROOM_STATUS.ACTIVE },
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
        await this.prisma.room.update({
            where: { id },
            data: { messageCount: { increment: 1 } },
        });
    }
}
