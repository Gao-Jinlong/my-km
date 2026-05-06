/**
 * WebSocket JWT 认证守卫
 *
 * 从 Socket.io 握手查询参数中提取 token 并验证。
 * 客户端连接格式: io('/ai', { query: { token: 'jwt-token' } })
 */

import { CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { WsException } from '@nestjs/websockets';
import { Socket } from 'socket.io';

interface AuthSocket extends Socket {
    userId?: string;
    userEmail?: string;
}

@Injectable()
export class WsConnectionGuard implements CanActivate {
    private readonly logger = new Logger(WsConnectionGuard.name);

    constructor(private jwtService: JwtService) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const client: Socket = context.switchToWs().getClient<Socket>();
        const token = this.extractToken(client);

        if (!token) {
            this.logger.warn(`WebSocket connection rejected: no token provided`);
            client.emit('error', {
                message: 'Authentication required',
                code: 'AUTH_TOKEN_MISSING',
            });
            client.disconnect(true);
            return false;
        }

        try {
            const payload = await this.jwtService.verifyAsync(token);
            // 将用户信息附加到客户端对象，供后续处理器使用
            const socket = client as AuthSocket;
            socket.userId = payload.sub;
            socket.userEmail = payload.email;
            return true;
        } catch (error) {
            this.logger.warn(`WebSocket auth failed: ${error}`);
            client.emit('error', {
                message: 'Invalid or expired token',
                code: 'AUTH_TOKEN_INVALID',
            });
            client.disconnect(true);
            return false;
        }
    }

    private extractToken(client: Socket): string | null {
        const query = client.handshake.query as Record<string, unknown>;
        const auth = client.handshake.auth as Record<string, unknown>;

        // 支持多种 token 传递方式
        const token =
            (query.token as string) ?? (auth.token as string) ?? (query.accessToken as string);

        return token?.startsWith('Bearer ') ? token.slice(7) : (token ?? null);
    }
}
