/**
 * RequestDispatcher — rate limit + dispatch execution.
 *
 * Phase 3 rewrite: uses RoomSessionRegistry for concurrency guard (not AISessionManager).
 * Calls the orchestrator directly with callbacks already built by AiMessageRouter.
 */

import { Injectable, Logger } from '@nestjs/common';
import { SocketRegistry } from '../../ws/socket-registry';
import type { WorkflowCallbacks } from '../gateway/room-session.types';
import { RoomOrchestrator } from '../workflow-runtime/orchestrator';
import { AiRateLimiter } from './rate-limiter.guard';

export interface DispatchContext {
    roomId: string;
    clientId: string;
    content: string;
    context?: Record<string, unknown>;
    llmConfigMap?: Record<
        string,
        { provider: string; model: string; temperature?: number; maxTokens?: number }
    >;
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
