/**
 * RoomSession — per-room state holder.
 *
 * Replaces the role of RoomStateMachineFactory + AISessionManager for room-level state.
 * Each room gets one RoomSession instance, created when the first message arrives,
 * destroyed when the room goes idle or the client disconnects.
 */

import { Logger } from '@nestjs/common';
import { type EmitFn, RoomState } from './room-session.types';
import { RoomStateMachine } from './room-statemachine';

export class RoomSession {
    private readonly logger = new Logger(RoomSession.name);
    readonly stateMachine: RoomStateMachine;
    private createdAt: Date;
    private lastActivityAt: Date;

    constructor(
        readonly roomId: string,
        readonly clientId: string,
        emit: EmitFn,
    ) {
        this.createdAt = new Date();
        this.lastActivityAt = new Date();
        this.stateMachine = new RoomStateMachine(roomId, clientId, emit);
    }

    get abortController(): AbortController {
        return this.stateMachine.abortController;
    }

    /** Returns true if this session is not in terminal Done state. */
    isActive(): boolean {
        return this.stateMachine.state !== RoomState.Done;
    }

    abort(): void {
        if (this.isActive()) {
            this.stateMachine.stop();
            this.logger.debug(`Session aborted for room ${this.roomId}`);
        }
    }

    touch(): void {
        this.lastActivityAt = new Date();
    }

    get age(): number {
        return Date.now() - this.createdAt.getTime();
    }

    get idleTime(): number {
        return Date.now() - this.lastActivityAt.getTime();
    }
}
