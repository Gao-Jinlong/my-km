/**
 * CheckpointerProvider — LangGraph Checkpointer 单例工厂
 *
 * 根据 CHECKPOINTER_BACKEND 配置选择实现：
 * - memory (默认): MemorySaver — 进程内存，开发用
 * - postgres: PostgresSaver — PostgreSQL 持久化，生产用
 *
 * Checkpointer 是单例，所有 Thread/Run 共享同一个实例，
 * 避免每次对话都创建数据库连接。
 */

import type { BaseCheckpointSaver } from '@langchain/langgraph-checkpoint';
import { MemorySaver } from '@langchain/langgraph-checkpoint';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type CheckpointerBackend = 'memory' | 'postgres';

@Injectable()
export class CheckpointerProvider implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(CheckpointerProvider.name);
    private checkpointer?: BaseCheckpointSaver;
    private postgresSaver?: PostgresSaver;

    constructor(private configService: ConfigService) {}

    async onModuleInit() {
        const backend = (this.configService.get<string>('CHECKPOINTER_BACKEND') ||
            'memory') as CheckpointerBackend;

        switch (backend) {
            case 'memory':
                this.checkpointer = new MemorySaver();
                this.logger.log('Checkpointer: MemorySaver (in-memory)');
                break;

            case 'postgres': {
                const dbUrl = this.configService.get<string>('DATABASE_URL');
                if (!dbUrl) {
                    throw new Error(
                        'CHECKPOINTER_BACKEND=postgres requires DATABASE_URL to be set',
                    );
                }
                this.postgresSaver = PostgresSaver.fromConnString(dbUrl);
                await this.postgresSaver.setup();
                this.checkpointer = this.postgresSaver;
                this.logger.log('Checkpointer: PostgresSaver');
                break;
            }

            default:
                throw new Error(
                    `Unknown CHECKPOINTER_BACKEND: "${backend}". Expected "memory" or "postgres".`,
                );
        }
    }

    async onModuleDestroy() {
        if (this.postgresSaver) {
            await this.postgresSaver.end();
            this.postgresSaver = undefined;
        }
    }

    /**
     * 获取 checkpointer 单例
     */
    getCheckpointer(): BaseCheckpointSaver {
        if (!this.checkpointer) {
            throw new Error('CheckpointerProvider not initialized — call onModuleInit() first');
        }
        return this.checkpointer;
    }
}
