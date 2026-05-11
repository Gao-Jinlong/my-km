/**
 * WorkflowRuntime Module
 *
 * 注册工作流运行时所需的所有服务。
 */

import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { ConnectionManager } from '../connection/connection-manager';
import { MessageService } from '../message/message.service';
import { LLMFactory } from '../provider/llm-factory';
import { ProviderRegistry } from '../provider/provider-registry';
import { AISessionManager } from '../session/ai-session-manager';
import { ConversationOrchestrator } from './conversation-orchestrator';
import { GraphRegistry } from './graph-registry';
import { LLMResolver } from './llm-resolver';
import { WorkflowExecutor } from './workflow-executor';

@Module({
    imports: [PrismaModule],
    providers: [
        GraphRegistry,
        LLMResolver,
        LLMFactory,
        ProviderRegistry,
        WorkflowExecutor,
        ConversationOrchestrator,
        ConnectionManager,
        MessageService,
        AISessionManager,
    ],
    exports: [
        ConversationOrchestrator,
        WorkflowExecutor,
        LLMResolver,
        LLMFactory,
        ProviderRegistry,
        GraphRegistry,
    ],
})
export class WorkflowRuntimeModule {}
