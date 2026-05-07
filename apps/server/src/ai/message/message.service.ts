/**
 * MessageService — 消息持久化和历史构建
 *
 * 负责：
 * - 消息创建
 * - 对话历史查询
 * - LLM 消息格式构建
 * - Token 统计
 */

import { Prisma } from '@my-km/prisma';
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { InFlightToolCall, LLMMessage } from '../ai.types';

export interface CreateMessageOpts {
    conversationId: string;
    role: string;
    content: string | null;
    toolCalls?: InFlightToolCall[];
    toolResultId?: string;
    tokenCount?: number;
    finishReason?: string;
    metadata?: Record<string, unknown>;
}

export interface ListMessageOpts {
    limit?: number;
    offset?: number;
    orderBy?: 'asc' | 'desc';
}

@Injectable()
export class MessageService {
    private readonly logger = new Logger(MessageService.name);

    constructor(private prisma: PrismaService) {}

    /**
     * 创建消息
     */
    async create(opts: CreateMessageOpts) {
        const message = await this.prisma.message.create({
            data: {
                conversationId: opts.conversationId,
                role: opts.role,
                content: opts.content,
                toolCalls:
                    opts.toolCalls && opts.toolCalls.length > 0
                        ? (opts.toolCalls.map(t => ({
                              id: t.id,
                              name: t.name,
                          })) as Prisma.InputJsonValue)
                        : undefined,
                toolResultId: opts.toolResultId,
                tokenCount: opts.tokenCount,
                finishReason: opts.finishReason,
                metadata: opts.metadata ? (opts.metadata as Prisma.InputJsonValue) : undefined,
            },
        });

        return message;
    }

    /**
     * 查询对话历史（默认 100 条，升序）
     */
    async findByConversationId(conversationId: string, opts: ListMessageOpts = {}) {
        const { limit = 100, offset = 0, orderBy = 'asc' } = opts;

        return this.prisma.message.findMany({
            where: { conversationId },
            orderBy: { createdAt: orderBy },
            take: limit,
            skip: offset,
            select: {
                id: true,
                role: true,
                content: true,
                toolCalls: true,
                toolResultId: true,
                tokenCount: true,
                createdAt: true,
            },
        });
    }

    /**
     * 构建 LLM 消息格式（用于发送给 LLM provider）
     *
     * 从数据库记录转换为 LLMMessage[]。
     * 支持上下文窗口管理：通过 maxTokens 参数限制总 token 数，
     * 从最新消息开始向前加载，直到达到 token 上限。
     *
     * 注意：当 maxTokens 未指定时，不限制条数（避免长对话静默截断）。
     */
    async buildLLMHistory(conversationId: string, maxTokens?: number): Promise<LLMMessage[]> {
        // 如果指定了 token 上限，先加载足够的消息（默认 200 条，足够覆盖大多数场景）
        const loadLimit = maxTokens !== undefined ? 200 : undefined;
        const messages = await this.findByConversationId(conversationId, {
            orderBy: 'asc',
            ...(loadLimit !== undefined && { limit: loadLimit }),
        });

        if (maxTokens !== undefined) {
            return this.trimToTokenLimit(messages, maxTokens);
        }

        return messages.map(msg => this.toLLMMessage(msg));
    }

    /**
     * 获取对话的 token 使用量
     */
    async getTokenUsage(conversationId: string): Promise<number> {
        const result = await this.prisma.message.aggregate({
            where: { conversationId },
            _sum: { tokenCount: true },
        });

        return result._sum.tokenCount ?? 0;
    }

    // ========== 私有方法 ==========

    /**
     * 将数据库记录转换为 LLMMessage
     *
     * 处理三种消息格式：
     * - user: 纯文本内容
     * - assistant: 可能包含 tool_use 的混合内容
     * - tool: tool_result 格式
     */
    private toLLMMessage(msg: {
        role: string;
        content: string | null;
        toolCalls?: unknown;
        toolResultId?: string | null;
    }): LLMMessage {
        if (msg.role === 'tool' && msg.toolResultId) {
            // Tool result message
            return {
                role: 'tool' as const,
                content: [
                    {
                        type: 'tool_result',
                        tool_use_id: msg.toolResultId,
                        content: msg.content ?? '',
                    },
                ],
            };
        }

        // For assistant messages with toolCalls, we need the full content block format
        // but since MVP stores only summary, we just return text content
        return {
            role: msg.role as 'user' | 'assistant' | 'tool',
            content: msg.content ?? '',
        };
    }

    /**
     * 根据 token 上限裁剪消息历史
     *
     * 策略：从最新消息开始向前加载，保留 system 消息（如果有），
     * 直到达到 token 上限。这样确保最近的对话上下文完整。
     */
    private trimToTokenLimit(
        messages: { role: string; content: string | null; tokenCount?: number | null }[],
        maxTokens: number,
    ): LLMMessage[] {
        // 估算每条消息的 token 数（content length / 4 作为粗略估算）
        const withTokens = messages.map(msg => ({
            ...msg,
            estimatedTokens: msg.tokenCount ?? Math.ceil((msg.content?.length ?? 0) / 4),
        }));

        const result: typeof messages = [];
        let totalTokens = 0;

        // 从后向前累加，直到超过上限
        for (let i = withTokens.length - 1; i >= 0; i--) {
            const msg = withTokens[i];
            if (totalTokens + msg.estimatedTokens > maxTokens) {
                break;
            }
            result.unshift(msg);
            totalTokens += msg.estimatedTokens;
        }

        this.logger.debug(
            `Trimmed history to ${result.length} messages (${totalTokens} tokens, limit: ${maxTokens})`,
        );

        return result.map(msg => this.toLLMMessage(msg));
    }
}
