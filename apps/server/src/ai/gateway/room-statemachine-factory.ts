/**
 * RoomStateMachineFactory — manages per-room FSM instances.
 *
 * Each room gets its own state machine instance.
 * The factory tracks sessions by conversationId and by clientId
 * (for cleanup on disconnect).
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConversationState } from './conversation-statemachine.types';
import { EmitFn, RoomStateMachine } from './room-statemachine';

export interface CreateOptions {
    conversationId: string;
    clientId: string;
    emit: EmitFn;
}

@Injectable()
export class RoomStateMachineFactory {
    private readonly logger = new Logger(RoomStateMachineFactory.name);
    private byConversationId = new Map<string, RoomStateMachine>();
    private byClientId = new Map<string, Set<string>>();

    create(options: CreateOptions): RoomStateMachine {
        const existing = this.byConversationId.get(options.conversationId);
        if (existing && existing.state !== ConversationState.Done) {
            throw new Error(`Conversation ${options.conversationId} already active`);
        }

        // Clean up any stale Done session
        if (existing) {
            this.byConversationId.delete(options.conversationId);
            const clientSet = this.byClientId.get(options.clientId);
            clientSet?.delete(options.conversationId);
        }

        const sm = new RoomStateMachine(options.conversationId, options.clientId, options.emit);
        this.byConversationId.set(options.conversationId, sm);

        if (!this.byClientId.has(options.clientId)) {
            this.byClientId.set(options.clientId, new Set());
        }
        this.byClientId.get(options.clientId)!.add(options.conversationId);

        this.logger.debug(`FSM created for room ${options.conversationId}`);
        return sm;
    }

    get(conversationId: string): RoomStateMachine | null {
        return this.byConversationId.get(conversationId) ?? null;
    }

    destroy(conversationId: string): void {
        const sm = this.byConversationId.get(conversationId);
        if (sm) {
            sm.abortController.abort();
            const clientSet = this.byClientId.get(sm.clientId);
            clientSet?.delete(conversationId);
        }
        this.byConversationId.delete(conversationId);
        this.logger.debug(`FSM destroyed for room ${conversationId}`);
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
