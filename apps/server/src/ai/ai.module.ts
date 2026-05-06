import { Module, OnModuleInit } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { AiController } from './ai.controller';
import { AiGateway } from './ai.gateway';
import { AiService } from './ai.service';
import { ConnectionManager } from './connection/connection-manager';
import { ConversationService } from './conversation/conversation.service';
import { AiRateLimiter } from './dispatch/rate-limiter.guard';
import { RequestDispatcher } from './dispatch/request-dispatcher';
import { MessageService } from './message/message.service';
import { AILoopOrchestrator } from './orchestrator/ai-loop.orchestrator';
import { AnthropicProvider } from './provider/anthropic.provider';
import { OpenAIProvider } from './provider/openai.provider';
import { ProviderRouter } from './provider/provider.router';
import { AISessionManager } from './session/ai-session-manager';
import { ToolDispatcher } from './tools/tool.dispatcher';

/**
 * AI 模块
 *
 * 初始化 LLM provider 和工具定义。
 * 支持多 provider: Anthropic, OpenAI
 */
@Module({
    imports: [PrismaModule, ConfigModule],
    controllers: [AiController],
    providers: [
        AiGateway,
        AiService,
        ConversationService,
        MessageService,
        AISessionManager,
        ConnectionManager,
        AILoopOrchestrator,
        ProviderRouter,
        ToolDispatcher,
        RequestDispatcher,
        AiRateLimiter,
    ],
    exports: [AiService, ConversationService, MessageService],
})
export class AiModule implements OnModuleInit {
    constructor(
        private aiService: AiService,
        private configService: ConfigService,
    ) {}

    async onModuleInit() {
        const provider = this.configService.get<string>('AI_PROVIDER', 'anthropic');
        const apiKey = this.configService.get<string>(
            provider === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY',
        );

        if (!apiKey) {
            console.warn(`⚠️  ${provider.toUpperCase()}_API_KEY not set — AI module disabled`);
            return;
        }

        if (provider === 'anthropic') {
            const anthropicProvider = new AnthropicProvider(
                apiKey,
                this.configService.get<string>('ANTHROPIC_MODEL'),
            );
            this.aiService.setProvider(anthropicProvider);
        } else if (provider === 'openai') {
            const openaiProvider = new OpenAIProvider(
                apiKey,
                this.configService.get<string>('OPENAI_MODEL'),
            );
            this.aiService.setProvider(openaiProvider);
        } else {
            console.warn(`⚠️  Unknown AI provider: ${provider}`);
        }

        // TODO: 从 shared 导入工具定义并设置
        // this.aiService.setToolDefinitions([...]);
    }
}
