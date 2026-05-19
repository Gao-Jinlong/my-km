/**
 * RoomStateMachine — protocol FSM for a single room.
 *
 * Owned by RoomSession. Not a NestJS injectable.
 * States: Idle → BuildingContext → Processing → [ToolWaiting → ToolExecuting → Processing]* → Done
 */

import type { ErrorCode, FinishReason, ServerMessage } from './ai-ws-events.types';
import { isValidTransition, RoomState } from './room-session.types';

export class RoomStateMachine {
    state: RoomState = RoomState.Idle;
    readonly abortController = new AbortController();

    constructor(
        readonly roomId: string,
        readonly clientId: string,
        private emit: (msg: ServerMessage) => void,
    ) {}

    private _transition(to: RoomState): void {
        const from = this.state;
        if (from === to) return;
        if (!isValidTransition(from, to)) {
            throw new Error(`Invalid state transition: ${from} → ${to} for room ${this.roomId}`);
        }
        this.state = to;
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

    toolCall(info: {
        toolCallId: string;
        toolName: string;
        input: unknown;
        requiresConfirmation: boolean;
    }): void {
        if (info.requiresConfirmation) {
            this._transition(RoomState.ToolWaiting);
            this.emit({
                type: 'tool_call',
                roomId: this.roomId,
                toolCallId: info.toolCallId,
                toolName: info.toolName,
                input: info.input,
                requiresConfirmation: true,
            });
        } else {
            this._transition(RoomState.ToolExecuting);
        }
    }

    toolDone(): void {
        this._transition(RoomState.Processing);
    }

    llmDone(finishReason: FinishReason = 'complete'): void {
        this._transition(RoomState.Done);
        this.emit({ type: 'done', roomId: this.roomId, finishReason });
    }

    stop(): void {
        this.abortController.abort();
        this._transition(RoomState.Done);
        this.emit({ type: 'done', roomId: this.roomId, finishReason: 'stopped' });
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
}
