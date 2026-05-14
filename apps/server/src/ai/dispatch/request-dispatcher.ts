/**
 * RequestDispatcher — 请求分发
 *
 * 负责：
 * - 消息验证和速率限制
 * - 会话创建和并发控制
 * - 调用 ConversationOrchestrator 执行对话
 *
 * 请求分发流程:
 * ┌───────────┐    ┌──────────────┐    ┌───────────────┐    ┌──────────────────┐
 * │  Message   │───▶│  Validate    │───▶│  Create       │───▶│  Conversation    │
 * │  Received  │    │  + RateLimit │    │  AISession    │    │  Orchestrator    │
 * └───────────┘    └──────────────┘    └───────────────┘    └──────────────────┘
 */

import { Injectable, Logger } from '@nestjs/common';
import { SocketRegistry } from '../../ws/socket-registry';
import { ConversationService } from '../conversation/conversation.service';
import { AISessionManager } from '../session/ai-session-manager';
import { ConversationOrchestrator } from '../workflow-runtime/conversation-orchestrator';
import { AiRateLimiter } from './rate-limiter.guard';

export interface DispatchContext {
    conversationId: string;
    clientId: string;
    content: string;
    context?: Record<string, unknown>;
    llmConfigMap?: Record<
        string,
        {
            provider: string;
            model: string;
            temperature?: number;
            maxTokens?: number;
        }
    >;
    graphName?: string;
}

@Injectable()
export class RequestDispatcher {
    private readonly logger = new Logger(RequestDispatcher.name);

    constructor(
        private sessionManager: AISessionManager,
        private orchestrator: ConversationOrchestrator,
        private socketRegistry: SocketRegistry,
        private conversationService: ConversationService,
        private rateLimiter: AiRateLimiter,
    ) {}

    /**
     * 分发用户消息
     */
    async dispatch(ctx: DispatchContext): Promise<void> {
        const { conversationId, clientId, content } = ctx;

        // 1. 查找对话（不存在则自动创建，兼容 join 尚未到达的竞态）
        let conversation = await this.conversationService.findById(conversationId);
        if (!conversation) {
            this.logger.log(
                `[${clientId}] conversation not found in dispatch, creating: ${conversationId}`,
            );
            conversation = await this.conversationService.create({
                id: conversationId,
                userId: undefined,
            });
        }

        const userId = conversation.userId ?? null;
        if (!this.rateLimiter.check(userId, clientId)) {
            this.socketRegistry.emitToClient(clientId, 'error', {
                type: 'error',
                message: 'Rate limit exceeded. Please try again later.',
                code: 'RATE_LIMITED',
            });
            return;
        }

        // 2. 创建 AI 会话（并发控制）
        const session = this.sessionManager.create({
            conversationId,
            clientId,
        });

        try {
            // 3. 执行对话编排
            await this.orchestrator.dispatch(session, content, {
                llmConfigMap: ctx.llmConfigMap,
                graphName: ctx.graphName,
            });
        } catch (error) {
            this.logger.error(`Dispatch failed for session ${session.id}:`, error);
            this.socketRegistry.emitToClient(clientId, 'error', {
                type: 'error',
                message: error instanceof Error ? error.message : 'Unknown error',
                code: 'DISPATCH_ERROR',
            });
        } finally {
            // 4. 清理会话
            this.sessionManager.cleanup(conversationId);
        }
    }
}
