/**
 * AI WebSocket 网关（新协议版）
 *
 * 事件协议：
 * - create_and_send: 创建对话并发送首条消息
 * - send_message: 已有对话发送消息
 * - join: 加入对话，加载历史
 * - stop: 中止生成
 * - tool_result: 工具执行结果
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
import { ConnectionManager } from '../connection/connection-manager';
import { ConversationService } from '../conversation/conversation.service';
import { RequestDispatcher } from '../dispatch/request-dispatcher';
import { MessageService } from '../message/message.service';
import { AISessionManager } from '../session/ai-session-manager';
import { ToolDispatcher } from '../tools/tool.dispatcher';
import type { ClientMessage, ServerMessage } from './ai-ws-events.types';
import { ConversationStateMachine } from './conversation-statemachine';

@WebSocketGateway({
    cors: {
        origin: process.env.FRONTEND_URL ?? 'http://localhost:4000',
        credentials: true,
    },
    namespace: 'ai',
})
@Injectable()
export class AiGateway {
    private readonly logger = new Logger(AiGateway.name);

    constructor(
        private connectionManager: ConnectionManager,
        private conversationService: ConversationService,
        private requestDispatcher: RequestDispatcher,
        private sessionManager: AISessionManager,
        private toolDispatcher: ToolDispatcher,
        private stateMachine: ConversationStateMachine,
        private messageService: MessageService,
    ) {
        this.setupStateMachineHandler();
    }

    @WebSocketServer()
    server!: Server;

    private setupStateMachineHandler(): void {
        this.stateMachine.onEvent(event => {
            if (event.type === 'emit') {
                this.server
                    .to(event.message.conversationId)
                    .emit(event.message.type, event.message);
            }
        });
    }

    async handleConnection(client: Socket) {
        this.logger.log(`Client connected: ${client.id}`);
        this.connectionManager.registerClient(client.id, {
            emit: (event: string, data: unknown) => client.emit(event, data),
        });
    }

    handleDisconnect(client: Socket) {
        this.logger.log(`Client disconnected: ${client.id}`);
        this.sessionManager.abortByClientId(client.id);
        this.connectionManager.unregisterClient(client.id);
    }

    @SubscribeMessage('create_and_send')
    async handleCreateAndSend(
        @MessageBody() data: ClientMessage & { type: 'create_and_send' },
        @ConnectedSocket() client: Socket,
    ): Promise<void> {
        try {
            const conversation = await this.conversationService.create({
                title: data.content.substring(0, 50),
            });

            client.join(conversation.id);
            this.connectionManager.joinConversation(client.id, conversation.id);

            // Emit created
            client.emit('created', { type: 'created', conversationId: conversation.id });

            // Create session
            const session = this.sessionManager.create({
                conversationId: conversation.id,
                clientId: client.id,
            });

            // Create state machine session
            this.stateMachine.create({
                conversationId: conversation.id,
                clientId: client.id,
            });

            // Dispatch the message
            await this.requestDispatcher.dispatch({
                conversationId: conversation.id,
                clientId: client.id,
                content: data.content,
                context: data.context,
                sessionId: session.id,
            });
        } catch (error) {
            client.emit('error', {
                type: 'error',
                conversationId: '',
                code: 'LLM_UNAVAILABLE',
                message: (error as Error).message,
            });
        }
    }

    @SubscribeMessage('send_message')
    async handleSendMessage(
        @MessageBody() data: ClientMessage & { type: 'send_message' },
        @ConnectedSocket() client: Socket,
    ): Promise<void> {
        try {
            const conversation = await this.conversationService.findById(data.conversationId);
            if (!conversation) {
                client.emit('error', {
                    type: 'error',
                    conversationId: data.conversationId,
                    code: 'CONVERSATION_NOT_FOUND',
                    message: 'Conversation not found',
                });
                return;
            }

            client.join(data.conversationId);
            this.connectionManager.joinConversation(client.id, data.conversationId);

            const session = this.sessionManager.create({
                conversationId: data.conversationId,
                clientId: client.id,
            });

            this.stateMachine.create({
                conversationId: data.conversationId,
                clientId: client.id,
            });

            await this.requestDispatcher.dispatch({
                conversationId: data.conversationId,
                clientId: client.id,
                content: data.content,
                context: data.context,
                sessionId: session.id,
            });
        } catch (error) {
            const msg = (error as Error).message;
            if (msg.includes('already active') || msg.includes('already has an active')) {
                client.emit('error', {
                    type: 'error',
                    conversationId: data.conversationId,
                    code: 'CONVERSATION_BUSY',
                    message: 'Conversation is currently processing',
                });
            } else {
                client.emit('error', {
                    type: 'error',
                    conversationId: data.conversationId,
                    code: 'LLM_UNAVAILABLE',
                    message: msg,
                });
            }
        }
    }

    @SubscribeMessage('join')
    async handleJoin(
        @MessageBody() data: { type: 'join'; conversationId: string },
        @ConnectedSocket() client: Socket,
    ): Promise<void> {
        try {
            const conversation = await this.conversationService.findById(data.conversationId);
            if (!conversation) {
                client.emit('error', {
                    type: 'error',
                    conversationId: data.conversationId,
                    code: 'CONVERSATION_NOT_FOUND',
                    message: 'Conversation not found',
                });
                return;
            }

            client.join(data.conversationId);
            this.connectionManager.joinConversation(client.id, data.conversationId);

            // Load and emit history
            const messages = await this.messageService.findByConversationId(data.conversationId);
            client.emit('history', {
                type: 'history',
                conversationId: data.conversationId,
                messages: messages.map((m: any) => ({
                    id: m.id,
                    role: m.role,
                    content: m.content,
                    toolCalls: m.toolCalls,
                    createdAt: m.createdAt.toISOString(),
                })),
            });
        } catch (error) {
            client.emit('error', {
                type: 'error',
                conversationId: data.conversationId,
                code: 'CONVERSATION_NOT_FOUND',
                message: (error as Error).message,
            });
        }
    }

    @SubscribeMessage('stop')
    async handleStop(
        @MessageBody() data: { type: 'stop'; conversationId: string },
        @ConnectedSocket() _client: Socket,
    ): Promise<void> {
        const session = this.sessionManager.findByConversationId(data.conversationId);
        if (session) {
            this.stateMachine.stop(session.conversationId);
        }
    }

    @SubscribeMessage('tool_result')
    async handleToolResult(
        @MessageBody() data: {
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
