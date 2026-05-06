/**
 * ConnectionManager — WebSocket 连接管理
 *
 * 替代当前 AiService.clients Map，提供更完善的连接管理：
 * - 支持同一会话多客户端（多标签页）
 * - 事件广播和定向推送
 * - 断线清理
 */

import { Injectable, Logger } from '@nestjs/common';
import type { Socket } from 'socket.io';

export interface ClientEmitter {
    emit(event: string, data: unknown): void;
}

interface RegisteredClient {
    clientId: string;
    socket: ClientEmitter;
    conversationIds: Set<string>;
}

@Injectable()
export class ConnectionManager {
    private readonly logger = new Logger(ConnectionManager.name);
    private clients = new Map<string, RegisteredClient>(); // clientId -> client

    /**
     * 注册客户端
     */
    registerClient(clientId: string, socket: ClientEmitter): void {
        this.clients.set(clientId, {
            clientId,
            socket,
            conversationIds: new Set(),
        });
        this.logger.debug(`Client registered: ${clientId}`);
    }

    /**
     * 注销客户端
     */
    unregisterClient(clientId: string): void {
        const client = this.clients.get(clientId);
        if (client) {
            this.clients.delete(clientId);
            this.logger.debug(`Client unregistered: ${clientId}`);
        }
    }

    /**
     * 客户端加入对话
     */
    joinConversation(clientId: string, conversationId: string): void {
        const client = this.clients.get(clientId);
        if (!client) return;

        client.conversationIds.add(conversationId);
    }

    /**
     * 客户端离开启话
     */
    leaveConversation(clientId: string, conversationId: string): void {
        const client = this.clients.get(clientId);
        if (!client) return;

        client.conversationIds.delete(conversationId);
    }

    /**
     * 向指定客户端发送事件
     */
    emitToClient(clientId: string, event: string, data: unknown): void {
        const client = this.clients.get(clientId);
        if (client) {
            client.socket.emit(event, data);
        }
    }

    /**
     * 向对话中的所有客户端广播事件
     */
    emitToConversation(conversationId: string, event: string, data: unknown): void {
        for (const client of this.clients.values()) {
            if (client.conversationIds.has(conversationId)) {
                client.socket.emit(event, data);
            }
        }
    }

    /**
     * 获取对话中已连接的客户端 ID 列表
     */
    getConnectedClients(conversationId: string): string[] {
        const result: string[] = [];
        for (const client of this.clients.values()) {
            if (client.conversationIds.has(conversationId)) {
                result.push(client.clientId);
            }
        }
        return result;
    }

    /**
     * 检查客户端是否在线
     */
    isOnline(clientId: string): boolean {
        return this.clients.has(clientId);
    }

    /**
     * 获取所有活跃连接数
     */
    get connectionCount(): number {
        return this.clients.size;
    }
}
