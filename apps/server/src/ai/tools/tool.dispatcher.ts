/**
 * ToolDispatcher — tool result delivery.
 *
 * Phase 5 rewrite: simplified to only use roomId-based waiting sessions.
 * Removed dual lookup (sessionId + roomId) since Executor always uses roomId.
 */

import { Injectable, Logger } from '@nestjs/common';
import type { InFlightToolCall, ToolDefinition } from '../ai.types';

interface WaitingSession {
    resolve: (results: Record<string, unknown> | null) => void;
    results: Record<string, unknown>;
    expectedToolCallIds: Set<string>;
    timeout: ReturnType<typeof setTimeout>;
    roomId: string;
}

@Injectable()
export class ToolDispatcher {
    private readonly logger = new Logger(ToolDispatcher.name);
    private waitingSessions = new Map<string, WaitingSession>();
    private toolDefinitions: ToolDefinition[] = [];

    /**
     * Wait for tool results from a room (with timeout).
     * Returns results map keyed by toolCallId, or null on timeout.
     */
    waitForResultsByRoom(
        roomId: string,
        toolCalls: InFlightToolCall[],
        timeoutMs: number,
    ): Promise<Record<string, unknown> | null> {
        return new Promise(resolve => {
            const expectedIds = new Set(toolCalls.map(tc => tc.id));
            const sessionKey = `room:${roomId}:${Date.now()}`;

            const timeout = setTimeout(() => {
                this.waitingSessions.delete(sessionKey);
                this.logger.warn(`Tool results timed out for room ${roomId}`);
                resolve(null);
            }, timeoutMs);

            this.waitingSessions.set(sessionKey, {
                resolve,
                results: {},
                expectedToolCallIds: expectedIds,
                timeout,
                roomId,
            });
        });
    }

    /**
     * Deliver a tool result to the waiting session.
     */
    deliverResult(roomId: string, toolCallId: string, result: unknown, error?: string): void {
        let session: WaitingSession | null = null;
        let sessionKey: string | null = null;

        for (const [key, s] of this.waitingSessions) {
            if (s.roomId === roomId) {
                session = s;
                sessionKey = key;
                break;
            }
        }

        if (!session) {
            this.logger.warn(`No waiting session for room ${roomId}, toolCallId ${toolCallId}`);
            return;
        }

        session.results[toolCallId] = error ? { error } : result;

        if (Object.keys(session.results).length >= session.expectedToolCallIds.size) {
            clearTimeout(session.timeout);
            if (sessionKey) this.waitingSessions.delete(sessionKey);
            session.resolve(session.results);
        }
    }

    /**
     * Cancel waiting for a room's tool results (on abort).
     */
    cancelWaiting(roomId: string): void {
        const toRemove: string[] = [];

        for (const [key, s] of this.waitingSessions) {
            if (s.roomId === roomId) {
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
     * Get all tool definitions registered.
     */
    getDefinitions(): ToolDefinition[] {
        return this.toolDefinitions;
    }

    /**
     * Register tool definitions in bulk.
     */
    registerMany(tools: ToolDefinition[]): void {
        this.toolDefinitions = [...tools];
    }
}
