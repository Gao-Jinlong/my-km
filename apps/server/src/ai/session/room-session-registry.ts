/**
 * RoomSessionRegistry — manages per-room RoomSession instances.
 *
 * Replaces RoomStateMachineFactory. Key differences:
 * - No NestJS @Injectable — plain class, instantiated once in ai.module.ts
 * - Concurrency guard: rejects duplicate active sessions per room
 * - Periodic stale session cleanup (replaces AISessionManager heartbeat)
 */

import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { RoomSession } from './room-session';
import type { EmitFn } from './room-session.types';

const STALE_SESSION_MS = 5 * 60 * 1000; // 5 minutes
const CLEANUP_INTERVAL_MS = 60 * 1000; // 1 minute

@Injectable()
export class RoomSessionRegistry implements OnModuleDestroy {
    private readonly logger = new Logger(RoomSessionRegistry.name);
    private sessions = new Map<string, RoomSession>();
    private byClientId = new Map<string, Set<string>>();
    private cleanupTimer: ReturnType<typeof setInterval> | null = null;

    startPeriodicCleanup(): void {
        this.cleanupTimer = setInterval(() => this.cleanupStale(), CLEANUP_INTERVAL_MS);
    }

    onModuleDestroy(): void {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
        }
        // Abort all active sessions
        for (const session of this.sessions.values()) {
            session.abort();
        }
        this.sessions.clear();
        this.byClientId.clear();
    }

    /** Create a new RoomSession for the given room. Throws if already active. */
    create(opts: { roomId: string; clientId: string; emit: EmitFn }): RoomSession {
        const existing = this.sessions.get(opts.roomId);
        if (existing?.isActive()) {
            throw new Error(`Room ${opts.roomId} already has an active session`);
        }

        // Destroy stale Done session if present
        if (existing) {
            this.destroy(opts.roomId);
        }

        const session = new RoomSession(opts.roomId, opts.clientId, opts.emit);
        this.sessions.set(opts.roomId, session);

        if (!this.byClientId.has(opts.clientId)) {
            this.byClientId.set(opts.clientId, new Set());
        }
        const clientSet = this.byClientId.get(opts.clientId);
        if (!clientSet) {
            throw new Error(
                `Invariant violation: byClientId missing set for client ${opts.clientId}`,
            );
        }
        clientSet.add(opts.roomId);

        this.logger.debug(`RoomSession created for room ${opts.roomId}`);
        return session;
    }

    /** Get an existing session by roomId, or null. */
    get(roomId: string): RoomSession | null {
        return this.sessions.get(roomId) ?? null;
    }

    /** Destroy a specific room session. */
    destroy(roomId: string): void {
        const session = this.sessions.get(roomId);
        if (session) {
            session.abort();
            const clientSet = this.byClientId.get(session.clientId);
            clientSet?.delete(roomId);
            if (clientSet?.size === 0) {
                this.byClientId.delete(session.clientId);
            }
        }
        this.sessions.delete(roomId);
        this.logger.debug(`RoomSession destroyed for room ${roomId}`);
    }

    /** Destroy all sessions for a given client (on disconnect). */
    destroyByClientId(clientId: string): void {
        const roomIds = this.byClientId.get(clientId);
        if (roomIds) {
            for (const roomId of roomIds) {
                this.destroy(roomId);
            }
        }
        this.byClientId.delete(clientId);
    }

    /** Background cleanup: remove stale Done sessions and abort long-idle active sessions. */
    private cleanupStale(): void {
        const toRemove: string[] = [];

        for (const [roomId, session] of this.sessions) {
            if (!session.isActive() && session.idleTime > STALE_SESSION_MS) {
                toRemove.push(roomId);
            } else if (session.isActive() && session.idleTime > STALE_SESSION_MS * 2) {
                this.logger.warn(`Aborting long-idle session for room ${roomId}`);
                session.abort();
                toRemove.push(roomId);
            }
        }

        for (const roomId of toRemove) {
            this.sessions.delete(roomId);
            // Clean up byClientId index
            for (const [clientId, roomIds] of this.byClientId) {
                roomIds.delete(roomId);
                if (roomIds.size === 0) {
                    this.byClientId.delete(clientId);
                }
            }
        }

        if (toRemove.length > 0) {
            this.logger.debug(`Cleaned up ${toRemove.length} stale sessions`);
        }
    }
}
