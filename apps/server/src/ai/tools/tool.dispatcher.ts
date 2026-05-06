/**
 * ToolDispatcher — 工具结果分发
 *
 * 替代全局 EventEmitter，使用会话级事件。
 * 负责：
 * - 接收前端返回的 tool_result
 * - 分发到正确的等待循环（通过 sessionId）
 */

import { Injectable, Logger } from '@nestjs/common';
import type { InFlightToolCall, ToolDefinition } from '../ai.types';

interface WaitingSession {
    resolve: (results: Record<string, unknown> | null) => void;
    results: Record<string, unknown>;
    expectedToolCallIds: Set<string>;
    timeout: ReturnType<typeof setTimeout>;
    conversationId: string; // for conversationId-based lookup (legacy path)
}

@Injectable()
export class ToolDispatcher {
    private readonly logger = new Logger(ToolDispatcher.name);
    private waitingSessions = new Map<string, WaitingSession>();
    private toolDefinitions: ToolDefinition[] = [];

    /**
     * 等待工具结果（带超时）— 由 AILoopOrchestrator 调用（通过 sessionId）
     */
    waitForResults(
        sessionId: string,
        conversationId: string,
        toolCalls: InFlightToolCall[],
        timeoutMs: number,
    ): Promise<Record<string, unknown> | null> {
        return new Promise(resolve => {
            const expectedIds = new Set(toolCalls.map(tc => tc.id));

            const timeout = setTimeout(() => {
                this.waitingSessions.delete(sessionId);
                this.logger.warn(`Tool results timed out for session ${sessionId}`);
                resolve(null);
            }, timeoutMs);

            this.waitingSessions.set(sessionId, {
                resolve,
                results: {},
                expectedToolCallIds: expectedIds,
                timeout,
                conversationId,
            });
        });
    }

    /**
     * 按 conversationId 等待工具结果 — 由 AiService 遗留路径调用
     */
    waitForResultsByConversation(
        conversationId: string,
        toolCalls: InFlightToolCall[],
        timeoutMs: number,
    ): Promise<Record<string, unknown> | null> {
        return new Promise(resolve => {
            const expectedIds = new Set(toolCalls.map(tc => tc.id));
            const sessionKey = `conv:${conversationId}:${Date.now()}`;

            const timeout = setTimeout(() => {
                this.waitingSessions.delete(sessionKey);
                this.logger.warn(`Tool results timed out for conversation ${conversationId}`);
                resolve(null);
            }, timeoutMs);

            this.waitingSessions.set(sessionKey, {
                resolve,
                results: {},
                expectedToolCallIds: expectedIds,
                timeout,
                conversationId,
            });
        });
    }

    /**
     * 交付工具结果（由 Gateway 调用）
     *
     * 查找策略：
     * 1. 先按 sessionId 精确查找（新路径：AILoopOrchestrator）
     * 2. 再按 conversationId 模糊查找（遗留路径：AiService）
     */
    deliverResult(
        conversationId: string,
        toolCallId: string,
        result: unknown,
        error?: string,
        sessionId?: string,
    ): void {
        let session: WaitingSession | null = null;
        let sessionKey: string | null = null;

        // 1. 精确查找（如果有 sessionId）
        if (sessionId) {
            const s = this.waitingSessions.get(sessionId);
            if (s && s.conversationId === conversationId) {
                session = s;
                sessionKey = sessionId;
            }
        }

        // 2. 按 conversationId 模糊查找
        if (!session) {
            for (const [key, s] of this.waitingSessions) {
                if (s.conversationId === conversationId && key.startsWith('conv:')) {
                    session = s;
                    sessionKey = key;
                    break;
                }
            }
        }

        if (!session) {
            this.logger.warn(
                `No waiting session for conversation ${conversationId}, toolCallId ${toolCallId}`,
            );
            return;
        }

        session.results[toolCallId] = error ? { error } : result;

        // 检查是否所有工具都已返回结果
        if (Object.keys(session.results).length >= session.expectedToolCallIds.size) {
            clearTimeout(session.timeout);
            if (sessionKey) this.waitingSessions.delete(sessionKey);
            session.resolve(session.results);
        }
    }

    /**
     * 取消等待（会话中断时调用）
     */
    cancelWaiting(conversationId: string, sessionId?: string): void {
        const toRemove: string[] = [];

        if (sessionId) {
            const s = this.waitingSessions.get(sessionId);
            if (s) {
                clearTimeout(s.timeout);
                s.resolve(null);
                toRemove.push(sessionId);
            }
        }

        // 清理该 conversation 下的所有遗留等待
        for (const [key, s] of this.waitingSessions) {
            if (s.conversationId === conversationId) {
                clearTimeout(s.timeout);
                s.resolve(null);
                toRemove.push(key);
            }
        }

        for (const key of toRemove) {
            this.waitingSessions.delete(key);
        }
    }

    /**
     * 获取所有工具定义（发送给 LLM）
     */
    getDefinitions(): ToolDefinition[] {
        return this.toolDefinitions;
    }

    /**
     * 批量注册工具
     */
    registerMany(tools: ToolDefinition[]): void {
        this.toolDefinitions = [...tools];
    }
}
