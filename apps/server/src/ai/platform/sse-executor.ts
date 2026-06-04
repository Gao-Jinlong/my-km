/**
 * SSEExecutor — 轻量级 LLM 执行器，直接输出 SSE 事件
 *
 * 绕过旧的 LangGraph StateGraph 图循环（避免无限递归问题），
 * 直接调用 LLM Provider 的 chat() 方法，手动处理工具调用。
 *
 * 工具调用流程:
 *   1. LLM 生成回复 + tool_call → 发送 text delta + tool events
 *   2. 前端工具 → lifecycle:interrupted（等待前端执行并 resume）
 *   3. Resume → 将工具结果追加到消息历史 → 再次调用 LLM
 *
 * 生命周期:
 *   lifecycle:started → messages*(text-delta) → [tools:started → lifecycle:interrupted]
 *                                                或 [values → lifecycle:completed]
 */

import { Logger } from '@nestjs/common';
import type { Response } from 'express';
import type { LLMMessage, LLMOutput, ToolDefinition } from '../ai.types';
import type { RoomService } from '../conversation/room.service';
import type { LLMProvider } from '../llm/provider.types';
import type { MessageStoreImpl } from '../message/message-store.impl';
import {
    contentBlockFinish,
    contentBlockStart,
    encodeSSE,
    errorEvent,
    lifecycleCompleted,
    lifecycleFailed,
    lifecycleInterrupted,
    lifecycleStarted,
    messageFinish,
    messageStart,
    resetMessageSeq,
    textDelta,
    toolStarted,
    valuesSnapshot,
} from './ai-stream.protocol';
import { isFrontendTool } from './tool-definitions';

export interface SSEExecutionParams {
    /** HTTP Response（用于写入 SSE 事件） */
    res: Response;
    /** 用户消息内容 */
    content: string;
    /** 房间 ID（已有对话时传入） */
    roomId?: string;
    /** 编辑器上下文 */
    context?: Record<string, unknown>;
    /** 中止信号 */
    abortSignal?: AbortSignal;
}

export interface SSEResumeParams {
    res: Response;
    roomId: string;
    toolCallId: string;
    result: unknown;
    abortSignal?: AbortSignal;
}

export class SSEExecutor {
    private readonly logger = new Logger(SSEExecutor.name);

    constructor(
        private llmProvider: LLMProvider,
        private roomService: RoomService,
        private messageStore: MessageStoreImpl,
        private tools: ToolDefinition[] = [],
    ) {}

    /**
     * 执行 LLM 调用并将结果流式写入 SSE
     */
    async execute(params: SSEExecutionParams): Promise<string | null> {
        const { res, content, roomId, abortSignal } = params;
        const send = this.createSender(res);

        try {
            // 1. 解析/创建 Room
            let resolvedRoomId = roomId;
            if (!resolvedRoomId) {
                const title = content.slice(0, 20) || 'New Chat';
                const room = await this.roomService.create({ title });
                resolvedRoomId = room.id;
            }

            // 2. 发送 lifecycle:started
            send(lifecycleStarted(resolvedRoomId));

            // 3. 初始化 MessageStore 并保存用户消息
            await this.messageStore.init(resolvedRoomId);
            await this.messageStore.persistUser(resolvedRoomId, content);
            this.roomService.incrementMessageCount(resolvedRoomId).catch(() => {});

            // 4. 执行 LLM 调用
            const history = this.messageStore.buildHistory(resolvedRoomId);
            await this.runLLMAndStream(send, history, resolvedRoomId, abortSignal);

            return resolvedRoomId;
        } catch (error) {
            this.logger.error(`SSE execution failed: ${error}`, (error as Error).stack);
            send(errorEvent('execution_error', (error as Error).message));
            send(lifecycleFailed((error as Error).message));
            return null;
        } finally {
            if (!res.writableEnded) {
                res.end();
            }
        }
    }

