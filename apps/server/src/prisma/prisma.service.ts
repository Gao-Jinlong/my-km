/**
 * Prisma 7 数据库服务
 *
 * 【Driver Adapter】
 * Prisma 7 要求 PrismaClient 构造时必须传入 driver adapter，
 * 旧的 `datasourceUrl` / `datasources` 构造选项已移除。
 * PrismaPg 是 PostgreSQL 的 adapter（来自 `@prisma/adapter-pg`），
 * 底层使用 `pg` 驱动连接数据库。
 */
import { PrismaClient, PrismaPg } from '@my-km/prisma';
import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
    constructor() {
        const adapter = new PrismaPg({
            connectionString: process.env.DATABASE_URL!,
        });
        super({
            adapter,
            log: ['query', 'error', 'warn'],
        });
    }

    async onModuleInit() {
        await this.$connect();
    }

    async onModuleDestroy() {
        await this.$disconnect();
    }
}
