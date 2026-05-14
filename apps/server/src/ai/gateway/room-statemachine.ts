/**
 * RoomStateMachine — lifecycle FSM for a single room (conversation).
 *
 * States: Idle → BuildingContext → Processing → [ToolWaiting → ToolExecuting → Processing]* → Done
 *
 * Uses an emit callback to send events to the transport layer,
 * decoupling business logic from WebSocket protocol.
 */

import type { ErrorCode, ServerMessage } from './ai-ws-events.types';
import { ConversationState, isValidTransition } from './conversation-statemachine.types';

export type EmitFn = (msg: ServerMessage) => void;

export class RoomStateMachine {
    readonly conversationId: string;
    readonly clientId: string;
    state: ConversationState = ConversationState.Idle;
    abortController = new AbortController();
    createdAt = new Date();
    lastActivityAt = new Date();

    private emit: EmitFn;

    constructor(conversationId: string, clientId: string, emit: EmitFn) {
        this.conversationId = conversationId;
        this.clientId = clientId;
        this.emit = emit;
    }

    private _transition(to: ConversationState): void {
        const from = this.state;
        if (from === to) return;

        if (!isValidTransition(from, to)) {
            throw new Error(
                `Invalid transition: ${from} -> ${to} for conversation ${this.conversationId}`,
            );
        }

        this.state = to;
        this.lastActivityAt = new Date();
    }

    receiveMessage(): void {
        this._transition(ConversationState.BuildingContext);
    }

    contextReady(): void {
        this._transition(ConversationState.Processing);
    }

    textChunk(content: string): void {
        this.emit({ type: 'text_chunk', conversationId: this.conversationId, content });
    }

    toolCall(
        toolCallId: string,
        toolName: string,
        input: unknown,
        requiresConfirmation: boolean,
    ): void {
        if (requiresConfirmation) {
            this._transition(ConversationState.ToolWaiting);
            this.emit({
                type: 'tool_call',
                conversationId: this.conversationId,
                toolCallId,
                toolName,
                input,
                requiresConfirmation: true,
            });
        } else {
            this._transition(ConversationState.ToolExecuting);
        }
    }

    toolResult(): void {
        this._transition(ConversationState.ToolExecuting);
    }

    toolDone(): void {
        this._transition(ConversationState.Processing);
    }

    llmDone(): void {
        this._transition(ConversationState.Done);
        this.emit({
            type: 'done',
            conversationId: this.conversationId,
            finishReason: 'complete',
        });
    }

    stop(): void {
        this.abortController.abort();
        this._transition(ConversationState.Done);
        this.emit({
            type: 'done',
            conversationId: this.conversationId,
            finishReason: 'stopped',
        });
    }

    error(code: string, message: string): void {
        this.abortController.abort();
        this._transition(ConversationState.Done);
        this.emit({
            type: 'error',
            conversationId: this.conversationId,
            code: code as ErrorCode,
            message,
        });
    }

    getAbortSignal(): AbortSignal {
        return this.abortController.signal;
    }
}
