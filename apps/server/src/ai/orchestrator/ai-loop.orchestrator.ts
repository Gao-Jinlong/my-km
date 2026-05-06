/**
 * AILoopOrchestrator — Tool-call 循环编排
 *
 * 负责：
 * - Tool-call 循环执行
 * - 流式输出编排
 * - 中断/恢复
 * - 错误恢复
 *
 * 状态机流程:
 * ┌─────────┐    ┌───────────┐    ┌──────────────┐    ┌───────────┐
 * │  Build   │───▶│  LLM Call  │───▶│ Stream Output│───▶│  No Tools │
 * │  History │    │  (stream)  │    │ + Tool Detect│    │  → Done   │
 * └─────────┘    └───────────┘    └───────┬──────┘    └───────────┘
 *                                         │
 *                                  Has Tool Calls
 *                                         │
 *                                         ▼
 *                                  ┌──────────────┐
 *                                  │ Wait Results │◀── ToolDispatcher
 *                                  └──────┬───────┘
 *                                         │
 *                                         ▼
 *                                  ┌──────────────┐
 *                                  │ Append & Loop│──▶ back to LLM Call
 *                                  └──────────────┘
 */

import { Injectable, Logger } from '@nestjs/common';
import type { InFlightToolCall, LLMMessage, LLMOutput } from '../ai.types';
import { ConnectionManager } from '../connection/connection-manager';
import { MessageService } from '../message/message.service';
import { ProviderRouter } from '../provider/provider.router';
import type { AISession } from '../session/ai-session.types';
import { AISessionManager } from '../session/ai-session-manager';
import { ToolDispatcher } from '../tools/tool.dispatcher';
import type { LoopOpts } from './ai-loop.types';
import { StreamHandler } from './stream.handler';

@Injectable()
export class AILoopOrchestrator {
    private readonly logger = new Logger(AILoopOrchestrator.name);
    private readonly MAX_TOOL_ROUNDS = 10;

    constructor(
        private messageService: MessageService,
        private providerRouter: ProviderRouter,
        private toolDispatcher: ToolDispatcher,
        private sessionManager: AISessionManager,
        private connectionManager: ConnectionManager,
    ) {}

    /**
     * 执行 AI 循环
     */
    async execute(session: AISession, content: string, opts: LoopOpts = {}): Promise<void> {
        const maxRounds = opts.maxToolRounds ?? this.MAX_TOOL_ROUNDS;
        const { conversationId } = session;

        // 保存用户消息
        await this.messageService.create({
            conversationId,
            role: 'user',
            content,
        });

        // 构建对话历史
        let currentMessages = await this.messageService.buildLLMHistory(
            conversationId,
            opts.tokenLimit,
        );

        let round = 0;

        while (round < maxRounds) {
            round++;

            if (session.abortController.signal.aborted) {
                this.logger.log(`Session ${session.id} aborted before LLM call (round ${round})`);
                return;
            }

            // 选择 provider
            const provider = this.providerRouter.select();

            // 创建流处理器
            const toolCalls: InFlightToolCall[] = [];
            const streamHandler = new StreamHandler({
                onChunk: text => {
                    this.connectionManager.emitToConversation(conversationId, 'stream_chunk', {
                        type: 'stream_chunk',
                        content: text,
                    });
                },
                onToolCall: tc => {
                    toolCalls.push({
                        id: tc.id,
                        name: tc.name,
                        arguments: tc.arguments,
                        timestamp: new Date(),
                    });
                    this.connectionManager.emitToConversation(conversationId, 'tool_call', {
                        type: 'tool_call',
                        id: tc.id,
                        name: tc.name,
                        arguments: tc.arguments,
                    });
                },
                onDone: () => {
                    // LLM 流结束
                },
                onError: err => {
                    this.logger.error(`Stream error: ${err.message}`);
                },
            });

            // 调用 LLM
            try {
                this.sessionManager.updateStatus(session.id, 'streaming');

                for await (const output of provider.chat(
                    currentMessages,
                    this.toolDispatcher.getDefinitions(),
                    session.abortController.signal,
                )) {
                    streamHandler.handleChunk(output as LLMOutput);

                    if (session.abortController.signal.aborted) {
                        this.logger.log(`Session ${session.id} aborted during streaming`);
                        this.connectionManager.emitToConversation(conversationId, 'stream_done', {
                            type: 'stream_done',
                        });
                        return;
                    }
                }
            } catch (error) {
                if ((error as Error).name === 'AbortError') {
                    this.connectionManager.emitToConversation(conversationId, 'stream_done', {
                        type: 'stream_done',
                    });
                    return;
                }
                this.logger.error(`LLM call failed: ${error}`);
                this.connectionManager.emitToConversation(conversationId, 'error', {
                    type: 'error',
                    message: 'LLM call failed',
                    code: 'LLM_ERROR',
                });
                return;
            }

            // 保存助手消息
            if (streamHandler.text) {
                await this.messageService.create({
                    conversationId,
                    role: 'assistant',
                    content: streamHandler.text,
                    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
                });
            }

            // 无工具调用 → 结束
            if (toolCalls.length === 0) {
                this.connectionManager.emitToConversation(conversationId, 'stream_done', {
                    type: 'stream_done',
                });
                return;
            }

            // 等待工具结果
            this.sessionManager.updateStatus(session.id, 'waiting_tool');

            const results = await this.toolDispatcher.waitForResults(
                session.id,
                conversationId,
                toolCalls,
                30_000,
            );

            if (!results) {
                this.connectionManager.emitToConversation(conversationId, 'error', {
                    type: 'error',
                    message: 'Tool execution timed out',
                    code: 'TOOL_TIMEOUT',
                });
                this.connectionManager.emitToConversation(conversationId, 'stream_done', {
                    type: 'stream_done',
                });
                return;
            }

            // 构建 tool result 消息继续循环
            const toolResultMessages: LLMMessage[] = [];
            for (const [toolId, result] of Object.entries(results)) {
                toolResultMessages.push({
                    role: 'tool',
                    content: [
                        {
                            type: 'tool_result',
                            tool_use_id: toolId,
                            content: JSON.stringify(result),
                        },
                    ],
                });

                // 保存 tool 结果到 DB
                await this.messageService.create({
                    conversationId,
                    role: 'tool',
                    content: JSON.stringify(result),
                    toolResultId: toolId,
                });
            }

            currentMessages = [
                ...currentMessages,
                {
                    role: 'assistant',
                    content: streamHandler.text || undefined,
                } as LLMMessage,
                ...toolResultMessages,
            ];
        }

        this.logger.warn(
            `Max tool rounds (${maxRounds}) exceeded for conversation ${conversationId}`,
        );
        this.connectionManager.emitToConversation(conversationId, 'stream_done', {
            type: 'stream_done',
        });
    }
}
