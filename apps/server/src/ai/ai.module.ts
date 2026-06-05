/**
 * AiModule — AI 模块 NestJS DI 连线
 *
 * 将所有 AI 子模块（Controller, Service, Thread, Run, LLM, Checkpointer, Store）
 * 注册到 NestJS DI 容器中。
 */

import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AiChatController } from './ai.controller';
import { AiChatService } from './ai.service';
import { CheckpointerProvider } from './checkpointer/checkpointer.provider';
import { LLMFactory } from './llm/llm-factory';
import { ProviderRegistry } from './llm/provider-registry';
import { MessageService } from './message/message.service';
import { RunContextFactory } from './run/run-context-factory';
import { RunManager } from './run/run-manager';
import { RunEventStore } from './store/run-event-store';
import { ThreadService } from './thread/thread.service';

@Module({
    imports: [PrismaModule],
    controllers: [AiChatController],
    providers: [
        // 基础设施层
        ThreadService,
        MessageService,
        RunEventStore,
        CheckpointerProvider,

        // LLM 层
        ProviderRegistry,
        LLMFactory,

        // Run 层
        RunManager,
        RunContextFactory,

        // 业务逻辑层
        AiChatService,
    ],
    exports: [AiChatService, ThreadService],
})
export class AiModule {}
