/**
 * RequestDispatcher — rate limit + dispatch execution.
 *
 * Phase 3 rewrite: uses RoomSessionRegistry for concurrency guard (not AISessionManager).
 * Calls the orchestrator directly with callbacks already built by AiMessageRouter.
 */

import { Injectable, Logger } from '@nestjs/common';
import { SocketRegistry } from '../../ws/socket-registry';
import type { LLMConfig } from '../llm/provider.types';
import type { WorkflowCallbacks } from '../session/room-session.types';
import { RoomOrchestrator } from '../workflow/orchestrator';
import { AiRateLimiter } from './rate-limiter.guard';

export interface DispatchContext {
    roomId: string;
    clientId: string;
    content: string;
    context?: Record<string, unknown>;
    llmConfigMap?: Record<string, LLMConfig>;
    defaultConfig?: LLMConfig;
    graphName?: string;
    callbacks?: WorkflowCallbacks;
}

@Injectable()
export class RequestDispatcher {
    private readonly logger = new Logger(RequestDispatcher.name);

    constructor(
        private orchestrator: RoomOrchestrator,
        private socketRegistry: SocketRegistry,
        private rateLimiter: AiRateLimiter,
    ) {}

    async dispatch(ctx: DispatchContext): Promise<void> {
        const { roomId, clientId, content } = ctx;

        // 1. Rate limit check
        if (!this.rateLimiter.check(null, clientId)) {
            this.socketRegistry.emitToClient(clientId, 'error', {
                type: 'error',
                message: 'Rate limit exceeded. Please try again later.',
                code: 'RATE_LIMITED',
            });
            // TODO: 超时信息也可以让 llm 进行感知，因此可以将错误写入到对话历史中，而不仅仅是通过 WebSocket 发送错误消息。这样用户在查看对话历史时也能看到哪些消息被限流了。
            return;
        }

        // 2. Execute orchestration with callbacks (default to no-op for REST callers)
        const callbacks = ctx.callbacks ?? this._noOpCallbacks();

        try {
            await this.orchestrator.dispatch({
                roomId,
                clientId,
                content,
                llmConfigMap: ctx.llmConfigMap,
                defaultConfig: ctx.defaultConfig,
                graphName: ctx.graphName,
                callbacks,
            });
        } catch (error) {
            this.logger.error(`Dispatch failed for room ${roomId}:`, error);
            this.socketRegistry.emitToClient(clientId, 'error', {
                type: 'error',
                message: error instanceof Error ? error.message : 'Unknown error',
                code: 'DISPATCH_ERROR',
            });
        }
    }

    private _noOpCallbacks(): WorkflowCallbacks {
        return {
            onTextChunk: () => {},
            onToolCall: () => {},
            onLlmDone: () => {},
            onError: () => {},
        };
    }
}
