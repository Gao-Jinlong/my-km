/**
 * RoomOrchestrator — thin orchestrator delegating to Executor.
 *
 * Phase 4 rewrite: no longer depends on RoomStateMachineFactory or AISessionManager.
 * Receives pre-built callbacks from AiMessageRouter, creates Executor instance, and executes.
 */

import { Injectable, Logger } from '@nestjs/common';
import type { NodeLLMConfigMap } from '../llm/provider.types';
import { MessageService } from '../message/message.service';
import { RoomSessionRegistry } from '../session/room-session-registry';
import { ToolDispatcher } from '../tools/tool.dispatcher';
import { ToolRouter } from '../tools/tool-router';
import { Executor } from './executor';
import type { ExecutionCtx, ExecutorDependencies, WorkflowCallbacks } from './executor.types';
import { GraphRegistry } from './graph-registry';
import { LLMResolver } from './llm-resolver';

export interface OrchestratorDispatchCtx {
    roomId: string;
    clientId: string;
    content: string;
    callbacks: WorkflowCallbacks;
    llmConfigMap?: NodeLLMConfigMap;
    graphName?: string;
    tokenLimit?: number;
}

@Injectable()
export class RoomOrchestrator {
    private readonly logger = new Logger(RoomOrchestrator.name);

    constructor(
        private roomSessionRegistry: RoomSessionRegistry,
        private messageService: MessageService,
        private graphRegistry: GraphRegistry,
        private llmResolver: LLMResolver,
        private toolDispatcher: ToolDispatcher,
        private toolRouter: ToolRouter,
    ) {}

    async dispatch(ctx: OrchestratorDispatchCtx): Promise<void> {
        const { roomId, callbacks } = ctx;

        const session = this.roomSessionRegistry.get(roomId);
        if (!session) {
            callbacks.onError(roomId, 'DISPATCH_ERROR', 'No active session for this room');
            return;
        }

        const executionCtx: ExecutionCtx = {
            roomId,
            clientId: session.clientId,
            content: ctx.content,
            callbacks,
            abortSignal: session.abortController.signal,
            llmConfigMap: ctx.llmConfigMap,
            graphName: ctx.graphName,
            tokenLimit: ctx.tokenLimit,
        };

        const deps: ExecutorDependencies = {
            messageService: this.messageService,
            graphRegistry: this.graphRegistry,
            llmResolver: this.llmResolver,
            toolDispatcher: this.toolDispatcher,
            toolRouter: this.toolRouter,
        };

        const executor = new Executor(executionCtx, deps);
        await executor.execute();
        // executor instance is discarded after this
    }
}
