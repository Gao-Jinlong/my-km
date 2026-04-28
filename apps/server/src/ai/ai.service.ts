/**
 * AiService — AI 核心服务
 *
 * 负责：
 * - 消息编排和 LLM 调用
 * - Tool call 循环管理
 * - 对话历史持久化
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { aiToolEvent } from './ai.gateway';
import type { InFlightToolCall, LLMMessage, ToolDefinition } from './ai.types';
import type { LLMProvider } from './llm/llm-provider.interface';

/**
 * WebSocket 客户端抽象（用于向连接的客户端推送消息）
 */
export interface WSClient {
    send(message: object): void;
}

@Injectable()
export class AiService {
    private readonly logger = new Logger(AiService.name);
    private provider: LLMProvider | null = null;
    private toolDefinitions: ToolDefinition[] = [];
    private clients = new Map<string, WSClient>(); // conversationId -> client

    constructor(private prisma: PrismaService) {}

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
    }

    /**
     * 注册 WebSocket 客户端
     */
    registerClient(conversationId: string, client: WSClient): void {
        this.clients.set(conversationId, client);
    }

    /**
     * 移除 WebSocket 客户端
     */
    removeClient(conversationId: string): void {
        this.clients.delete(conversationId);
    }

    /**
     * 处理用户消息
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
        await this.saveMessage(conversationId, 'user', content);

        // 构建对话历史
        const messages = await this.buildMessages(conversationId);

        // 推送 tool call 到前端并等待结果
        let currentMessages = [...messages];
        const maxToolRounds = 10; // 防止无限循环
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
                    toolCalls.push({
                        id: output.toolCall?.id,
                        name: output.toolCall?.name,
                        arguments: output.toolCall?.arguments,
                        timestamp: new Date(),
                    });
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
                await this.saveMessage(conversationId, 'assistant', assistantText, toolCalls);
            }

            // 如果有工具调用，发送给前端执行
            if (toolCalls.length === 0) {
                // 无工具调用，对话结束
                this.sendStreamDone(conversationId);
                return;
            }

            // 发送 tool_call 事件给前端
            for (const tool of toolCalls) {
                this.sendToolCall(conversationId, tool);
            }

            // 等待前端返回 tool_result（通过 handleToolResult 方法）
            // 这里使用 Promise race with timeout
            const results = await this.waitForToolResults(conversationId, toolCalls, 30000);

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

                // 保存 tool 结果到 DB
                await this.saveMessage(conversationId, 'tool', JSON.stringify(result), [], toolId);
            }

            currentMessages = [
                ...currentMessages,
                {
                    role: 'assistant',
                    content: assistantText || undefined,
                } as LLMMessage,
                ...toolResultMessages,
            ];
        }

        this.logger.warn(
            `Max tool rounds (${maxToolRounds}) exceeded for conversation ${conversationId}`,
        );
        this.sendStreamDone(conversationId);
    }

    /**
     * 处理前端返回的工具结果
     * 注意：在 MVP 中，tool call 是同步等待的（通过 waitForToolResults），
     * 这个方法保留用于未来异步处理。
     */
    handleToolResult(_conversationId: string, _toolCallId: string, _result: unknown): void {
        // 当前在 handleUserMessage 中通过 Promise 等待
        // 保留此方法用于未来扩展
    }

    /**
     * 停止当前生成
     */
    stopGeneration(_conversationId: string, abortController: AbortController): void {
        abortController.abort();
    }

    /**
     * 加载对话历史
     */
    async getConversationHistory(conversationId: string): Promise<object[]> {
        const messages = await this.prisma.message.findMany({
            where: { conversationId },
            orderBy: { createdAt: 'asc' },
            take: 100,
            select: {
                id: true,
                role: true,
                content: true,
                toolCalls: true,
                toolResultId: true,
                createdAt: true,
            },
        });

        return messages.map(msg => ({
            id: msg.id,
            role: msg.role,
            content: msg.content,
            toolCalls: (msg.toolCalls as Array<{ name: string }>) ?? [],
            toolCallId: msg.toolResultId ?? undefined,
            createdAt: msg.createdAt.toISOString(),
        }));
    }

    /**
     * 等待前端返回工具结果（带超时）
     *
     * 注意：这里使用一个简单的 Promise 方案。在完整实现中，
     * 应该使用更健壮的消息队列机制。
     */
    private waitForToolResults(
        conversationId: string,
        toolCalls: InFlightToolCall[],
        timeoutMs: number,
    ): Promise<Record<string, unknown> | null> {
        return new Promise(resolve => {
            const results: Record<string, unknown> = {};
            let resolved = false;

            const timeout = setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    aiToolEvent.removeListener('tool_result', handler);
                    resolve(null);
                }
            }, timeoutMs);

            const handler = (data: {
                conversationId: string;
                toolCallId: string;
                result: unknown;
                error?: string;
            }) => {
                if (data.conversationId !== conversationId) return;
                const { toolCallId, result, error } = data;

                if (error) {
                    results[toolCallId] = { error };
                } else {
                    results[toolCallId] = result;
                }

                // 所有工具都有结果了
                if (Object.keys(results).length >= toolCalls.length) {
                    clearTimeout(timeout);
                    if (!resolved) {
                        resolved = true;
                        aiToolEvent.removeListener('tool_result', handler);
                        resolve(results);
                    }
                }
            };

            aiToolEvent.on('tool_result', handler);
        });
    }

    // ========== 私有方法 ==========

    private async buildMessages(conversationId: string): Promise<LLMMessage[]> {
        const history = await this.getConversationHistory(conversationId);
        return history.map((msg: any) => ({
            role: msg.role as 'user' | 'assistant' | 'tool',
            content: msg.content ?? '',
        })) as LLMMessage[];
    }

    private async saveMessage(
        conversationId: string,
        role: string,
        content: string | null,
        toolCalls: InFlightToolCall[] = [],
        toolResultId?: string,
    ): Promise<void> {
        await this.prisma.message.create({
            data: {
                conversationId,
                role,
                content,
                toolCalls:
                    toolCalls.length > 0
                        ? JSON.parse(
                              JSON.stringify(toolCalls.map(t => ({ id: t.id, name: t.name }))),
                          )
                        : undefined,
                toolResultId,
            },
        });
    }

    private sendStreamChunk(conversationId: string, content: string): void {
        const client = this.clients.get(conversationId);
        if (client) {
            client.send({ type: 'stream_chunk', content });
        }
    }

    private sendStreamDone(conversationId: string): void {
        const client = this.clients.get(conversationId);
        if (client) {
            client.send({ type: 'stream_done' });
        }
    }

    private sendError(conversationId: string, message: string, code: string): void {
        const client = this.clients.get(conversationId);
        if (client) {
            client.send({ type: 'error', message, code });
        }
    }

    private sendToolCall(conversationId: string, tool: InFlightToolCall): void {
        const client = this.clients.get(conversationId);
        if (client) {
            client.send({
                type: 'tool_call',
                id: tool.id,
                name: tool.name,
                arguments: tool.arguments,
            });
        }
    }
}
