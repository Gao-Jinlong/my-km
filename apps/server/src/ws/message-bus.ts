/**
 * MessageBus — lightweight in-process pub/sub for WebSocket messages.
 *
 * WsGateway publishes client messages here; business modules subscribe
 * handlers filtered by message type. No business logic lives in ws/.
 */

import { Injectable, Logger } from '@nestjs/common';

export interface BusMessage {
    type: string;
    clientId: string;
    payload: Record<string, unknown>;
}

export interface MessageHandler {
    allowedTypes: ReadonlySet<string>;
    handle(msg: BusMessage): Promise<void>;
}

export type UnsubscribeFn = () => void;

@Injectable()
export class MessageBus {
    private readonly logger = new Logger(MessageBus.name);
    private handlers = new Set<MessageHandler>();

    /** Register a handler. Returns an unsubscribe function. */
    subscribe(handler: MessageHandler): UnsubscribeFn {
        this.handlers.add(handler);
        return () => {
            this.handlers.delete(handler);
        };
    }

    /** Fan-out to all handlers whose allowedTypes include msg.type. */
    async publish(msg: BusMessage): Promise<void> {
        const matched: MessageHandler[] = [];
        for (const h of this.handlers) {
            if (h.allowedTypes.has(msg.type)) {
                matched.push(h);
            }
        }

        if (matched.length === 0) {
            this.logger.warn(`No handler for message type "${msg.type}"`);
            return;
        }

        await Promise.all(
            matched.map(async h => {
                try {
                    await h.handle(msg);
                } catch (err) {
                    this.logger.error(
                        `Handler threw for type "${msg.type}": ${(err as Error).message}`,
                        (err as Error).stack,
                    );
                }
            }),
        );
    }
}
