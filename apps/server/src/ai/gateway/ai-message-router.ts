/**
 * AiMessageRouter — MessageBus handler for AI room-level and tool messages.
 *
 * Self-subscribes to the MessageBus on module init, routing incoming messages
 * to the appropriate handler (RoomRouter or ToolDispatcher).
 *
 * This keeps ai.module.ts focused on provider registration and initialization,
 * while business message routing lives alongside the handlers it dispatches to.
 */

import { Injectable, OnModuleInit } from '@nestjs/common';
import { MessageBus } from '../../ws/message-bus';
import { WsGateway } from '../../ws/ws-gateway';
import { ToolDispatcher } from '../tools/tool.dispatcher';
import type { ServerMessage } from './ai-ws-events.types';
import { ClientMessageType, TransportMessageType } from './ai-ws-events.types';
import { RoomRouter } from './room-router';

@Injectable()
export class AiMessageRouter implements OnModuleInit {
    constructor(
        private messageBus: MessageBus,
        private wsGateway: WsGateway,
        private roomRouter: RoomRouter,
        private toolDispatcher: ToolDispatcher,
    ) {}

    onModuleInit() {
        // Subscribe to room-level messages
        this.messageBus.subscribe({
            allowedTypes: new Set([
                ClientMessageType.CreateAndSend,
                ClientMessageType.SendMessage,
                ClientMessageType.Join,
                ClientMessageType.Stop,
                TransportMessageType.Disconnect,
            ]),
            handle: msg => this._routeRoomMessage(msg),
        });

        // Subscribe to tool result messages
        this.messageBus.subscribe({
            allowedTypes: new Set([ClientMessageType.ToolResult]),
            handle: async msg => {
                const { roomId, toolCallId, result } = msg.payload as Record<string, unknown>;
                this.toolDispatcher.deliverResult(String(roomId), String(toolCallId), result);
            },
        });
    }

    /** Route incoming bus messages to the appropriate RoomRouter method. */
    private async _routeRoomMessage(msg: {
        type: string;
        clientId: string;
        payload: Record<string, unknown>;
    }): Promise<void> {
        const emit = (serverMsg: ServerMessage) => {
            this.wsGateway.emitToClient(msg.clientId, serverMsg.type, serverMsg);
        };

        switch (msg.type) {
            case ClientMessageType.CreateAndSend: {
                const { content, context } = msg.payload as Record<string, unknown>;
                await this.roomRouter.createAndSend(msg.clientId, String(content), context, emit);
                break;
            }
            case ClientMessageType.SendMessage: {
                const { roomId, content, context } = msg.payload as Record<string, unknown>;
                await this.roomRouter.sendMessage(
                    msg.clientId,
                    String(roomId),
                    String(content),
                    context,
                    emit,
                );
                break;
            }
            case ClientMessageType.Join: {
                const { roomId } = msg.payload as Record<string, unknown>;
                await this.roomRouter.joinRoom(String(roomId), emit);
                break;
            }
            case ClientMessageType.Stop: {
                const { roomId } = msg.payload as Record<string, unknown>;
                this.roomRouter.stop(String(roomId));
                break;
            }
            case TransportMessageType.Disconnect: {
                this.roomRouter.onClientDisconnect(msg.clientId);
                break;
            }
        }
    }
}
