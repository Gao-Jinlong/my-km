/**
 * AISessionManager — AI 会话生命周期管理
 *
 * 内存态管理，不持久化。
 * 负责：
 * - 会话创建和销毁
 * - 状态机管理（pending → streaming → waiting_tool → ... → completed）
 * - 并发控制（一会话同时只能一个请求）
 * - 心跳超时自动清理
 */

import { Injectable, Logger } from '@nestjs/common';
import type { AISession, AISessionStatus, CreateAISessionOpts } from './ai-session.types';

const HEARTBEAT_TIMEOUT_MS = 120_000; // 2 分钟无活动视为超时

@Injectable()
export class AISessionManager {
    private readonly logger = new Logger(AISessionManager.name);
    private sessions = new Map<string, AISession>();

    /**
     * 创建新会话
     * 如果该 roomId 已有活跃会话，抛出并发错误
     */
    create(opts: CreateAISessionOpts): AISession {
        const existing = this.findByRoomId(opts.roomId);
        if (
            existing &&
            existing.status !== 'completed' &&
            existing.status !== 'error' &&
            existing.status !== 'aborted'
        ) {
            throw new Error(
                `Room ${opts.roomId} already has an active session (${existing.id}, status: ${existing.status})`,
            );
        }

        // 清理旧会话
        if (existing) {
            this.sessions.delete(existing.id);
        }

        const session: AISession = {
            id: `${opts.clientId}:${opts.roomId}`,
            roomId: opts.roomId,
            clientId: opts.clientId,
            status: 'pending',
            abortController: new AbortController(),
            startedAt: new Date(),
            lastActivityAt: new Date(),
        };

        this.sessions.set(session.id, session);
        this.logger.debug(`Session created: ${session.id}`);
        return session;
    }

    /**
     * 根据 ID 查找会话
     */
    findById(id: string): AISession | null {
        return this.sessions.get(id) ?? null;
    }

    /**
     * 根据会话 ID 查找（同一时间只有一个活跃会话）
     */
    findByRoomId(roomId: string): AISession | null {
        for (const session of this.sessions.values()) {
            if (session.roomId === roomId) {
                return session;
            }
        }
        return null;
    }

    /**
     * 更新会话状态
     */
    updateStatus(id: string, status: AISessionStatus): void {
        const session = this.sessions.get(id);
        if (!session) {
            this.logger.warn(`Session not found for status update: ${id}`);
            return;
        }

        this.validateTransition(session.status, status);
        session.status = status;
        session.lastActivityAt = new Date();
        this.logger.debug(`Session ${id} status: ${session.status}`);
    }

    /**
     * 中断指定客户端的所有会话
     */
    abortByClientId(clientId: string): void {
        for (const [id, _session] of this.sessions) {
            if (id.startsWith(clientId)) {
                this.abort(id);
            }
        }
    }

    /**
     * 中断会话
     */
    abort(id: string): void {
        const session = this.sessions.get(id);
        if (!session) return;

        session.abortController.abort();
        session.status = 'aborted';
        session.lastActivityAt = new Date();
        this.logger.log(`Session aborted: ${id}`);
    }

    /**
     * 清理会话
     */
    cleanup(roomId: string): void {
        const session = this.findByRoomId(roomId);
        if (!session) return;

        this.sessions.delete(session.id);
        this.logger.debug(`Session cleaned up: ${session.id}`);
    }

    /**
     * 获取所有活跃会话数
     */
    get activeCount(): number {
        let count = 0;
        for (const s of this.sessions.values()) {
            if (s.status === 'streaming' || s.status === 'waiting_tool' || s.status === 'pending') {
                count++;
            }
        }
        return count;
    }

    /**
     * 心跳检查 — 清理超时会话
     * 建议定时调用（如每 30 秒）
     */
    runHealthCheck(): void {
        const now = Date.now();
        const toRemove: string[] = [];

        for (const [id, session] of this.sessions) {
            const elapsed = now - session.lastActivityAt.getTime();
            if (
                elapsed > HEARTBEAT_TIMEOUT_MS &&
                session.status !== 'completed' &&
                session.status !== 'error' &&
                session.status !== 'aborted'
            ) {
                this.logger.warn(`Session ${id} timed out (${elapsed}ms), aborting`);
                session.abortController.abort();
                toRemove.push(id);
            }
        }

        for (const id of toRemove) {
            this.sessions.delete(id);
        }

        if (toRemove.length > 0) {
            this.logger.log(`Health check: cleaned up ${toRemove.length} timed-out sessions`);
        }
    }

    // ========== 私有方法 ==========

    /**
     * 状态转换验证
     *
     * 允许的状态转换:
     *   pending → streaming | error | aborted
     *   streaming → waiting_tool | completed | error | aborted
     *   waiting_tool → streaming | error | aborted
     */
    private validateTransition(from: AISessionStatus, to: AISessionStatus): void {
        const validTargets: Record<AISessionStatus, AISessionStatus[]> = {
            pending: ['streaming', 'error', 'aborted'],
            streaming: ['waiting_tool', 'completed', 'error', 'aborted'],
            waiting_tool: ['streaming', 'error', 'aborted'],
            completed: [], // terminal
            error: [], // terminal
            aborted: [], // terminal
        };

        const allowed = validTargets[from] ?? [];
        if (!allowed.includes(to)) {
            throw new Error(
                `Invalid session state transition: ${from} → ${to} (allowed: ${allowed.join(', ') || 'none'})`,
            );
        }
    }
}
