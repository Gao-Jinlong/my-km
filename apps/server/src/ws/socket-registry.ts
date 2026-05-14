import { Injectable, Logger } from '@nestjs/common';
import type { Socket } from 'socket.io';

@Injectable()
export class SocketRegistry {
    private readonly logger = new Logger(SocketRegistry.name);
    private sockets = new Map<string, Socket>();

    register(clientId: string, socket: Socket): void {
        this.sockets.set(clientId, socket);
        this.logger.debug(`Socket registered: ${clientId}`);
    }

    unregister(clientId: string): void {
        this.sockets.delete(clientId);
        this.logger.debug(`Socket unregistered: ${clientId}`);
    }

    getSocket(clientId: string): Socket | null {
        return this.sockets.get(clientId) ?? null;
    }

    emitToClient(clientId: string, event: string, data: unknown): void {
        const socket = this.sockets.get(clientId);
        if (socket) {
            socket.emit(event, data);
        }
    }

    isOnline(clientId: string): boolean {
        return this.sockets.has(clientId);
    }
}
