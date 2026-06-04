/**
 * CheckpointerProvider — LangGraph Checkpointer 单例工厂
 *
 * 根据 CHECKPOINTER_BACKEND 环境变量选择实现：
 * - memory (默认): MemorySaver — 进程内存，开发用
 * - postgres: PostgresSaver — PostgreSQL 持久化，生产用
 *
 * 支持懒初始化：getCheckpointer() 在首次调用时自动初始化。
 */

import type { BaseCheckpointSaver } from '@langchain/langgraph-checkpoint';
import { MemorySaver } from '@langchain/langgraph-checkpoint';
import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
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
    // biome-ignore lint/suspicious/noExplicitAny: PostgresSaver setup is dynamic
    await (saver as any).setup?.();
    return {
        saver,
        // biome-ignore lint/suspicious/noExplicitAny: PostgresSaver end is dynamic
        end: () => (saver as any).end?.(),
    };
}

@Injectable()
export class CheckpointerProvider implements OnModuleDestroy {
    private readonly logger = new Logger(CheckpointerProvider.name);
    private checkpointer?: BaseCheckpointSaver;
    private postgresSaverEnd?: () => Promise<void>;
    private initPromise?: Promise<void>;

    constructor(private envConfig: EnvConfig) {}

    /**
     * 确保已初始化（幂等，可安全多次调用）
     */
    async ensureInitialized(): Promise<void> {
        if (this.checkpointer) return;
        if (this.initPromise) {
            await this.initPromise;
            return;
        }

        this.initPromise = this.doInit();
        await this.initPromise;
    }

    private async doInit(): Promise<void> {
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
     * 获取 checkpointer 单例（懒初始化）
     */
    async getCheckpointer(): Promise<BaseCheckpointSaver> {
        await this.ensureInitialized();
        if (!this.checkpointer) {
            throw new Error('CheckpointerProvider initialization failed');
        }
        return this.checkpointer;
    }
}
