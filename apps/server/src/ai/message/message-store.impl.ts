/**
 * MessageStoreImpl — 消息业务层实现。
 *
 * 职责：
 * - 消息格式转换（MessageRecord ↔ LLMMessage）
 * - 内存状态管理（init 加载，persist 增量更新）
 * - Token 裁剪策略
 * - Round 级事务语义编排
 *
 * 不关心具体存储实现 — 通过 MessageStoreProvider 接口委托。
 *
 * 线程安全：使用 Map<roomId, Record[]> 存储每个房间的状态，
 * 所有方法接受 roomId 参数，NestJS 单例模式下可安全处理多请求并发。
 */

import { Inject, Injectable, Logger } from '@nestjs/common';
import type { InFlightToolCall, LLMMessage } from '../ai.types';
import type { MessageStore } from './message-store.interface';
import type { CreateMessageInput, MessageRecord } from './message-store.types';
import type { MessageStoreProvider } from './providers/message-store-provider.interface';
import { MESSAGE_STORE_PROVIDER_TOKEN } from './providers/message-store-provider.interface';

@Injectable()
export class MessageStoreImpl implements MessageStore {
    private readonly logger = new Logger(MessageStoreImpl.name);

    /** 按 roomId 隔离的内存状态，避免多请求并发的竞态条件 */
    private memory = new Map<string, MessageRecord[]>();
    private tokenUsage = new Map<string, number>();

    constructor(
        @Inject(MESSAGE_STORE_PROVIDER_TOKEN)
        private provider: MessageStoreProvider,
    ) {}

    async init(roomId: string, maxTokens?: number): Promise<void> {
        const records = await this.provider.findByRoom(roomId, { orderBy: 'asc' });
        this.memory.set(
            roomId,
            maxTokens !== undefined ? this._trimToTokenLimit(records, maxTokens) : records,
        );
        this.tokenUsage.set(roomId, await this.provider.aggregateTokens(roomId));
        this.logger.debug(
            `MessageStore.init: loaded ${this.memory.get(roomId)?.length ?? 0} messages for room ${roomId}`,
        );
    }

    async persistUser(roomId: string, content: string): Promise<void> {
        const record = await this.provider.create({
            roomId,
            role: 'user',
            content,
        });
        this._getMemory(roomId).push(record);
    }

    async persistAssistant(
        roomId: string,
        content: string,
        toolCalls?: InFlightToolCall[],
    ): Promise<void> {
        const record = await this.provider.create({
            roomId,
            role: 'assistant',
            content,
            toolCalls,
        });
        this._getMemory(roomId).push(record);
    }

    async persistToolResult(roomId: string, toolResultId: string, content: string): Promise<void> {
        const record = await this.provider.create({
            roomId,
            role: 'tool',
            content,
            toolResultId,
        });
        this._getMemory(roomId).push(record);
    }

    async persistRound(
        roomId: string,
        assistantContent: string,
        toolCalls: InFlightToolCall[],
        toolResults: Record<string, unknown>,
    ): Promise<void> {
        const records: CreateMessageInput[] = [
            {
                roomId,
                role: 'assistant',
                content: assistantContent,
                toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
            },
            ...Object.entries(toolResults).map(([toolId, result]) => ({
                roomId,
                role: 'tool' as const,
                content: typeof result === 'string' ? result : JSON.stringify(result),
                toolResultId: toolId,
            })),
        ];

        const persisted = await this.provider.createMany(records);
        this._getMemory(roomId).push(...persisted);
    }

    async persistFinal(roomId: string, content: string): Promise<void> {
        const record = await this.provider.create({
            roomId,
            role: 'assistant',
            content,
        });
        this._getMemory(roomId).push(record);
    }

    buildHistory(roomId: string): LLMMessage[] {
        return this._getMemory(roomId).map(r => this._toLLMMessage(r));
    }

    getTokenUsage(roomId: string): number {
        return this.tokenUsage.get(roomId) ?? 0;
    }

    // ========== 私有方法 ==========

    private _getMemory(roomId: string): MessageRecord[] {
        let mem = this.memory.get(roomId);
        if (!mem) {
            mem = [];
            this.memory.set(roomId, mem);
        }
        return mem;
    }

    /**
     * 将 MessageRecord 转换为 LLMMessage
     *
     * 处理三种格式：
     * - tool: tool_result 结构体
     * - user/assistant: 纯文本
     */
    private _toLLMMessage(record: MessageRecord): LLMMessage {
        if (record.role === 'tool' && record.toolResultId) {
            return {
                role: 'tool' as const,
                content: [
                    {
                        type: 'tool_result' as const,
                        tool_use_id: record.toolResultId,
                        content: record.content ?? '',
                    },
                ],
            };
        }

        return {
            role: record.role as 'user' | 'assistant' | 'tool',
            content: record.content ?? '',
        };
    }

    /**
     * 根据 token 上限裁剪消息历史
     *
     * 策略：从最新消息开始向前加载，保留直到达到 token 上限。
     */
    private _trimToTokenLimit(records: MessageRecord[], maxTokens: number): MessageRecord[] {
        const withTokens = records.map(msg => ({
            ...msg,
            estimatedTokens: msg.tokenCount ?? Math.ceil((msg.content?.length ?? 0) / 4),
        }));

        const result: MessageRecord[] = [];
        let total = 0;

        for (let i = withTokens.length - 1; i >= 0; i--) {
            const msg = withTokens[i];
            if (total + msg.estimatedTokens > maxTokens) {
                break;
            }
            result.unshift(msg);
            total += msg.estimatedTokens;
        }

        this.logger.debug(
            `Trimmed history to ${result.length} messages (${total} tokens, limit: ${maxTokens})`,
        );
        return result;
    }
}
