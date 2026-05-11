/**
 * AI WebSocket 网关（重构版）
 *
 * 职责精简为：
 * - 连接生命周期管理
 * - 消息收发
 * - 委托业务逻辑给下层的 ConnectionManager 和 RequestDispatcher
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
import { AiService } from '../ai.service';
import { ConnectionManager } from '../connection/connection-manager';
import { ConversationService } from '../conversation/conversation.service';
import { RequestDispatcher } from '../dispatch/request-dispatcher';
import { AISessionManager } from '../session/ai-session-manager';
import { ToolDispatcher } from '../tools/tool.dispatcher';

interface ClientMsg {
    type: string;
    conversationId?: string;
    content?: string;
    context?: Record<string, unknown>;
    toolCallId?: string;
    result?: unknown;
    error?: string;
    /** 运行时 LLM 配置映射（节点 ID -> LLM 配置） */
    llmConfigMap?: Record<
        string,
        {
            provider: string;
            model: string;
            temperature?: number;
            maxTokens?: number;
        }
    >;
    /** 使用的工作流图名称 */
    graphName?: string;
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

    constructor(
        private aiService: AiService,
        private connectionManager: ConnectionManager,
        private conversationService: ConversationService,
        private requestDispatcher: RequestDispatcher,
        private sessionManager: AISessionManager,
        private toolDispatcher: ToolDispatcher,
    ) {}

    @WebSocketServer()
    server!: Server;

    /**
     * 连接
     */
    async handleConnection(client: Socket) {
        this.logger.log(
            `Client connected: ${client.id}, transport: ${client.conn.transport?.name ?? 'unknown'}`,
        );
        this.logger.log(`Handshake query: ${JSON.stringify(client.handshake.query)}`);
        this.logger.log(`Handshake auth: ${JSON.stringify(client.handshake.auth)}`);

        // 注册到 ConnectionManager
        this.connectionManager.registerClient(client.id, {
            emit: (event: string, data: unknown) => client.emit(event, data),
        });
    }

    /**
     * 断开连接
     */
    handleDisconnect(client: Socket) {
        this.logger.log(`Client disconnected: ${client.id}`);

        // 中断该客户端的活跃会话
        this.sessionManager.abortByClientId(client.id);

        // 从 ConnectionManager 注销
        this.connectionManager.unregisterClient(client.id);
    }

    /**
     * 加入对话
     *
     * 如果对话不存在，自动创建（决策 D3/D11）。
     * TODO(P1): 从 JWT 提取 userId，传入 createConversation
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

        // 确保对话存在：不存在则自动创建
        let conversation = await this.conversationService.findById(data.conversationId);
        if (!conversation) {
            this.logger.log(
                `[${client.id}] conversation not found, creating: ${data.conversationId}`,
            );
            // TODO(P1): 从 JWT 提取 userId 传入
            conversation = await this.conversationService.create({
                id: data.conversationId,
                userId: undefined,
            });
        }

        client.join(data.conversationId);
        this.logger.log(`[${client.id}] joined room: ${data.conversationId}`);

        this.connectionManager.joinConversation(client.id, data.conversationId);

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

        try {
            await this.requestDispatcher.dispatch({
                conversationId: data.conversationId,
                clientId: client.id,
                content: data.content,
                context: data.context,
                llmConfigMap: data.llmConfigMap,
                graphName: data.graphName,
            });
        } catch (error) {
            if ((error as Error).name === 'AbortError') {
                this.logger.log(`Generation stopped for ${client.id}:${data.conversationId}`);
                client.emit('stream_done');
            } else {
                this.logger.error(`AI message failed:`, error);
                client.emit('error', { message: 'Internal error', code: 'AI_ERROR' });
            }
        }
    }

    /**
     * 停止生成
     */
    @SubscribeMessage('stop')
    handleStop(@MessageBody() data: ClientMsg, @ConnectedSocket() _client: Socket) {
        if (!data.conversationId) return;

        const session = this.sessionManager.findByConversationId(data.conversationId);
        if (session) {
            this.sessionManager.abort(session.id);
        }
    }

    /**
     * 工具执行结果
     */
    @SubscribeMessage('tool_result')
    handleToolResult(@MessageBody() data: ClientMsg, @ConnectedSocket() _client: Socket) {
        if (!data.conversationId || !data.toolCallId) return;

        // 通过 ToolDispatcher 分发（统一路径，消除全局 EventEmitter）
        const session = this.sessionManager.findByConversationId(data.conversationId);
        this.toolDispatcher.deliverResult(
            data.conversationId,
            data.toolCallId,
            data.error ? { error: data.error } : data.result,
            data.error,
            session?.id,
        );
    }
}
