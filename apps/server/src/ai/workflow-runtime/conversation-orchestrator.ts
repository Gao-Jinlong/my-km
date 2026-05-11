/**
 * ConversationOrchestrator — 对话编排器
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
import { ConnectionManager } from '../connection/connection-manager';
import { MessageService } from '../message/message.service';
import type { LLMConfig, NodeLLMConfigMap } from '../provider/provider.types';
import type { AISession } from '../session/ai-session.types';
import { AISessionManager } from '../session/ai-session-manager';
import type { WorkflowExecutionContext } from './workflow.types';
import { WorkflowExecutor } from './workflow-executor';

@Injectable()
export class ConversationOrchestrator {
    private readonly logger = new Logger(ConversationOrchestrator.name);

    constructor(
        private messageService: MessageService,
        private sessionManager: AISessionManager,
        private workflowExecutor: WorkflowExecutor,
        _connectionManager: ConnectionManager,
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
        } = {},
    ): Promise<void> {
        const { conversationId } = session;

        // 1. 保存用户消息
        await this.messageService.create({
            conversationId,
            role: 'user',
            content,
        });

        // 2. 构建上下文（历史消息由 workflowExecutor 负责构建）

        // 3. 构建工作流执行上下文
        const workflowCtx: WorkflowExecutionContext = {
            conversationId,
            sessionId: session.id,
            content,
            llmConfigMap: opts.llmConfigMap,
            tokenLimit: opts.tokenLimit,
            abortSignal: session.abortController.signal,
        };

        // 4. 执行工作流
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
