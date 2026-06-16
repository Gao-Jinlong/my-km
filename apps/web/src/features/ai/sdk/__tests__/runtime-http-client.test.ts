import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LangGraphStreamEvent } from '../../langgraph/types';
import { createLangGraphRuntimeClient } from '../runtime-http-client';

function sseBody(blocks: string[]): Response {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
        start(c) {
            for (const b of blocks) c.enqueue(encoder.encode(b));
            c.close();
        },
    });
    return { ok: true, status: 200, body: stream } as Response;
}

function jsonBody(data: unknown): Response {
    return {
        ok: true,
        status: 200,
        body: null,
        json: async () => data,
    } as Response;
}

describe('runtime-http-client', () => {
    afterEach(() => vi.restoreAllMocks());

    it('list GETs /threads:tid/runs and returns summaries', async () => {
        const fetchSpy = vi
            .spyOn(globalThis, 'fetch')
            .mockResolvedValue(jsonBody([{ id: 'run-1', status: 'running' }]));
        const client = createLangGraphRuntimeClient();
        const runs = await client.runs.list('thread-1');
        expect(runs).toEqual([{ id: 'run-1', status: 'running' }]);
        expect(fetchSpy).toHaveBeenCalledWith(
            expect.stringContaining('/threads/thread-1/runs'),
            expect.objectContaining({ method: 'GET' }),
        );
    });

    it('joinStream GETs stream endpoint with since query', async () => {
        const fetchSpy = vi
            .spyOn(globalThis, 'fetch')
            .mockResolvedValue(sseBody(['event: values\nid: 5\ndata: {"messages":[]}\n\n']));
        const client = createLangGraphRuntimeClient();
        const events: LangGraphStreamEvent[] = [];
        for await (const e of client.runs.joinStream('thread-1', 'run-1', 5)) events.push(e);
        expect(events).toEqual([{ event: 'values', data: { messages: [] }, seq: 5 }]);
        expect(fetchSpy).toHaveBeenCalledWith(
            expect.stringContaining('/threads/thread-1/runs/run-1/stream?since=5'),
            expect.any(Object),
        );
    });

    it('stream POSTs runs/stream and maps payload to body', async () => {
        const fetchSpy = vi
            .spyOn(globalThis, 'fetch')
            .mockResolvedValue(sseBody(['event: end\nid: 0\ndata: {}\n\n']));
        const client = createLangGraphRuntimeClient();
        const events: LangGraphStreamEvent[] = [];
        for await (const e of client.runs.stream('thread-1', 'default', {
            input: { messages: [{ type: 'human', content: 'hi' }] },
            multitaskStrategy: 'reject',
        }))
            events.push(e);
        expect(events).toEqual([{ event: 'end', data: {}, seq: 0 }]);
        const [, init] = fetchSpy.mock.calls[0];
        expect(init).toMatchObject({
            method: 'POST',
            body: JSON.stringify({
                input: { messages: [{ type: 'human', content: 'hi' }] },
                multitask_strategy: 'reject',
            }),
        });
    });

    it('cancel POSTs the cancel endpoint', async () => {
        const fetchSpy = vi
            .spyOn(globalThis, 'fetch')
            .mockResolvedValue({ ok: true, status: 200 } as Response);
        const client = createLangGraphRuntimeClient();
        await client.runs.cancel('thread-1', 'run-1', false);
        expect(fetchSpy).toHaveBeenCalledWith(
            expect.stringContaining('/threads/thread-1/runs/run-1/cancel'),
            expect.objectContaining({ method: 'POST' }),
        );
    });

    it('joinStream includes ?since=0 when since is 0', async () => {
        const fetchSpy = vi
            .spyOn(globalThis, 'fetch')
            .mockResolvedValue(sseBody(['event: end\nid: 0\ndata: {}\n\n']));
        const client = createLangGraphRuntimeClient();
        // drain so fetch is invoked
        for await (const _e of client.runs.joinStream('thread-1', 'run-1', 0)) {
            void _e;
        }
        expect(fetchSpy).toHaveBeenCalledWith(
            expect.stringContaining('/threads/thread-1/runs/run-1/stream?since=0'),
            expect.any(Object),
        );
    });

    it('joinStream omits ?since= when since is undefined', async () => {
        const fetchSpy = vi
            .spyOn(globalThis, 'fetch')
            .mockResolvedValue(sseBody(['event: end\nid: 0\ndata: {}\n\n']));
        const client = createLangGraphRuntimeClient();
        for await (const _e of client.runs.joinStream('thread-1', 'run-1')) {
            void _e;
        }
        const [url] = fetchSpy.mock.calls[0];
        expect(String(url)).toContain('/threads/thread-1/runs/run-1/stream');
        expect(String(url)).not.toContain('since=');
    });

    it('runs.list throws when response is not ok', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue({
            ok: false,
            status: 500,
        } as Response);
        const client = createLangGraphRuntimeClient();
        // vitest 3.2.4 has known issues with rejects.toThrow; use catch->resolves workaround.
        await expect(client.runs.list('thread-1').catch((e: Error) => e)).resolves.toMatchObject({
            message: expect.stringMatching(/listRuns failed: 500/),
        });
    });

    it('runs.cancel throws when response is not ok', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue({
            ok: false,
            status: 409,
        } as Response);
        const client = createLangGraphRuntimeClient();
        await expect(
            client.runs.cancel('thread-1', 'run-1', false).catch((e: Error) => e),
        ).resolves.toMatchObject({
            message: expect.stringMatching(/cancel failed: 409/),
        });
    });
});
