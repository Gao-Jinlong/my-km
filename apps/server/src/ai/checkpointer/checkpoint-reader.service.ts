/**
 * CheckpointReaderService — 从 LangGraph Checkpoint 中提取消息
 *
 * 职责：
 * - 通过 BaseCheckpointSaver.getTuple() 读取 thread 的最新 checkpoint
 * - 从 checkpoint.channel_values.messages 中提取消息列表
 * - 转换为 LangGraph Platform 兼容的消息格式
 *
 * 使用场景：
 * - GET /api/threads/:threadId/state 端点
 * - 前端加载历史消息
 */

import type { BaseCheckpointSaver } from '@langchain/langgraph-checkpoint';
import { Injectable, Logger } from '@nestjs/common';
import { CheckpointerProvider } from './checkpointer.provider';

/**
 * 从 checkpoint 提取的消息格式（LangGraph Platform 兼容）
 */
export interface CheckpointMessage {
    type: 'human' | 'ai' | 'tool' | 'system';
    content: string;
    id?: string;
    tool_calls?: Array<{ id: string; name: string }>;
    tool_call_id?: string;
}

/**
 * Thread 状态快照（LangGraph Platform 兼容）
 */
export interface ThreadState {
    values: { messages: CheckpointMessage[] };
    next: string[];
    checkpoint: {
        thread_id: string;
        checkpoint_id: string;
        checkpoint_ns: string;
    };
    metadata: Record<string, unknown>;
    created_at: string;
    parent_checkpoint: unknown;
    tasks: unknown[];
}

@Injectable()
export class CheckpointReaderService {
    private readonly logger = new Logger(CheckpointReaderService.name);

    constructor(private readonly checkpointerProvider: CheckpointerProvider) {}

    /**
     * 获取指定 thread 的最新状态
     *
     * 从 PostgresSaver 读取 checkpoint，提取 messages，
     * 转换为前端可消费的格式。
     */
    async getThreadState(threadId: string): Promise<ThreadState> {
        const checkpointer = await this.checkpointerProvider.getCheckpointer();

        const tuple = await checkpointer.getTuple({
            configurable: { thread_id: threadId },
        });

        if (!tuple?.checkpoint) {
            return this.emptyState(threadId);
        }

        const messages = this.extractMessages(tuple.checkpoint.channel_values);

        return {
            values: { messages },
            next: [],
            checkpoint: {
                thread_id: threadId,
                checkpoint_id: tuple.checkpoint.id ?? '',
                checkpoint_ns: '',
            },
            metadata: tuple.metadata ?? {},
            created_at: tuple.checkpoint.ts ?? new Date().toISOString(),
            parent_checkpoint: tuple.parentConfig ?? null,
            tasks: [],
        };
    }

    /**
     * 获取指定 thread 的消息列表
     */
    async getMessages(threadId: string): Promise<CheckpointMessage[]> {
        const checkpointer = await this.checkpointerProvider.getCheckpointer();

        const tuple = await checkpointer.getTuple({
            configurable: { thread_id: threadId },
        });

        if (!tuple?.checkpoint) {
            return [];
        }

        return this.extractMessages(tuple.checkpoint.channel_values);
    }

    /**
     * 从 checkpoint channel_values 中提取并转换消息
     *
     * channel_values.messages 中的消息可能是：
     * - LangChain HumanMessage / AIMessage 实例（有序列化方法）
     * - 已经反序列化的普通对象 { type, content, id, ... }
     *
     * 转换为 CheckpointMessage 格式供前端消费。
     */
    private extractMessages(channelValues: Record<string, unknown>): CheckpointMessage[] {
        const rawMessages = channelValues.messages;
        if (!Array.isArray(rawMessages)) {
            return [];
        }

        return rawMessages.map((msg: unknown, idx: number) => this.convertMessage(msg, idx));
    }

    /**
     * 转换单条消息为 CheckpointMessage 格式
     */
    private convertMessage(msg: unknown, idx: number): CheckpointMessage {
        if (!msg || typeof msg !== 'object') {
            return {
                type: 'human',
                content: String(msg ?? ''),
                id: `msg-${idx}`,
            };
        }

        const m = msg as Record<string, unknown>;

        // LangChain Message 实例有 _getType() 方法或 type 属性
        // LLMMessage（plain object）使用 role 属性（如 'assistant'）
        const rawType =
            typeof m._getType === 'function'
                ? m._getType()
                : ((m.type as string) ?? (m.role as string) ?? 'human');

        // 归一化 type
        const type = this.normalizeType(rawType);

        // 提取 content
        const content =
            typeof m.content === 'string'
                ? m.content
                : Array.isArray(m.content)
                  ? (m.content as Array<{ text?: string }>)
                        .map(c => (typeof c === 'string' ? c : (c.text ?? '')))
                        .join('')
                  : JSON.stringify(m.content ?? '');

        // 提取 id
        const id = (m.id as string) ?? `msg-${idx}`;

        // 提取 tool_calls（AI 消息）
        const toolCalls =
            type === 'ai' && Array.isArray(m.tool_calls)
                ? (m.tool_calls as Array<{ id?: string; name?: string }>).map(tc => ({
                      id: tc.id ?? `tc-${idx}`,
                      name: tc.name ?? 'unknown',
                  }))
                : undefined;

        // 提取 tool_call_id（Tool 消息）
        const toolCallId =
            type === 'tool' && typeof m.tool_call_id === 'string' ? m.tool_call_id : undefined;

        const result: CheckpointMessage = { type, content, id };
        if (toolCalls) result.tool_calls = toolCalls;
        if (toolCallId) result.tool_call_id = toolCallId;
        return result;
    }

    /**
     * 归一化消息类型
     */
    private normalizeType(raw: string): CheckpointMessage['type'] {
        switch (raw) {
            case 'human':
            case 'user':
                return 'human';
            case 'ai':
            case 'assistant':
                return 'ai';
            case 'tool':
                return 'tool';
            case 'system':
                return 'system';
            default:
                return 'human';
        }
    }

    /**
     * 空 thread 状态（无 checkpoint 时返回）
     */
    private emptyState(threadId: string): ThreadState {
        return {
            values: { messages: [] },
            next: [],
            checkpoint: {
                thread_id: threadId,
                checkpoint_id: '',
                checkpoint_ns: '',
            },
            metadata: {},
            created_at: new Date().toISOString(),
            parent_checkpoint: null,
            tasks: [],
        };
    }
}
