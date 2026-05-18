import type { ClientMessage, ServerMessage } from '../ai.types';

describe('ClientMessage discriminated union', () => {
    it('accepts create_and_send with content', () => {
        const msg: ClientMessage = { type: 'create_and_send', content: 'Hello' };
        expect(msg.type).toBe('create_and_send');
    });

    it('accepts send_message with roomId', () => {
        const msg: ClientMessage = {
            type: 'send_message',
            roomId: 'room-1',
            content: 'Hello',
        };
        expect(msg.type).toBe('send_message');
    });

    it('accepts tool_result', () => {
        const msg: ClientMessage = {
            type: 'tool_result',
            roomId: 'room-1',
            toolCallId: 'tc-1',
            result: { text: 'done' },
        };
        expect(msg.type).toBe('tool_result');
    });

    it('accepts stop', () => {
        const msg: ClientMessage = { type: 'stop', roomId: 'room-1' };
        expect(msg.type).toBe('stop');
    });

    it('accepts join', () => {
        const msg: ClientMessage = { type: 'join', roomId: 'room-1' };
        expect(msg.type).toBe('join');
    });
});

describe('ServerMessage discriminated union', () => {
    it('accepts created with roomId', () => {
        const msg: ServerMessage = { type: 'created', roomId: 'room-1' };
        expect(msg.type).toBe('created');
    });

    it('accepts text_chunk with roomId', () => {
        const msg: ServerMessage = {
            type: 'text_chunk',
            roomId: 'room-1',
            content: 'Hello',
        };
        expect(msg.type).toBe('text_chunk');
    });

    it('accepts tool_call with all fields', () => {
        const msg: ServerMessage = {
            type: 'tool_call',
            roomId: 'room-1',
            toolCallId: 'tc-1',
            toolName: 'search',
            input: { query: 'test' },
            requiresConfirmation: false,
        };
        expect(msg.type).toBe('tool_call');
        if (msg.type === 'tool_call') {
            expect(msg.requiresConfirmation).toBe(false);
        }
    });

    it('accepts status event', () => {
        const msg: ServerMessage = { type: 'status', roomId: 'room-1', status: 'thinking' };
        expect(msg.type).toBe('status');
    });

    it('accepts done with finishReason', () => {
        const msg: ServerMessage = {
            type: 'done',
            roomId: 'room-1',
            finishReason: 'complete',
        };
        expect(msg.type).toBe('done');
    });

    it('accepts error with code', () => {
        const msg: ServerMessage = {
            type: 'error',
            roomId: 'room-1',
            code: 'ROOM_NOT_FOUND',
            message: 'Not found',
        };
        expect(msg.type).toBe('error');
    });
});
