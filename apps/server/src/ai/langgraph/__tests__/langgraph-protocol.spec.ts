import { Response } from 'express';
import { writeSSE } from '../langgraph-protocol';

function mockResponse(): { res: Response; chunks: string[] } {
    const chunks: string[] = [];
    const res = {
        writableEnded: false,
        write: jest.fn((chunk: string) => {
            chunks.push(chunk);
            return true;
        }),
    } as unknown as Response;
    return { res, chunks };
}

describe('writeSSE', () => {
    it('writes event + data without id line when seq is omitted', () => {
        const { res, chunks } = mockResponse();
        writeSSE(res, 'values', { messages: [] });
        expect(chunks).toHaveLength(1);
        expect(chunks[0]).not.toContain('id:');
        expect(chunks[0]).toContain('event: values');
        expect(chunks[0]).toContain('data: {"messages":[]}');
    });

    it('writes id: line with seq when provided', () => {
        const { res, chunks } = mockResponse();
        writeSSE(res, 'end', { finish_reason: 'cancelled' }, 42);
        expect(chunks[0]).toContain('id: 42');
        expect(chunks[0]).toContain('event: end');
        expect(chunks[0]).toContain('data: {"finish_reason":"cancelled"}');
    });

    it('does not write when response already ended', () => {
        const { res, chunks } = mockResponse();
        (res as { writableEnded: boolean }).writableEnded = true;
        writeSSE(res, 'end', {}, 1);
        expect(chunks).toHaveLength(0);
    });

    it('writes id: 0 when seq is zero (falsy but defined)', () => {
        const { res, chunks } = mockResponse();
        writeSSE(res, 'values', {}, 0);
        expect(chunks[0]).toContain('id: 0\n');
    });
});
