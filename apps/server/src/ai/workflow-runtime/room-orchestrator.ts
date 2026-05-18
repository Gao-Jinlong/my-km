/**
 * RoomOrchestrator — 对话编排器
 *
 * 替代 AILoopOrchestrator。
 * 负责：
 * - 接收用户消息
 * - 构建上下文（消息持久化、历史构建）
 * - 触发工作流执行
 *
 * 数据流:
 * ┌─────────────┐    ┌──────────────┐    ┌───────────────┐    ┌──────────────┐
 * │  User Msg   │───▶│  Save &     │───▶│  Build        │───▶│  Workflow    │
 * │  Received   │    │  Build Hist │    │  Context      │    │  Executor    │
 * └─────────────┘    └──────────────┘    └───────────────┘    └──────────────┘
 */

import { Injectable, Logger } from '@nestjs/common';
import type { ServerMessage } from '../gateway/ai-ws-events.types';
import { RoomStateMachineFactory } from '../gateway/room-statemachine-factory';
import { MessageService } from '../message/message.service';
import type { LLMConfig, NodeLLMConfigMap } from '../provider/provider.types';
import type { AISession } from '../session/ai-session.types';
import { AISessionManager } from '../session/ai-session-manager';
import type { WorkflowCallbacks, WorkflowExecutionContext } from './workflow.types';
import { WorkflowExecutor } from './workflow-executor';

@Injectable()
export class RoomOrchestrator {
    private readonly logger = new Logger(RoomOrchestrator.name);

    constructor(
        private messageService: MessageService,
        private sessionManager: AISessionManager,
        private workflowExecutor: WorkflowExecutor,
        private smFactory: RoomStateMachineFactory,
    ) {}

    /**
     * 编排对话执行
     */
    async dispatch(
        session: AISession,
        content: string,
        opts: {
            llmConfigMap?: NodeLLMConfigMap;
            defaultLlmConfig?: LLMConfig;
            graphName?: string;
            tokenLimit?: number;
            emit?: (msg: ServerMessage) => void;
        } = {},
    ): Promise<void> {
        const { roomId } = session;

        // 1. 保存用户消息
        await this.messageService.create({
            roomId,
            role: 'user',
            content,
        });

        // 2. 确保 FSM 存在
        const emit = opts.emit ?? (() => {});
        this.smFactory.create({
            roomId,
            clientId: session.clientId,
            emit,
        });

        // 3. Build callback bridge from transport layer (RoomStateMachine)
        //    to business layer (WorkflowExecutor). This decouples WorkflowExecutor
        //    from knowing about the state machine directly.
        const callbacks: WorkflowCallbacks = {
            onTextChunk: (_convId, chunk) => {
                const sm = this.smFactory.get(roomId);
                sm?.textChunk(chunk);
            },
            onToolCall: (_convId, info) => {
                const sm = this.smFactory.get(roomId);
                sm?.toolCall(info.toolCallId, info.toolName, info.input, info.requiresConfirmation);
            },
            onLlmDone: () => {
                const sm = this.smFactory.get(roomId);
                sm?.llmDone();
            },
            onError: (_convId, code, message) => {
                const sm = this.smFactory.get(roomId);
                sm?.error(code, message);
            },
            onStop: () => {
                const sm = this.smFactory.get(roomId);
                sm?.stop();
            },
        };

        // 4. 构建工作流执行上下文 with injected callbacks
        const workflowCtx: WorkflowExecutionContext = {
            roomId,
            sessionId: session.id,
            content,
            llmConfigMap: opts.llmConfigMap,
            tokenLimit: opts.tokenLimit,
            abortSignal: session.abortController.signal,
            callbacks,
        };

        // 5. 执行工作流
        try {
            this.sessionManager.updateStatus(session.id, 'streaming');

            // 中止检查
            if (session.abortController.signal.aborted) {
                this.logger.log(`Session ${session.id} aborted before execution`);
                return;
            }

            await this.workflowExecutor.execute(workflowCtx, opts.graphName);
            this.sessionManager.updateStatus(session.id, 'completed');
        } catch (error) {
            if ((error as Error).name === 'AbortError') {
                this.sessionManager.updateStatus(session.id, 'aborted');
                return;
            }
            this.logger.error(`Orchestration failed: ${error}`);
            this.sessionManager.updateStatus(session.id, 'error');
        }
    }
}
