import { ChatGraph } from '@my-km/langgraph-workflows';
import { Module, OnModuleInit } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { SocketRegistry } from '../ws/socket-registry';
import { WsModule } from '../ws/ws.module';
import { AiController } from './ai.controller';
import { RoomService } from './conversation/room.service';
import { AiRateLimiter } from './dispatch/rate-limiter.guard';
import { RequestDispatcher } from './dispatch/request-dispatcher';
import { AiMessageRouter } from './gateway/ai-message-router';
import { RoomRouter } from './gateway/room-router';
import { RoomStateMachineFactory } from './gateway/room-statemachine-factory';
import { MessageService } from './message/message.service';
import { AnthropicProvider } from './provider/anthropic.provider';
import { DashscopeProvider } from './provider/dashscope.provider';
import { LLMFactory } from './provider/llm-factory';
import { OpenAIProvider } from './provider/openai.provider';
import type { LLMConfig, LLMProvider } from './provider/provider.types';
import { ProviderRegistry } from './provider/provider-registry';
import { ZhipuProvider } from './provider/zhipu.provider';
import { AISessionManager } from './session/ai-session-manager';
import { ToolDispatcher } from './tools/tool.dispatcher';
import { ToolRouter } from './tools/tool-router';
import { GraphRegistry } from './workflow-runtime/graph-registry';
import { LLMResolver } from './workflow-runtime/llm-resolver';
import { RoomOrchestrator } from './workflow-runtime/room-orchestrator';
import { WorkflowExecutor } from './workflow-runtime/workflow-executor';
/**
 * AI 模块
 *
 * 初始化 LLM provider 注册表和工作流引擎。
 * 支持多 provider: Anthropic, OpenAI, Zhipu, DashScope
 */
@Module({
    imports: [PrismaModule, ConfigModule, WsModule],
    controllers: [AiController],
    providers: [
        RoomService,
        MessageService,
        AISessionManager,
        SocketRegistry,
        RoomRouter,
        ToolDispatcher,
        ToolRouter,
        RequestDispatcher,
        AiRateLimiter,
        RoomStateMachineFactory,
        // Message routing (self-subscribing)
        AiMessageRouter,
        // New architecture
        ProviderRegistry,
        LLMFactory,
        LLMResolver,
        GraphRegistry,
        WorkflowExecutor,
        RoomOrchestrator,
    ],
    exports: [
        MessageService,
        // New architecture exports
        ProviderRegistry,
        LLMFactory,
        LLMResolver,
        GraphRegistry,
        WorkflowExecutor,
        RoomOrchestrator,
        RoomRouter,
    ],
})
export class AiModule implements OnModuleInit {
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
