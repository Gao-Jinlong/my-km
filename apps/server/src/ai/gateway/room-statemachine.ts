/**
 * RoomStateMachine — lifecycle FSM for a single room (conversation).
 *
 * States: Idle → BuildingContext → Processing → [ToolWaiting → ToolExecuting → Processing]* → Done
 *
 * Uses an emit callback to send events to the transport layer,
 * decoupling business logic from WebSocket protocol.
 */

import type { ErrorCode, ServerMessage } from './ai-ws-events.types';
import { isValidTransition, RoomState } from './room-statemachine.types';

export type EmitFn = (msg: ServerMessage) => void;

export class RoomStateMachine {
    readonly roomId: string;
    readonly clientId: string;
    state: RoomState = RoomState.Idle;
    abortController = new AbortController();
    createdAt = new Date();
    lastActivityAt = new Date();

    private emit: EmitFn;

    constructor(roomId: string, clientId: string, emit: EmitFn) {
        this.roomId = roomId;
        this.clientId = clientId;
        this.emit = emit;
    }

    private _transition(to: RoomState): void {
        const from = this.state;
        if (from === to) return;

        if (!isValidTransition(from, to)) {
            throw new Error(`Invalid transition: ${from} -> ${to} for room ${this.roomId}`);
        }

        this.state = to;
        this.lastActivityAt = new Date();
    }

    receiveMessage(): void {
        this._transition(RoomState.BuildingContext);
    }

    contextReady(): void {
        this._transition(RoomState.Processing);
    }

    textChunk(content: string): void {
        this.emit({ type: 'text_chunk', roomId: this.roomId, content });
    }

    toolCall(
        toolCallId: string,
        toolName: string,
        input: unknown,
        requiresConfirmation: boolean,
    ): void {
        if (requiresConfirmation) {
            this._transition(RoomState.ToolWaiting);
            this.emit({
                type: 'tool_call',
                roomId: this.roomId,
                toolCallId,
                toolName,
                input,
                requiresConfirmation: true,
            });
        } else {
            this._transition(RoomState.ToolExecuting);
        }
    }

    toolResult(): void {
        this._transition(RoomState.ToolExecuting);
    }

    toolDone(): void {
        this._transition(RoomState.Processing);
    }

    llmDone(): void {
        this._transition(RoomState.Done);
        this.emit({
            type: 'done',
            roomId: this.roomId,
            finishReason: 'complete',
        });
    }

    stop(): void {
        this.abortController.abort();
        this._transition(RoomState.Done);
        this.emit({
            type: 'done',
            roomId: this.roomId,
            finishReason: 'stopped',
        });
    }

    error(code: string, message: string): void {
        this.abortController.abort();
        this._transition(RoomState.Done);
        this.emit({
            type: 'error',
            roomId: this.roomId,
            code: code as ErrorCode,
            message,
        });
    }

    getAbortSignal(): AbortSignal {
        return this.abortController.signal;
    }
}
