/**
 * AiModule — AI 模块 NestJS DI 连线
 *
 * 将所有 AI 子模块（Controller, Service, Thread, Run, LLM, Checkpointer, Store）
 * 注册到 NestJS DI 容器中。
 *
 * onModuleInit:
 *   - 将 4 个 LLM Provider 工厂注册到 ProviderRegistry
 *   - 从 env 推断默认 LLMConfig（按 ANTHROPIC > OPENAI > ZHIPU > DASHSCOPE 优先级）
 *   - 若所有 API key 缺失，fallback 到 {provider:'dashscope', model:'qwen-plus'}
 *     并 logger.warn 提示首次请求会失败，除非设置 DASHSCOPE_API_KEY
 */

import { randomUUID } from 'node:crypto';
import { Logger, Module, type OnModuleInit } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AiChatService } from './ai.service';
import { CheckpointReaderService } from './checkpointer/checkpoint-reader.service';
import { CheckpointerProvider } from './checkpointer/checkpointer.provider';
import { ThreadsController } from './langgraph/threads.controller';
import { AnthropicProvider } from './llm/anthropic.provider';
import { DashscopeProvider } from './llm/dashscope.provider';
import { buildDefaultLlmConfig } from './llm/llm-default-config';
import { LLMFactory } from './llm/llm-factory';
import { OpenAIProvider } from './llm/openai.provider';
import { ProviderRegistry } from './llm/provider-registry';
import { ZhipuProvider } from './llm/zhipu.provider';
import { REPLICA_ID } from './run/replica-id';
import { RunContextFactory } from './run/run-context-factory';
import { RunManager } from './run/run-manager';
import { RunStateRepository } from './run/run-state.repository';
import { RunsController } from './run/runs.controller';
import { RunEventStore } from './store/run-event-store';
import { ThreadService } from './thread/thread.service';

@Module({
    imports: [PrismaModule],
    controllers: [ThreadsController, RunsController],
    providers: [
        // 基础设施层
        ThreadService,
        RunEventStore,
        CheckpointerProvider,
        CheckpointReaderService,

        // LLM 层
        ProviderRegistry,
        LLMFactory,

        // Run 层
        RunStateRepository,
        {
            provide: REPLICA_ID,
            useFactory: () => process.env.AI_REPLICA_ID?.trim() || randomUUID(),
        },
        RunManager,
        RunContextFactory,

        // 业务逻辑层
        AiChatService,
    ],
    exports: [AiChatService, ThreadService],
})
export class AiModule implements OnModuleInit {
    private readonly logger = new Logger(AiModule.name);

    constructor(private readonly registry: ProviderRegistry) {}

    /**
     * 模块初始化时注册所有 provider 工厂并设置默认配置。
     *
     * 注册时机：NestJS 在所有依赖注入完成后调用 onModuleInit。
     * 这保证 ProviderRegistry 实例已就绪，且在任何 HTTP 请求之前完成。
     */
    onModuleInit(): void {
        // 注册 4 个 provider 工厂
        this.registry.register('anthropic', cfg => new AnthropicProvider(cfg));
        this.registry.register('openai', cfg => new OpenAIProvider(cfg));
        this.registry.register('zhipu', cfg => new ZhipuProvider(cfg));
        this.registry.register('dashscope', cfg => new DashscopeProvider(cfg));

        // 从 env 推断默认 LLMConfig；缺失时 fallback 到 dashscope/qwen-plus
        const cfg = buildDefaultLlmConfig();
        if (cfg) {
            this.registry.setDefaultConfig(cfg);
            this.logger.log(`Default LLM provider: ${cfg.provider} (model: ${cfg.model})`);
        } else {
            const fallback = { provider: 'dashscope', model: 'qwen-plus' };
            this.registry.setDefaultConfig(fallback);
            this.logger.warn(
                'No LLM API key found in env (ANTHROPIC_API_KEY / OPENAI_API_KEY / ZHIPUAI_API_KEY / DASHSCOPE_API_KEY). ' +
                    `Falling back to ${fallback.provider}/${fallback.model}; ` +
                    'first request will fail unless DASHSCOPE_API_KEY is set.',
            );
        }
    }
}
