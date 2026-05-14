/**
 * WsGateway — thin WebSocket router (transport layer only).
 *
 * Routes messages to RoomRouter for business logic.
 * Maintains clientId → Socket mapping via SocketRegistry.
 */

import { Injectable, Logger } from '@nestjs/common';
import {
    ConnectedSocket,
    MessageBody,
    SubscribeMessage,
    WebSocketGateway,
    WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import type { ErrorCode, ServerMessage } from '../ai/gateway/ai-ws-events.types';
import { RoomRouter } from '../ai/gateway/room-router';
import { ToolDispatcher } from '../ai/tools/tool.dispatcher';
import { SocketRegistry } from './socket-registry';

@WebSocketGateway({
    cors: {
        origin: process.env.FRONTEND_URL ?? 'http://localhost:4000',
        credentials: true,
    },
    namespace: 'ai',
})
@Injectable()
export class WsGateway {
    private readonly logger = new Logger(WsGateway.name);

    constructor(
        private registry: SocketRegistry,
        private roomRouter: RoomRouter,
        private toolDispatcher: ToolDispatcher,
    ) {}

    @WebSocketServer()
    server!: Server;

    handleConnection(client: Socket): void {
        this.logger.log(`Client connected: ${client.id}`);
        this.registry.register(client.id, client);
    }

    handleDisconnect(client: Socket): void {
        this.logger.log(`Client disconnected: ${client.id}`);
        this.registry.unregister(client.id);
    }

    private _emitToClient(clientId: string, msg: ServerMessage): void {
        this.registry.emitToClient(clientId, msg.type, msg);
    }

    private _emitError(
        clientId: string,
        conversationId: string,
        code: ErrorCode,
        message: string,
    ): void {
        this._emitToClient(clientId, {
            type: 'error',
            conversationId,
            code,
            message,
        });
    }

    @SubscribeMessage('create_and_send')
    async handleCreateAndSend(
        @MessageBody()
        data: { type: 'create_and_send'; content: string; context?: unknown },
        @ConnectedSocket() client: Socket,
    ): Promise<void> {
        try {
            await this.roomRouter.createAndSend(client.id, data.content, data.context, msg =>
                this._emitToClient(client.id, msg),
            );
        } catch (error) {
            this._emitError(client.id, '', 'LLM_UNAVAILABLE', (error as Error).message);
        }
    }

    @SubscribeMessage('send_message')
    async handleSendMessage(
        @MessageBody()
        data: {
            type: 'send_message';
            conversationId: string;
            content: string;
            context?: unknown;
        },
        @ConnectedSocket() client: Socket,
    ): Promise<void> {
        try {
            await this.roomRouter.sendMessage(
                client.id,
                data.conversationId,
                data.content,
                data.context,
                msg => this._emitToClient(client.id, msg),
            );
        } catch (error) {
            const msg = (error as Error).message;
            if (msg.includes('already active') || msg.includes('already has an active')) {
                this._emitError(
                    client.id,
                    data.conversationId,
                    'CONVERSATION_BUSY',
                    'Conversation is currently processing',
                );
            } else {
                this._emitError(client.id, data.conversationId, 'LLM_UNAVAILABLE', msg);
            }
        }
    }

    @SubscribeMessage('join')
    async handleJoin(
        @MessageBody() data: { type: 'join'; conversationId: string },
        @ConnectedSocket() client: Socket,
    ): Promise<void> {
        try {
            await this.roomRouter.joinRoom(data.conversationId, msg =>
                this._emitToClient(client.id, msg),
            );
        } catch (error) {
            this._emitError(
                client.id,
                data.conversationId,
                'CONVERSATION_NOT_FOUND',
                (error as Error).message,
            );
        }
    }

    @SubscribeMessage('stop')
    async handleStop(
        @MessageBody() data: { type: 'stop'; conversationId: string },
        @ConnectedSocket() _client: Socket,
    ): Promise<void> {
        this.roomRouter.stop(data.conversationId);
    }

    @SubscribeMessage('tool_result')
    async handleToolResult(
        @MessageBody()
        data: {
            type: 'tool_result';
            conversationId: string;
            toolCallId: string;
            result: unknown;
        },
        @ConnectedSocket() _client: Socket,
    ): Promise<void> {
        this.toolDispatcher.deliverResult(data.conversationId, data.toolCallId, data.result);
    }
}
