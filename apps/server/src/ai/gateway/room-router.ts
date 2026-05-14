/**
 * RoomRouter — business orchestration layer for AI WebSocket messages.
 *
 * Receives routed messages from WsGateway and orchestrates:
 * - ConversationService (CRUD)
 * - RoomStateMachineFactory (per-room FSM lifecycle)
 * - RequestDispatcher (rate limit + workflow execution)
 * - MessageService (history loading)
 */

import { Injectable } from '@nestjs/common';
import { ConversationService } from '../conversation/conversation.service';
import { RequestDispatcher } from '../dispatch/request-dispatcher';
import { MessageService } from '../message/message.service';
import type { ServerMessage } from './ai-ws-events.types';
import { RoomStateMachineFactory } from './room-statemachine-factory';

type EmitFn = (msg: ServerMessage) => void;

@Injectable()
export class RoomRouter {
    constructor(
        private conversationService: ConversationService,
        private messageService: MessageService,
        private requestDispatcher: RequestDispatcher,
        private stateMachineFactory: RoomStateMachineFactory,
    ) {}

    async createAndSend(
        clientId: string,
        content: string,
        context: unknown,
        emit: EmitFn,
    ): Promise<void> {
        const conversation = await this.conversationService.create({
            title: content.substring(0, 50),
        });

        emit({ type: 'created', conversationId: conversation.id });

        this.stateMachineFactory.create({
            conversationId: conversation.id,
            clientId,
            emit,
        });

        await this.requestDispatcher.dispatch({
            conversationId: conversation.id,
            clientId,
            content,
            context: context as Record<string, unknown> | undefined,
        });
    }

    async sendMessage(
        clientId: string,
        conversationId: string,
        content: string,
        context: unknown,
        emit: EmitFn,
    ): Promise<void> {
        const conversation = await this.conversationService.findById(conversationId);
        if (!conversation) {
            emit({
                type: 'error',
                conversationId,
                code: 'CONVERSATION_NOT_FOUND',
                message: 'Conversation not found',
            });
            return;
        }

        this.stateMachineFactory.create({
            conversationId,
            clientId,
            emit,
        });

        await this.requestDispatcher.dispatch({
            conversationId,
            clientId,
            content,
            context: context as Record<string, unknown> | undefined,
        });
    }

    async joinRoom(conversationId: string, emit: EmitFn): Promise<void> {
        const conversation = await this.conversationService.findById(conversationId);
        if (!conversation) {
            emit({
                type: 'error',
                conversationId,
                code: 'CONVERSATION_NOT_FOUND',
                message: 'Conversation not found',
            });
            return;
        }

        const messages = await this.messageService.findByConversationId(conversationId);
        emit({
            type: 'history',
            conversationId,
            messages: messages.map(m => ({
                id: m.id,
                role: m.role,
                content: m.content,
                toolCalls: m.toolCalls,
                createdAt: m.createdAt.toISOString(),
            })),
        });
    }

    stop(conversationId: string): void {
        const sm = this.stateMachineFactory.get(conversationId);
        if (sm) {
            sm.stop();
        }
    }
}
