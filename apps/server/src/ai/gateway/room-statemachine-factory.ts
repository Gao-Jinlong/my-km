/**
 * RoomStateMachineFactory — manages per-room FSM instances.
 *
 * Each room gets its own state machine instance.
 * The factory tracks sessions by roomId and by clientId
 * (for cleanup on disconnect).
 */

import { Injectable, Logger } from '@nestjs/common';
import { EmitFn, RoomStateMachine } from './room-statemachine';
import { RoomState } from './room-statemachine.types';

export interface CreateOptions {
    roomId: string;
    clientId: string;
    emit: EmitFn;
}

@Injectable()
export class RoomStateMachineFactory {
    private readonly logger = new Logger(RoomStateMachineFactory.name);
    private byRoomId = new Map<string, RoomStateMachine>();
    private byClientId = new Map<string, Set<string>>();

    create(options: CreateOptions): RoomStateMachine {
        const existing = this.byRoomId.get(options.roomId);
        if (existing && existing.state !== RoomState.Done) {
            throw new Error(`Room ${options.roomId} already active`);
        }

        // Clean up any stale Done session
        if (existing) {
            this.byRoomId.delete(options.roomId);
            const clientSet = this.byClientId.get(options.clientId);
            clientSet?.delete(options.roomId);
        }

        const roomStateMachine = new RoomStateMachine(
            options.roomId,
            options.clientId,
            options.emit,
        );
        this.byRoomId.set(options.roomId, roomStateMachine);

        if (!this.byClientId.has(options.clientId)) {
            this.byClientId.set(options.clientId, new Set());
        }
        this.byClientId.get(options.clientId)?.add(options.roomId);

        this.logger.debug(`FSM created for room ${options.roomId}`);
        return roomStateMachine;
    }

    get(roomId: string): RoomStateMachine | null {
        return this.byRoomId.get(roomId) ?? null;
    }

    destroy(roomId: string): void {
        const sm = this.byRoomId.get(roomId);
        if (sm) {
            sm.abortController.abort();
            const clientSet = this.byClientId.get(sm.clientId);
            clientSet?.delete(roomId);
        }
        this.byRoomId.delete(roomId);
        this.logger.debug(`FSM destroyed for room ${roomId}`);
    }

    destroyByClientId(clientId: string): void {
        const convIds = this.byClientId.get(clientId);
        if (convIds) {
            for (const convId of convIds) {
                this.destroy(convId);
            }
        }
        this.byClientId.delete(clientId);
    }
}
