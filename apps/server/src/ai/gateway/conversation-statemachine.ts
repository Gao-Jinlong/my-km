/**
 * ConversationStateMachine — manages the lifecycle of a single AI conversation.
 *
 * States: Idle → BuildingContext → Processing → [ToolWaiting → ToolExecuting → Processing]* → Done
 *
 * Emits events on state transitions for the gateway to react to.
 */

import { Injectable } from '@nestjs/common';
import type { ServerMessage } from './ai-ws-events.types';
import {
    ConversationFSM,
    ConversationState,
    isValidTransition,
} from './conversation-statemachine.types';

export interface ConversationContext {
    conversationId: string;
    clientId: string;
}

export interface ToolCallInfo {
    toolCallId: string;
    toolName: string;
    input: unknown;
    requiresConfirmation: boolean;
}

type SMEvent =
    | { type: 'transition'; from: ConversationState; to: ConversationState; conversationId: string }
    | { type: 'emit'; message: ServerMessage }
    | { type: 'error'; conversationId: string; error: Error };

@Injectable()
export class ConversationStateMachine {
    private _sessions = new Map<string, ConversationFSM>();
    private _byConversation = new Map<string, string>();
    private _handlers: ((event: SMEvent) => void)[] = [];

    onEvent(handler: (event: SMEvent) => void): void {
        this._handlers.push(handler);
    }

    offEvent(handler: (event: SMEvent) => void): void {
        const idx = this._handlers.indexOf(handler);
        if (idx >= 0) this._handlers.splice(idx, 1);
    }

    private _emit(event: SMEvent): void {
        for (const h of this._handlers) {
            try {
                h(event);
            } catch (e) {
                console.error('[StateMachine] Handler error:', e);
            }
        }
    }

    create(ctx: ConversationContext): ConversationFSM {
        const existingSessionId = this._byConversation.get(ctx.conversationId);
        if (existingSessionId) {
            const existing = this._sessions.get(existingSessionId);
            if (existing && existing.state !== ConversationState.Done) {
                throw new Error(`Conversation ${ctx.conversationId} already active`);
            }
            this._byConversation.delete(ctx.conversationId);
            this._sessions.delete(existingSessionId);
        }

        const session: ConversationFSM = {
            conversationId: ctx.conversationId,
            state: ConversationState.Idle,
            abortController: new AbortController(),
            createdAt: new Date(),
            lastActivityAt: new Date(),
        };

        const sessionId = `${ctx.clientId}:${ctx.conversationId}`;
        this._sessions.set(sessionId, session);
        this._byConversation.set(ctx.conversationId, sessionId);
        return session;
    }

    findById(sessionId: string): ConversationFSM | null {
        return this._sessions.get(sessionId) ?? null;
    }

    findByConversationId(conversationId: string): ConversationFSM | null {
        const sessionId = this._byConversation.get(conversationId);
        return sessionId ? (this._sessions.get(sessionId) ?? null) : null;
    }

    receiveMessage(conversationId: string, _content: string): void {
        const session = this._getByConvOrThrow(conversationId);
        this._transition(session, ConversationState.BuildingContext);
    }

    contextReady(conversationId: string): void {
        const session = this._getByConvOrThrow(conversationId);
        this._transition(session, ConversationState.Processing);
    }

    textChunk(conversationId: string, content: string): void {
        const session = this._getByConvOrThrow(conversationId);
        this._emit({
            type: 'emit',
            message: { type: 'text_chunk', conversationId: session.conversationId, content },
        });
    }

    toolCall(conversationId: string, info: ToolCallInfo): void {
        const session = this._getByConvOrThrow(conversationId);
        if (info.requiresConfirmation) {
            this._transition(session, ConversationState.ToolWaiting);
            this._emit({
                type: 'emit',
                message: {
                    type: 'tool_call',
                    conversationId: session.conversationId,
                    toolCallId: info.toolCallId,
                    toolName: info.toolName,
                    input: info.input,
                    requiresConfirmation: true,
                },
            });
        } else {
            this._transition(session, ConversationState.ToolExecuting);
        }
    }

    toolResult(conversationId: string, _toolCallId: string): void {
        const session = this._getByConvOrThrow(conversationId);
        this._transition(session, ConversationState.ToolExecuting);
    }

    toolDone(conversationId: string): void {
        const session = this._getByConvOrThrow(conversationId);
        this._transition(session, ConversationState.Processing);
    }

    llmDone(conversationId: string): void {
        const session = this._getByConvOrThrow(conversationId);
        this._transition(session, ConversationState.Done);
        this._emit({
            type: 'emit',
            message: {
                type: 'done',
                conversationId: session.conversationId,
                finishReason: 'complete',
            },
        });
    }

    stop(conversationId: string): void {
        const session = this._sessions.get(this._byConversation.get(conversationId) ?? '');
        if (!session) return;
        session.abortController.abort();
        this._transition(session, ConversationState.Done);
        this._emit({
            type: 'emit',
            message: {
                type: 'done',
                conversationId: session.conversationId,
                finishReason: 'stopped',
            },
        });
    }

    error(conversationId: string, code: string, message: string): void {
        const session = this._sessions.get(this._byConversation.get(conversationId) ?? '');
        if (!session) return;
        session.abortController.abort();
        this._transition(session, ConversationState.Done);
        this._emit({
            type: 'emit',
            message: {
                type: 'error',
                conversationId: session.conversationId,
                code: code as any,
                message,
            },
        });
    }

    transition(conversationId: string, to: ConversationState): void {
        const session = this._getByConvOrThrow(conversationId);
        this._transition(session, to);
    }

    private _transition(session: ConversationFSM, to: ConversationState): void {
        const from = session.state;
        if (from === to) return;

        if (!isValidTransition(from, to)) {
            throw new Error(
                `Invalid transition: ${from} -> ${to} for conversation ${session.conversationId}`,
            );
        }

        session.state = to;
        session.lastActivityAt = new Date();

        this._emit({
            type: 'transition',
            from,
            to,
            conversationId: session.conversationId,
        });
    }

    cleanup(conversationId: string): void {
        const sessionId = this._byConversation.get(conversationId);
        if (sessionId) {
            const session = this._sessions.get(sessionId);
            session?.abortController.abort();
            this._sessions.delete(sessionId);
            this._byConversation.delete(conversationId);
        }
    }

    private _getByConvOrThrow(conversationId: string): ConversationFSM {
        const sessionId = this._byConversation.get(conversationId);
        const session = sessionId ? this._sessions.get(sessionId) : null;
        if (!session) {
            throw new Error(`Session not found: ${conversationId}`);
        }
        return session;
    }
}
