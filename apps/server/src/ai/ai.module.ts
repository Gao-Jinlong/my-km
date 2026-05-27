import { Logger, Module, OnModuleInit } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { SocketRegistry } from '../ws/socket-registry';
import { WsModule } from '../ws/ws.module';
import { AgentsModule } from './agents/agents.module';
import { AiController } from './ai.controller';
import { RoomService } from './conversation/room.service';
import { AiRateLimiter } from './dispatch/rate-limiter.guard';
import { RequestDispatcher } from './dispatch/request-dispatcher';
import { ChatGraph } from './langgraph';
import { AnthropicProvider } from './llm/anthropic.provider';
import { DashscopeProvider } from './llm/dashscope.provider';
import { buildDefaultLlmConfig } from './llm/llm-default-config';
import { LLMFactory } from './llm/llm-factory';
import { OpenAIProvider } from './llm/openai.provider';
import type { LLMConfig, LLMProvider } from './llm/provider.types';
import { ProviderRegistry } from './llm/provider-registry';
import { ZhipuProvider } from './llm/zhipu.provider';
import { MessageService } from './message/message.service';
import { RoomSessionRegistry } from './session/room-session-registry';
import { ToolDispatcher } from './tools/tool.dispatcher';
import { ToolRouter } from './tools/tool-router';
import { GraphRegistry } from './workflow/graph-registry';
import { LLMResolver } from './workflow/llm-resolver';
import { RoomOrchestrator } from './workflow/orchestrator';
import { AiMessageRouter } from './ws/ai-message-router';
/**
 * AI 模块
 *
 * 初始化 LLM provider 注册表和工作流引擎。
 * 支持多 provider: Anthropic, OpenAI, Zhipu, DashScope
 */
@Module({
    imports: [PrismaModule, ConfigModule, WsModule, AgentsModule],
    controllers: [AiController],
    providers: [
        RoomService,
        MessageService,
        SocketRegistry,
        ToolDispatcher,
        ToolRouter,
        RequestDispatcher,
        AiRateLimiter,
        RoomSessionRegistry,
        // Message routing (self-subscribing)
        AiMessageRouter,
        // New architecture
        ProviderRegistry,
        LLMFactory,
        LLMResolver,
        GraphRegistry,
        RoomOrchestrator,
    ],
    exports: [
        MessageService,
        // New architecture exports
        ProviderRegistry,
        LLMFactory,
        LLMResolver,
        GraphRegistry,
        RoomOrchestrator,
        AiMessageRouter,
    ],
})
export class AiModule implements OnModuleInit {
    private readonly logger = new Logger(AiModule.name);
    constructor(
        private configService: ConfigService,
        private providerRegistry: ProviderRegistry,
        private graphRegistry: GraphRegistry,
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

        // Register built-in graph definitions
        this.graphRegistry.register(new ChatGraph());
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
            console.warn(`⚠️  ${name.toUpperCase()}_API_KEY not set — skipping ${name}`);
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
