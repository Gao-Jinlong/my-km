/**
 * AI WebSocket 网关
 *
 * 处理前后端双向通信：
 * - 用户消息接收和流式输出
 * - Tool call 回调
 * - 对话历史加载
 */

import { Logger } from '@nestjs/common';
import {
    ConnectedSocket,
    MessageBody,
    SubscribeMessage,
    WebSocketGateway,
    WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { AiService } from './ai.service';
import { aiToolEvent } from './ai-events';

/**
 * 客户端 → 服务端消息
 */
interface ClientMsg {
    type: string;
    conversationId?: string;
    content?: string;
    context?: Record<string, unknown>;
    toolCallId?: string;
    result?: unknown;
    error?: string;
}

@WebSocketGateway({
    cors: {
        origin: process.env.FRONTEND_URL ?? 'http://localhost:4000',
        credentials: true,
    },
    namespace: 'ai',
})
export class AiGateway {
    private readonly logger = new Logger(AiGateway.name);
    private abortControllers = new Map<string, AbortController>();

    @WebSocketServer()
    server!: Server;

    constructor(private aiService: AiService) {}

    /**
     * 连接认证
     */
    async handleConnection(client: Socket) {
        this.logger.log(
            `Client connected: ${client.id}, transport: ${client.conn.transport?.name ?? 'unknown'}`,
        );
        this.logger.log(`Handshake query: ${JSON.stringify(client.handshake.query)}`);
        this.logger.log(`Handshake auth: ${JSON.stringify(client.handshake.auth)}`);
    }

    handleDisconnect(client: Socket) {
        this.logger.log(`Client disconnected: ${client.id}`);
        // 清理该客户端的 abort controller
        for (const [key, ctrl] of this.abortControllers) {
            if (key.startsWith(client.id)) {
                ctrl.abort();
                this.abortControllers.delete(key);
            }
        }
    }

    /**
     * 加入对话
     */
    @SubscribeMessage('join')
    async handleJoin(@MessageBody() data: ClientMsg, @ConnectedSocket() client: Socket) {
        this.logger.log(`[${client.id}] join event received: ${JSON.stringify(data)}`);

        if (!data.conversationId) {
            this.logger.warn(`[${client.id}] join rejected: no conversationId`);
            client.emit('error', {
                message: 'conversationId is required',
                code: 'MISSING_CONVERSATION_ID',
            });
            return;
        }

        client.join(data.conversationId);
        this.logger.log(`[${client.id}] joined room: ${data.conversationId}`);
        this.aiService.registerClient(data.conversationId, {
            send: msg => client.emit('message', msg),
        });

        client.emit('joined', { conversationId: data.conversationId });

        // 加载历史
        const history = await this.aiService.getConversationHistory(data.conversationId);
        this.logger.log(`[${client.id}] sending ${history.length} history messages`);
        client.emit('history', { messages: history });
    }

    /**
     * 发送消息
     */
    @SubscribeMessage('message')
    async handleMessage(@MessageBody() data: ClientMsg, @ConnectedSocket() client: Socket) {
        this.logger.log(
            `[${client.id}] message received: conversationId=${data.conversationId}, contentLength=${data.content?.length ?? 0}`,
        );

        if (!data.conversationId || !data.content) {
            this.logger.warn(`[${client.id}] message rejected: missing conversationId or content`);
            client.emit('error', {
                message: 'conversationId and content are required',
                code: 'MISSING_PARAMS',
            });
            return;
        }

        const key = `${client.id}:${data.conversationId}`;
        const abortController = new AbortController();
        this.abortControllers.set(key, abortController);

        try {
            await this.aiService.handleUserMessage(
                data.conversationId,
                data.content,
                data.context,
                abortController.signal,
            );
        } catch (error) {
            if (error.name === 'AbortError') {
                this.logger.log(`Generation stopped for ${key}`);
                client.emit('stream_done');
            } else {
                this.logger.error(`AI message failed:`, error);
                client.emit('error', { message: 'Internal error', code: 'AI_ERROR' });
            }
        } finally {
            this.abortControllers.delete(key);
            this.aiService.removeClient(data.conversationId);
        }
    }

    /**
     * 停止生成
     */
    @SubscribeMessage('stop')
    handleStop(@MessageBody() data: ClientMsg, @ConnectedSocket() client: Socket) {
        if (!data.conversationId) return;

        const key = `${client.id}:${data.conversationId}`;
        const controller = this.abortControllers.get(key);
        if (controller) {
            controller.abort();
            this.abortControllers.delete(key);
        }
    }

    /**
     * 工具执行结果
     */
    @SubscribeMessage('tool_result')
    handleToolResult(@MessageBody() data: ClientMsg, @ConnectedSocket() _client: Socket) {
        if (!data.conversationId || !data.toolCallId) return;

        this.aiService.handleToolResult(
            data.conversationId,
            data.toolCallId,
            data.error ? { error: data.error } : data.result,
        );

        // 通过 EventEmitter 通知 AiService 的 waitForToolResults
        aiToolEvent.emit('tool_result', {
            conversationId: data.conversationId,
            toolCallId: data.toolCallId,
            result: data.result,
            error: data.error,
        });
    }
}
