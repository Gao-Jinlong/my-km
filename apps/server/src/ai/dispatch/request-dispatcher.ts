/**
 * RequestDispatcher — 请求分发
 *
 * 负责：
 * - 消息类型路由
 * - 会话查找/创建
 * - 并发控制
 * - 上下文组装
 *
 * 请求分发流程:
 * ┌───────────┐    ┌──────────────┐    ┌───────────────┐    ┌──────────────┐
 * │  Message   │───▶│  Validate    │───▶│  Find/Create  │───▶│  AILoop      │
 * │  Received  │    │  + RateLimit │    │  AISession    │    │  Orchestrator│
 * └───────────┘    └──────────────┘    └───────────────┘    └──────────────┘
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConnectionManager } from '../connection/connection-manager';
import { ConversationService } from '../conversation/conversation.service';
import { AILoopOrchestrator } from '../orchestrator/ai-loop.orchestrator';
import { AISessionManager } from '../session/ai-session-manager';
import { AiRateLimiter } from './rate-limiter.guard';

export interface DispatchContext {
    conversationId: string;
    clientId: string;
    content: string;
    context?: Record<string, unknown>;
    model?: string;
    provider?: string;
}

@Injectable()
export class RequestDispatcher {
    private readonly logger = new Logger(RequestDispatcher.name);

    constructor(
        private sessionManager: AISessionManager,
        private loopOrchestrator: AILoopOrchestrator,
        private connectionManager: ConnectionManager,
        private conversationService: ConversationService,
        private rateLimiter: AiRateLimiter,
    ) {}

    /**
     * 分发用户消息
     */
    async dispatch(ctx: DispatchContext): Promise<void> {
        const { conversationId, clientId, content } = ctx;

        // 1. 速率限制检查
        const conversation = await this.conversationService.findById(conversationId);
        const userId = conversation?.userId ?? null;
        if (!this.rateLimiter.check(userId, clientId)) {
            this.connectionManager.emitToConversation(conversationId, 'error', {
                type: 'error',
                message: 'Rate limit exceeded. Please try again later.',
                code: 'RATE_LIMITED',
            });
            return;
        }

        // 2. 确保对话存在（如果不存在则创建）
        let conv = conversation;
        if (!conv) {
            conv = await this.conversationService.create({
                userId: undefined, // 匿名用户
            });
        }

        // 3. 创建 AI 会话（并发控制）
        const session = this.sessionManager.create({
            conversationId,
            clientId,
        });

        try {
            // 4. 将客户端加入对话
            this.connectionManager.joinConversation(clientId, conversationId);

            // 5. 执行 AI 循环
            await this.loopOrchestrator.execute(session, content);
        } catch (error) {
            this.logger.error(`Dispatch failed for session ${session.id}:`, error);
            this.connectionManager.emitToConversation(conversationId, 'error', {
                type: 'error',
                message: error instanceof Error ? error.message : 'Unknown error',
                code: 'DISPATCH_ERROR',
            });
        } finally {
            // 6. 清理会话
            this.sessionManager.cleanup(conversationId);
        }
    }
}
