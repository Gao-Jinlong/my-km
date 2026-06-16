import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchSSE } from '../sse-stream';

/** 用给定 SSE 文本块构造一个伪 ReadableStream Response。 */
function mockSSEResponse(chunks: string[], ok = true, status = 200): Response {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
        start(controller) {
            for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
            controller.close();
        },
    });
    return {
        ok,
        status,
        body: stream,
    } as Response;
}

describe('fetchSSE', () => {
    afterEach(() => vi.restoreAllMocks());

    it('parses event / data / id lines and yields {event, data, seq}', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            mockSSEResponse([
                'event: metadata\nid: 0\ndata: {"run_id":"run-1"}\n\n',
                'event: values\nid: 1\ndata: {"messages":[]}\n\n',
            ]),
        );

        const events = [];
        for await (const e of fetchSSE('http://x/api', {})) events.push(e);

        expect(events).toEqual([
            { event: 'metadata', data: { run_id: 'run-1' }, seq: 0 },
            { event: 'values', data: { messages: [] }, seq: 1 },
        ]);
    });

    it('handles multi-line data and missing id (seq undefined)', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            mockSSEResponse(['data: {"a":1}\ndata: {"b":2}\n\n']),
        );
        const events = [];
        for await (const e of fetchSSE('http://x', {})) events.push(e);
        expect(events).toEqual([{ event: 'message', data: { a: 1 }, seq: undefined }]);
    });

    it('handles chunks split across read boundaries', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            mockSSEResponse(['event: met', 'adata\nid: 0\ndata: {"x":1}\n\n']),
        );
        const events = [];
        for await (const e of fetchSSE('http://x', {})) events.push(e);
        expect(events).toEqual([{ event: 'metadata', data: { x: 1 }, seq: 0 }]);
    });

    it('throws on non-ok response', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockSSEResponse([], false, 500));
        // NOTE: vitest 3.2.4 的 rejects.toThrow(regex/string) 有 bug（无法读取被拒 Error 的 message，
        // 已存在的 platform/command service 测试同样失败）。改为手动捕获并断言 message 含 status。
        await expect(
            fetchSSE('http://x', {})
                .next()
                .catch((e: Error) => e),
        ).resolves.toMatchObject({ message: expect.stringMatching(/500/) });
    });

    it('passes Accept header and init through', async () => {
        const fetchSpy = vi
            .spyOn(globalThis, 'fetch')
            .mockResolvedValue(mockSSEResponse(['data: {}\n\n']));
        const ac = new AbortController();
        await fetchSSE('http://x', { method: 'POST', body: '{}', signal: ac.signal }).next();
        expect(fetchSpy).toHaveBeenCalledWith(
            'http://x',
            expect.objectContaining({
                method: 'POST',
                // headers 现为 Headers 实例（规范化），其 own props 不可直接 objectContaining，
                // 故取第 2 参数的 headers 经 .get 验证 Accept 透传。
                headers: expect.any(Headers),
                signal: ac.signal,
            }),
        );
        expect((fetchSpy.mock.calls[0][1] as RequestInit).headers as Headers).toBeInstanceOf(
            Headers,
        );
        expect(((fetchSpy.mock.calls[0][1] as RequestInit).headers as Headers).get('Accept')).toBe(
            'text/event-stream',
        );
    });

    it('handles multi-byte chars split across chunks', async () => {
        const encoder = new TextEncoder();
        const full = encoder.encode('event: values\ndata: {"msg":"你好"}\n\n');
        // 在中间切开（可能切断多字节序列）
        const mid = Math.floor(full.length / 2);
        vi.spyOn(globalThis, 'fetch').mockResolvedValue({
            ok: true,
            status: 200,
            body: new ReadableStream<Uint8Array>({
                start(c) {
                    c.enqueue(full.slice(0, mid));
                    c.enqueue(full.slice(mid));
                    c.close();
                },
            }),
        } as Response);
        const events = [];
        for await (const e of fetchSSE('http://x', {})) events.push(e);
        expect(events).toEqual([{ event: 'values', data: { msg: '你好' }, seq: undefined }]);
    });
});
