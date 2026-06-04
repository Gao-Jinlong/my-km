/**
 * CheckpointerProvider — LangGraph Checkpointer 单例工厂
 *
 * 根据 CHECKPOINTER_BACKEND 环境变量选择实现：
 * - memory (默认): MemorySaver — 进程内存，开发用
 * - postgres: PostgresSaver — PostgreSQL 持久化，生产用
 *
 * Checkpointer 是单例，所有 Thread/Run 共享同一个实例，
 * 避免每次对话都创建数据库连接。
 */

import type { BaseCheckpointSaver } from '@langchain/langgraph-checkpoint';
import { MemorySaver } from '@langchain/langgraph-checkpoint';
import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { EnvConfig } from '../../config/env.config';

export type CheckpointerBackend = 'memory' | 'postgres';

/**
 * 动态加载 PostgresSaver — 包可能未安装（仅在 postgres 模式需要）
 */
async function loadPostgresSaver(
    dbUrl: string,
): Promise<{ saver: BaseCheckpointSaver; end: () => Promise<void> }> {
    const { PostgresSaver } = await import('@langchain/langgraph-checkpoint-postgres');
    const saver = PostgresSaver.fromConnString(dbUrl) as unknown as BaseCheckpointSaver;
    await (saver as any).setup?.();
    return {
        saver,
        end: () => (saver as any).end?.(),
    };
}

@Injectable()
export class CheckpointerProvider implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(CheckpointerProvider.name);
    private checkpointer?: BaseCheckpointSaver;
    private postgresSaverEnd?: () => Promise<void>;

    constructor(private envConfig: EnvConfig) {}

    async onModuleInit() {
        const backend = (process.env.CHECKPOINTER_BACKEND || 'memory') as CheckpointerBackend;

        switch (backend) {
            case 'memory':
                this.checkpointer = new MemorySaver();
                this.logger.log('Checkpointer: MemorySaver (in-memory)');
                break;

            case 'postgres': {
                const dbUrl = this.envConfig.databaseUrl;
                if (!dbUrl) {
                    throw new Error(
                        'CHECKPOINTER_BACKEND=postgres requires DATABASE_URL to be set',
                    );
                }

                try {
                    const { saver, end } = await loadPostgresSaver(dbUrl);
                    this.checkpointer = saver;
                    this.postgresSaverEnd = end;
                    this.logger.log('Checkpointer: PostgresSaver');
                } catch (err) {
                    throw new Error(
                        `Failed to initialize PostgresSaver. Is @langchain/langgraph-checkpoint-postgres installed? ${(err as Error).message}`,
                    );
                }
                break;
            }

            default:
                throw new Error(
                    `Unknown CHECKPOINTER_BACKEND: "${backend}". Expected "memory" or "postgres".`,
                );
        }
    }

    async onModuleDestroy() {
        if (this.postgresSaverEnd) {
            await this.postgresSaverEnd();
            this.postgresSaverEnd = undefined;
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
