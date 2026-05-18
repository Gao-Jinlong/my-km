/**
 * RequestDispatcher — 请求分发
 *
 * 负责：
 * - 消息验证和速率限制
 * - 会话创建和并发控制
 * - 调用 RoomOrchestrator 执行对话
 *
 * 请求分发流程:
 * ┌───────────┐    ┌──────────────┐    ┌───────────────┐    ┌──────────────────┐
 * │  Message   │───▶│  Validate    │───▶│  Create       │───▶│  Room             │
 * │  Received  │    │  + RateLimit │    │  AISession    │    │  Orchestrator    │
 * └───────────┘    └──────────────┘    └───────────────┘    └──────────────────┘
 */

import { Injectable, Logger } from '@nestjs/common';
import { SocketRegistry } from '../../ws/socket-registry';
import { RoomService } from '../conversation/room.service';
import { AISessionManager } from '../session/ai-session-manager';
import { RoomOrchestrator } from '../workflow-runtime/room-orchestrator';
import { AiRateLimiter } from './rate-limiter.guard';

export interface DispatchContext {
    roomId: string;
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
        private orchestrator: RoomOrchestrator,
        private socketRegistry: SocketRegistry,
        private roomService: RoomService,
        private rateLimiter: AiRateLimiter,
    ) {}

    /**
     * 分发用户消息
     */
    async dispatch(ctx: DispatchContext): Promise<void> {
        const { roomId, clientId, content } = ctx;

        // 1. 查找对话（不存在则自动创建，兼容 join 尚未到达的竞态）
        let room = await this.roomService.findById(roomId);
        if (!room) {
            this.logger.log(`[${clientId}] room not found in dispatch, creating: ${roomId}`);
            room = await this.roomService.create({
                id: roomId,
                userId: undefined,
            });
        }

        const userId = room.userId ?? null;
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
            roomId,
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
            this.sessionManager.cleanup(roomId);
        }
    }
}
