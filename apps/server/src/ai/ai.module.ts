/**
 * AI 模块 — SSE + LangGraph Protocol 架构
 *
 * v2: 使用 SSE 流式协议替代 Socket.io WebSocket。
 * 保留 Room CRUD 和消息持久化，移除 WS 层。
 *
 * 新增:
 *   - AiChatController: POST /ai/chat SSE 端点
 *   - SSEExecutor: 轻量 LangGraph 图执行器，直接输出 SSE 事件
 *
 * 复用:
 *   - ProviderRegistry + LLMFactory: LLM Provider 管理
 *   - RoomService: 对话 CRUD
 *   - MessageService + MessageStore: 消息持久化
 */

import { Logger, Module, OnModuleInit } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import { RoomService } from './conversation/room.service';
import { AnthropicProvider } from './llm/anthropic.provider';
import { DashscopeProvider } from './llm/dashscope.provider';
import { buildDefaultLlmConfig } from './llm/llm-default-config';
import { LLMFactory } from './llm/llm-factory';
import { OpenAIProvider } from './llm/openai.provider';
import type { LLMConfig, LLMProvider } from './llm/provider.types';
import { ProviderRegistry } from './llm/provider-registry';
import { ZhipuProvider } from './llm/zhipu.provider';
import { MessageService } from './message/message.service';
import { MessageStoreImpl } from './message/message-store.impl';
import { MESSAGE_STORE_PROVIDER_TOKEN } from './message/providers/message-store-provider.interface';
import { PrismaMessageStoreProvider } from './message/providers/prisma-message-store.provider';
import { AiChatController } from './platform/ai-chat.controller';

@Module({
    imports: [PrismaModule, ConfigModule],
    controllers: [AiChatController],
    providers: [
        RoomService,
        MessageService,
        // MessageStore — 消息持久化层
        MessageStoreImpl,
        {
            provide: MESSAGE_STORE_PROVIDER_TOKEN,
            useFactory: (config: ConfigService, prisma: PrismaService) => {
                const providerType = config.get<string>('MESSAGE_STORE_PROVIDER', 'prisma');
                switch (providerType) {
                    case 'prisma':
                        return new PrismaMessageStoreProvider(prisma);
                    default:
                        throw new Error(`Unknown MESSAGE_STORE_PROVIDER: ${providerType}`);
                }
            },
            inject: [ConfigService, PrismaService],
        },
        // LLM Provider 管理
        ProviderRegistry,
        LLMFactory,
    ],
    exports: [MessageService, MessageStoreImpl, RoomService, ProviderRegistry, LLMFactory],
})
export class AiModule implements OnModuleInit {
    private readonly logger = new Logger(AiModule.name);

    constructor(
        private configService: ConfigService,
        private providerRegistry: ProviderRegistry,
        _llmFactory: LLMFactory,
    ) {}

    async onModuleInit() {
        // Register all configured providers to ProviderRegistry
        this.registerProvider('anthropic', AnthropicProvider);
        this.registerProvider('openai', OpenAIProvider);
        this.registerProvider('zhipu', ZhipuProvider);
        this.registerProvider('dashscope', DashscopeProvider);

        // Build and register default LLM config from environment
        const defaultConfig = buildDefaultLlmConfig();
        if (defaultConfig) {
            this.providerRegistry.setDefaultConfig(defaultConfig);
            this.logger.log(`Default LLM: ${defaultConfig.provider}/${defaultConfig.model}`);
        } else {
            this.logger.warn('No LLM API keys found — LLM calls will fail until configured');
        }

        this.logger.log('AI Module initialized (SSE + LangGraph Protocol)');
    }

    /**
     * 注册 provider（如果 API Key 存在）
     */
    private registerProvider(
        name: string,
        ProviderClass: new (config: LLMConfig) => LLMProvider,
    ): void {
        const apiKey = this.getApiKeyForProvider(name);
        if (!apiKey) {
            this.logger.warn(`${name.toUpperCase()}_API_KEY not set — skipping ${name}`);
            return;
        }
        this.providerRegistry.register(name, config => {
            return new ProviderClass({ ...config, apiKey });
        });
    }

    private getApiKeyForProvider(name: string): string | undefined {
        switch (name) {
            case 'anthropic':
                return this.configService.get<string>('ANTHROPIC_API_KEY');
            case 'openai':
                return this.configService.get<string>('OPENAI_API_KEY');
            case 'zhipu':
                return this.configService.get<string>('ZHIPUAI_API_KEY');
            case 'dashscope':
                return this.configService.get<string>('DASHSCOPE_API_KEY');
            default:
                return undefined;
        }
    }
}
