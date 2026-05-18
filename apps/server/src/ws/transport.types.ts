/**
 * Transport envelope types — decouples WsGateway from business message types.
 *
 * WsGateway only knows the outer envelope structure. Business modules define
 * inner message types independently.
 */

/** Outer transport envelope — the only shape WsGateway recognizes. */
export interface WsEnvelope {
    type: string; // 'message' | 'log' | 'heartbeat' | ...
    payload: unknown;
}

/** Inner business message — carried inside WsEnvelope.payload when type === 'message'. */
export interface BusinessMessage<T = unknown> {
    type: string; // See ai/gateway/ai-ws-events.types.ts for ClientMessageType enum
    payload: T;
}
