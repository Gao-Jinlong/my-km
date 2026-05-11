/**
 * AiService — AI 核心服务（重构版）
 *
 * 职责：
 * - 保留现有 handleUserMessage / getConversationHistory 用于向后兼容
 * - 注入新服务（MessageService、ConversationService 等）
 * - 逐步将逻辑委托给新的模块化组件
 *
 * 注意：新请求应通过 RequestDispatcher.dispatch() 进入，
 * 此服务仅为向后兼容，将在后续版本中移除。
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { InFlightToolCall, LLMMessage, ToolDefinition } from './ai.types';
import { ConnectionManager } from './connection/connection-manager';
import { ConversationService } from './conversation/conversation.service';
import { MessageService } from './message/message.service';
import type { LLMProvider } from './provider/provider.types';
import type { AISessionManager } from './session/ai-session-manager';
import { ToolDispatcher } from './tools/tool.dispatcher';

@Injectable()
export class AiService {
    private readonly logger = new Logger(AiService.name);
    private provider: LLMProvider | null = null;
    private toolDefinitions: ToolDefinition[] = [];

    constructor(
        _prisma: PrismaService,
        private messageService: MessageService,
        _conversationService: ConversationService,
        private connectionManager: ConnectionManager,
        private toolDispatcher: ToolDispatcher,
    ) {}

    /**
     * 设置 LLM provider
     */
    setProvider(provider: LLMProvider): void {
        this.provider = provider;
        this.logger.log(`LLM provider set to: ${provider.name}`);
    }

    /**
     * 设置工具定义（发送给 LLM）
     */
    setToolDefinitions(tools: ToolDefinition[]): void {
        this.toolDefinitions = tools;
        this.toolDispatcher.registerMany(tools);
    }

    /**
     * 处理用户消息（保留向后兼容）
     *
     * 注意：此方法已被废弃，新请求应通过 RequestDispatcher.dispatch() 进入。
     * 请求应通过 RequestDispatcher.dispatch() 进入。
     */
    async handleUserMessage(
        conversationId: string,
        content: string,
        _context?: Record<string, unknown>,
        abortSignal?: AbortSignal,
    ): Promise<void> {
        if (!this.provider) {
            this.sendError(conversationId, 'LLM provider not configured', 'NO_PROVIDER');
            return;
        }

        // 保存用户消息
        await this.messageService.create({ conversationId, role: 'user', content });

        // 构建对话历史
        const messages = await this.messageService.buildLLMHistory(conversationId);

        // 推送 tool call 到前端并等待结果
        let currentMessages = [...messages];
        const maxToolRounds = 10;
        let round = 0;

        while (round < maxToolRounds) {
            round++;
            let assistantText = '';
            const toolCalls: InFlightToolCall[] = [];

            // 调用 LLM
            for await (const output of this.provider.chat(
                currentMessages,
                this.toolDefinitions,
                abortSignal,
            )) {
                if (output.type === 'text_chunk') {
                    assistantText += output.content ?? '';
                    this.sendStreamChunk(conversationId, output.content ?? '');
                } else if (output.type === 'tool_call') {
                    if (output.toolCall?.id && output.toolCall?.name) {
                        toolCalls.push({
                            id: output.toolCall.id,
                            name: output.toolCall.name,
                            arguments: output.toolCall.arguments ?? {},
                            timestamp: new Date(),
                        });
                    }
                } else if (output.type === 'done') {
                    break;
                }

                if (abortSignal?.aborted) {
                    this.sendStreamDone(conversationId);
                    return;
                }
            }

            // 保存助手消息
            if (assistantText) {
                await this.messageService.create({
                    conversationId,
                    role: 'assistant',
                    content: assistantText,
                    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
                });
            }

            // 无工具调用 → 结束
            if (toolCalls.length === 0) {
                this.sendStreamDone(conversationId);
                return;
            }

            // 发送 tool_call 事件给前端
            for (const tool of toolCalls) {
                this.sendToolCall(conversationId, tool);
            }

            // 等待前端返回 tool_result
            // 注意：这里仍然使用旧的事件机制，将在 Phase 3 中替换为 ToolDispatcher
            const results = await this._waitForToolResultsLegacy(conversationId, toolCalls, 30000);

            if (!results) {
                this.sendError(conversationId, 'Tool execution timed out', 'TOOL_TIMEOUT');
                this.sendStreamDone(conversationId);
                return;
            }

            // 将 tool results 添加到消息中继续 LLM 调用
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

                await this.messageService.create({
                    conversationId,
                    role: 'tool',
                    content: JSON.stringify(result),
                    toolResultId: toolId,
                });
            }

            currentMessages = [
                ...currentMessages,
                { role: 'assistant', content: assistantText || undefined } as LLMMessage,
                ...toolResultMessages,
            ];
        }

        this.logger.warn(
            `Max tool rounds (${maxToolRounds}) exceeded for conversation ${conversationId}`,
        );
        this.sendStreamDone(conversationId);
    }

    /**
     * 停止当前生成
     */
    stopGeneration(_conversationId: string, abortController: AbortController): void {
        abortController.abort();
    }

    /**
     * 加载对话历史（委托给 MessageService）
     */
    async getConversationHistory(conversationId: string): Promise<object[]> {
        const messages = await this.messageService.findByConversationId(conversationId);

        return messages.map(msg => ({
            id: msg.id,
            role: msg.role,
            content: msg.content,
            toolCalls: (msg.toolCalls as Array<{ name: string }>) ?? [],
            toolCallId: msg.toolResultId ?? undefined,
            createdAt: msg.createdAt.toISOString(),
        }));
    }

    // ========== 私有方法 ==========

    /**
     * 等待工具结果（委托给 ToolDispatcher，消除全局 EventEmitter）
     */
    private async _waitForToolResultsLegacy(
        conversationId: string,
        toolCalls: InFlightToolCall[],
        timeoutMs: number,
    ): Promise<Record<string, unknown> | null> {
        return this.toolDispatcher.waitForResultsByConversation(
            conversationId,
            toolCalls,
            timeoutMs,
        );
    }

    private sendStreamChunk(conversationId: string, content: string): void {
        this.connectionManager.emitToConversation(conversationId, 'stream_chunk', {
            type: 'stream_chunk',
            content,
        });
    }

    private sendStreamDone(conversationId: string): void {
        this.connectionManager.emitToConversation(conversationId, 'stream_done', {
            type: 'stream_done',
        });
    }

    private sendError(conversationId: string, message: string, code: string): void {
        this.connectionManager.emitToConversation(conversationId, 'error', {
            type: 'error',
            message,
            code,
        });
    }

    private sendToolCall(conversationId: string, tool: InFlightToolCall): void {
        this.connectionManager.emitToConversation(conversationId, 'tool_call', {
            type: 'tool_call',
            id: tool.id,
            name: tool.name,
            arguments: tool.arguments,
        });
    }
}
