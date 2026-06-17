import type { Response } from 'express';
import { sendProtocolError, setSseHeaders, writeSSE } from '../sse-helpers';

function createMockResponse(): { res: Response; writes: string[] } {
    const writes: string[] = [];
    const res = {
        writableEnded: false,
        write: jest.fn((chunk: string) => {
            writes.push(chunk);
            return true;
        }),
        end: jest.fn(() => {
            (res as { writableEnded: boolean }).writableEnded = true;
        }),
        setHeader: jest.fn(),
        flushHeaders: jest.fn(),
    } as unknown as Response;
    return { res, writes };
}

describe('writeSSE', () => {
    it('writes event + data lines', () => {
        const { res, writes } = createMockResponse();
        writeSSE(res, 'values', { messages: [] });
        expect(writes[0]).toBe('event: values\ndata: {"messages":[]}\n\n');
    });

    it('includes id line when seq provided', () => {
        const { res, writes } = createMockResponse();
        writeSSE(res, 'end', {}, 42);
        expect(writes[0]).toContain('id: 42\n');
        expect(writes[0]).toContain('event: end\n');
    });

    it('omits id line when seq undefined', () => {
        const { res, writes } = createMockResponse();
        writeSSE(res, 'values', {});
        expect(writes[0]).not.toContain('id:');
    });

    it('skips write when res.writableEnded', () => {
        const { res, writes } = createMockResponse();
        (res as { writableEnded: boolean }).writableEnded = true;
        writeSSE(res, 'values', { a: 1 });
        expect(writes).toHaveLength(0);
    });
});

describe('setSseHeaders', () => {
    it('sets all four SSE headers and flushes', () => {
        const { res } = createMockResponse();
        setSseHeaders(res);
        const setHeader = res.setHeader as jest.Mock;
        expect(setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
        expect(setHeader).toHaveBeenCalledWith('Cache-Control', 'no-cache');
        expect(setHeader).toHaveBeenCalledWith('Connection', 'keep-alive');
        expect(setHeader).toHaveBeenCalledWith('X-Accel-Buffering', 'no');
        expect(res.flushHeaders).toHaveBeenCalled();
    });
});

describe('sendProtocolError', () => {
    it('writes error frame and ends response', () => {
        const { res, writes } = createMockResponse();
        sendProtocolError(res, 'execution_error', 'boom');
        expect(writes[0]).toBe('event: error\ndata: {"error":"execution_error","message":"boom"}\n\n');
        expect(res.end).toHaveBeenCalled();
    });

    it('is no-op when res already ended', () => {
        const { res, writes } = createMockResponse();
        (res as { writableEnded: boolean }).writableEnded = true;
        sendProtocolError(res, 'execution_error', 'boom');
        expect(writes).toHaveLength(0);
        expect(res.end).not.toHaveBeenCalled();
    });
});
