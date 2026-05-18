/**
 * RoomRouter — business orchestration layer for AI WebSocket messages.
 *
 * Receives routed messages from WsGateway and orchestrates:
 * - RoomService (CRUD)
 * - RoomStateMachineFactory (per-room FSM lifecycle)
 * - RequestDispatcher (rate limit + workflow execution)
 * - MessageService (history loading)
 */

import { Injectable } from '@nestjs/common';
import { RoomService } from '../conversation/room.service';
import { RequestDispatcher } from '../dispatch/request-dispatcher';
import { MessageService } from '../message/message.service';
import type { MessageWire, ServerMessage } from './ai-ws-events.types';
import { RoomStateMachineFactory } from './room-statemachine-factory';

type EmitFn = (msg: ServerMessage) => void;

@Injectable()
export class RoomRouter {
    constructor(
        private roomService: RoomService,
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
        const room = await this.roomService.create({
            title: content.substring(0, 50),
        });

        emit({ type: 'created', roomId: room.id });

        this.stateMachineFactory.create({
            roomId: room.id,
            clientId,
            emit,
        });

        await this.requestDispatcher.dispatch({
            roomId: room.id,
            clientId,
            content,
            context: context as Record<string, unknown> | undefined,
        });
    }

    async sendMessage(
        clientId: string,
        roomId: string,
        content: string,
        context: unknown,
        emit: EmitFn,
    ): Promise<void> {
        const room = await this.roomService.findById(roomId);
        if (!room) {
            emit({
                type: 'error',
                roomId,
                code: 'ROOM_NOT_FOUND',
                message: 'Room not found',
            });
            return;
        }

        this.stateMachineFactory.create({
            roomId,
            clientId,
            emit,
        });

        await this.requestDispatcher.dispatch({
            roomId,
            clientId,
            content,
            context: context as Record<string, unknown> | undefined,
        });
    }

    async joinRoom(roomId: string, emit: EmitFn): Promise<void> {
        const room = await this.roomService.findById(roomId);
        if (!room) {
            emit({
                type: 'error',
                roomId,
                code: 'ROOM_NOT_FOUND',
                message: 'Room not found',
            });
            return;
        }

        const messages = await this.messageService.findByRoomId(roomId);
        emit({
            type: 'history',
            roomId,
            messages: messages.map(m => ({
                id: m.id,
                role: m.role as MessageWire['role'],
                content: m.content,
                toolCalls:
                    (m.toolCalls as Array<{ id: string; name: string }> | undefined) ?? undefined,
                createdAt: m.createdAt.toISOString(),
            })),
        });
    }

    stop(roomId: string): void {
        const sm = this.stateMachineFactory.get(roomId);
        if (sm) {
            sm.stop();
        }
    }

    onClientDisconnect(clientId: string): void {
        this.stateMachineFactory.destroyByClientId(clientId);
    }
}
