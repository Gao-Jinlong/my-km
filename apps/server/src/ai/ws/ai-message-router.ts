/**
 * AiMessageRouter — unified message router for AI WebSocket messages.
 *
 * Phase 2 rewrite: replaces RoomRouter + old AiMessageRouter.
 * Self-subscribes to MessageBus, directly calls RoomService/RoomSessionRegistry/RequestDispatcher.
 */

import { Injectable, OnModuleInit } from '@nestjs/common';
import { MessageBus } from '../../ws/message-bus';
import { WsGateway } from '../../ws/ws-gateway';
import { RoomService } from '../conversation/room.service';
import { RequestDispatcher } from '../dispatch/request-dispatcher';
import type { LLMConfig } from '../llm/provider.types';
import { ProviderRegistry } from '../llm/provider-registry';
import { MessageService } from '../message/message.service';
import type { EmitFn, WorkflowCallbacks } from '../session/room-session.types';
import { RoomSessionRegistry } from '../session/room-session-registry';
import { ToolDispatcher } from '../tools/tool.dispatcher';
import {
    ClientMessageType,
    type LlmConfig,
    type MessageWire,
    type ServerMessage,
    TransportMessageType,
} from './ai-ws-events.types';

type EmitToClient = (serverMsg: ServerMessage) => void;

@Injectable()
export class AiMessageRouter implements OnModuleInit {
    constructor(
        private messageBus: MessageBus,
        private wsGateway: WsGateway,
        private roomService: RoomService,
        private messageService: MessageService,
        private roomSessionRegistry: RoomSessionRegistry,
        private requestDispatcher: RequestDispatcher,
        private toolDispatcher: ToolDispatcher,
        private providerRegistry: ProviderRegistry,
    ) {}

    onModuleInit() {
        this.roomSessionRegistry.startPeriodicCleanup();

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

        this.messageBus.subscribe({
            allowedTypes: new Set([ClientMessageType.ToolResult]),
            handle: async msg => {
                const { roomId, toolCallId, result } = msg.payload as Record<string, unknown>;
                this.toolDispatcher.deliverResult(String(roomId), String(toolCallId), result);
            },
        });
    }

    private _buildEmit(clientId: string): EmitToClient {
        return (serverMsg: ServerMessage) => {
            this.wsGateway.emitToClient(clientId, serverMsg.type, serverMsg);
        };
    }

    private async _routeRoomMessage(msg: {
        type: string;
        clientId: string;
        payload: Record<string, unknown>;
    }): Promise<void> {
        const emit = this._buildEmit(msg.clientId);

        switch (msg.type) {
            case ClientMessageType.CreateAndSend: {
                const { content, context, llmConfig } = msg.payload as Record<string, unknown>;
                await this._handleCreateAndSend(
                    msg.clientId,
                    String(content),
                    context,
                    llmConfig as LlmConfig | undefined,
                    emit,
                );
                break;
            }
            case ClientMessageType.SendMessage: {
                const { roomId, content, context, llmConfig } = msg.payload as Record<
                    string,
                    unknown
                >;
                await this._handleSendMessage(
                    msg.clientId,
                    String(roomId),
                    String(content),
                    context,
                    llmConfig as LlmConfig | undefined,
                    emit,
                );
                break;
            }
            case ClientMessageType.Join: {
                const { roomId } = msg.payload as Record<string, unknown>;
                await this._handleJoinRoom(String(roomId), emit);
                break;
            }
            case ClientMessageType.Stop: {
                const { roomId } = msg.payload as Record<string, unknown>;
                this._handleStop(String(roomId));
                break;
            }
            case TransportMessageType.Disconnect: {
                this._handleDisconnect(msg.clientId);
                break;
            }
        }
    }

    private async _handleCreateAndSend(
        clientId: string,
        content: string,
        context: unknown,
        llmConfig: LlmConfig | undefined,
        emit: EmitToClient,
    ): Promise<void> {
        // 1. Create room
        const room = await this.roomService.create({
            title: content.substring(0, 20),
        });

        emit({ type: 'created', roomId: room.id });

        // 2. Create room session
        const session = this.roomSessionRegistry.create({
            roomId: room.id,
            clientId,
            emit,
        });

        // 3. Start FSM: receiveMessage → BuildingContext
        session.stateMachine.receiveMessage();

        // 4. Build callbacks bridge
        const callbacks = this._buildCallbacks(session);

        // 5. Dispatch
        await this.requestDispatcher.dispatch({
            roomId: room.id,
            clientId,
            content,
            context: context as Record<string, unknown> | undefined,
            llmConfigMap: llmConfig
                ? ({
                      llm_call: {
                          provider: llmConfig.provider,
                          ...(llmConfig.model ? { model: llmConfig.model } : {}),
                      },
                  } as Record<string, LLMConfig>)
                : undefined,
            defaultConfig: this.providerRegistry.defaultConfig,
            callbacks,
        });
    }

    private async _handleSendMessage(
        clientId: string,
        roomId: string,
        content: string,
        context: unknown,
        llmConfig: LlmConfig | undefined,
        emit: EmitToClient,
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

        // Create/refresh room session
        const session = this.roomSessionRegistry.create({
            roomId,
            clientId,
            emit,
        });

        // Start FSM: receiveMessage → BuildingContext
        session.stateMachine.receiveMessage();

        // Build callbacks bridge
        const callbacks = this._buildCallbacks(session);

        await this.requestDispatcher.dispatch({
            roomId,
            clientId,
            content,
            context: context as Record<string, unknown> | undefined,
            llmConfigMap: llmConfig
                ? ({
                      llm_call: {
                          provider: llmConfig.provider,
                          ...(llmConfig.model ? { model: llmConfig.model } : {}),
                      },
                  } as Record<string, LLMConfig>)
                : undefined,
            defaultConfig: this.providerRegistry.defaultConfig,
            callbacks,
        });
    }

    private async _handleJoinRoom(roomId: string, emit: EmitFn): Promise<void> {
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

    private _handleStop(roomId: string): void {
        const session = this.roomSessionRegistry.get(roomId);
        if (session && session.isActive()) {
            session.stateMachine.stop();
        }
    }

    private _handleDisconnect(clientId: string): void {
        this.roomSessionRegistry.destroyByClientId(clientId);
    }

    /** Build the WorkflowCallbacks bridge that decouples Executor from transport. */
    private _buildCallbacks(
        session: import('../session/room-session').RoomSession,
    ): WorkflowCallbacks {
        const sm = session.stateMachine;

        return {
            onTextChunk: (_rid, chunk) => sm.textChunk(chunk),
            onToolCall: (_rid, info) => sm.toolCall(info),
            onLlmDone: _rid => sm.llmDone(),
            onError: (_rid, code, message) => sm.error(code, message),
            onTimeout: (_rid, detail) => sm.timeout(detail),
            onStop: () => sm.stop(),
        };
    }
}
