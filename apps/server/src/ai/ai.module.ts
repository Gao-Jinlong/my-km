import { Module, OnModuleInit } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { AiController } from './ai.controller';
import { AiGateway } from './ai.gateway';
import { AiService } from './ai.service';
import { AnthropicProvider } from './llm/anthropic.provider';

/**
 * AI 模块
 *
 * 初始化 LLM provider 和工具定义。
 */
@Module({
    imports: [PrismaModule, ConfigModule],
    controllers: [AiController],
    providers: [AiService, AiGateway],
    exports: [AiService],
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
        } else {
            console.warn(`⚠️  Unknown AI provider: ${provider}`);
        }

        // TODO: 从 shared 导入工具定义并设置
        // this.aiService.setToolDefinitions([...]);
    }
}