    /**
     * Resume — 接收前端工具结果，持久化后重新调用 LLM
     */
    async resume(params: SSEResumeParams): Promise<void> {
        const { res, roomId, toolCallId, result, abortSignal } = params;
        const send = this.createSender(res);

        try {
            send(lifecycleStarted(roomId));

            // 从数据库加载历史消息到内存
            await this.messageStore.init(roomId);

            // 持久化工具结果
            const resultStr = typeof result === 'string' ? result : JSON.stringify(result);
            await this.messageStore.persistToolResult(roomId, toolCallId, resultStr);

            // 重新调用 LLM（历史中已包含工具结果）
            const history = this.messageStore.buildHistory(roomId);
            await this.runLLMAndStream(send, history, roomId, abortSignal);
        } catch (error) {
            this.logger.error(`SSE resume failed: ${error}`, (error as Error).stack);
            send(errorEvent('execution_error', (error as Error).message));
            send(lifecycleFailed((error as Error).message));
        } finally {
            if (!res.writableEnded) {
                res.end();
            }
        }
    }

    // ========== Private Methods ==========

    /**
     * 创建 SSE 事件发送器
     */
    private createSender(res: Response) {
        return (event: { event: string; data: unknown }) => {
            if (!res.writableEnded) {
                res.write(encodeSSE(event));
            }
        };
    }

    /**
     * 核心方法：调用 LLM 并将流式输出映射为 SSE 事件
     *
     * 流程:
     *   1. 发送 message-start / content-block-start
     *   2. 流式输出 text-delta
     *   3. 收集 tool_calls
     *   4. 如果有 tool_call → interrupt（不重新调用 LLM）
     *   5. 如果没有 tool_call → 完成
     */
    private async runLLMAndStream(
        send: (e: { event: string; data: unknown }) => void,
        history: LLMMessage[],
        roomId: string,
        abortSignal?: AbortSignal,
    ): Promise<void> {
        const messageId = `msg-${Date.now()}`;
        resetMessageSeq();

        // 发送消息开始事件
        send(messageStart(messageId));
        send(contentBlockStart(0, messageId));

        // 调用 LLM
        let assistantText = '';
        const toolCalls: Array<{ id: string; name: string; arguments: Record<string, unknown> }> =
            [];

        const stream = this.llmProvider.chat(
            history,
            this.tools.length > 0 ? this.tools : undefined,
            abortSignal,
        );

        for await (const event of stream) {
            if (abortSignal?.aborted) break;

            if (event.type === 'text_chunk' && event.content) {
                assistantText += event.content;
                send(textDelta(event.content, 0, messageId));
            } else if (event.type === 'tool_call' && event.toolCall) {
                toolCalls.push(event.toolCall);
            } else if (event.type === 'done') {
                break;
            }
        }

        if (abortSignal?.aborted) {
            send(contentBlockFinish(0, messageId, assistantText));
            send(messageFinish(messageId, 'stopped'));
            send(lifecycleCompleted());
            return;
        }

        // 处理结果
        if (toolCalls.length > 0) {
            // 工具调用 → 中断
            send(contentBlockFinish(0, messageId, assistantText));
            send(messageFinish(messageId, 'tool_use'));

            // 发送每个工具调用事件
            for (const tc of toolCalls) {
                send(toolStarted(tc.id, tc.name, tc.arguments));
            }

            // 持久化 assistant 消息（带 tool calls）
            await this.messageStore.persistAssistant(
                roomId,
                assistantText,
                toolCalls.map(tc => ({
                    id: tc.id,
                    name: tc.name,
                    arguments: tc.arguments,
                    timestamp: new Date(),
                })),
            );

            // 中断 — 等待前端 resume
            send(lifecycleInterrupted());
        } else {
            // 正常完成
            send(contentBlockFinish(0, messageId, assistantText));
            send(messageFinish(messageId));

            // 持久化最终 assistant 消息
            await this.messageStore.persistFinal(roomId, assistantText);
            this.roomService.incrementMessageCount(roomId).catch(() => {});

            send(
                valuesSnapshot({
                    messages: [{ role: 'ai', content: assistantText }],
                    threadId: roomId,
                }),
            );

            send(lifecycleCompleted());
        }
    }
}
