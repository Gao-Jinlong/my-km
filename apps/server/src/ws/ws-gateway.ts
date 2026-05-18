/**
 * WsGateway — pure WebSocket transport layer.
 *
 * Subscribes only to the generic 'message' event, extracts the inner business
 * message from the envelope, and publishes to MessageBus. Knows nothing about
 * business message types (create_and_send, send_message, etc.).
 *
 * Provides emitToClient for business modules to send responses.
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
import { MessageBus } from './message-bus';
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
        private messageBus: MessageBus,
    ) {}

    @WebSocketServer()
    server!: Server;

    /** Send a message to a specific client. Used by business modules. */
    emitToClient(clientId: string, event: string, data: unknown): void {
        this.registry.emitToClient(clientId, event, data);
    }

    handleConnection(client: Socket): void {
        this.logger.log(`Client connected: ${client.id}`);
        this.registry.register(client.id, client);
    }

    handleDisconnect(client: Socket): void {
        this.logger.log(`Client disconnected: ${client.id}`);
        this.messageBus.publish({
            type: 'disconnect',
            clientId: client.id,
            payload: {},
        });
        this.registry.unregister(client.id);
    }

    /**
     * Generic message handler — the ONLY inbound business message handler.
     * Expects envelope format: { type: string, payload: unknown }
     * Extracts inner type/payload and publishes to MessageBus.
     */
    @SubscribeMessage('message')
    async handleMessage(
        @MessageBody() data: Record<string, unknown>,
        @ConnectedSocket() client: Socket,
    ): Promise<void> {
        const innerType = data?.type;
        if (typeof innerType !== 'string' || innerType.length === 0) {
            this.logger.warn(
                `Received message with missing/invalid type from ${client.id}: ${JSON.stringify(data)}`,
            );
            return;
        }

        const payload = (data?.payload ?? {}) as Record<string, unknown>;
        this.messageBus.publish({ type: innerType, clientId: client.id, payload });
    }
}
