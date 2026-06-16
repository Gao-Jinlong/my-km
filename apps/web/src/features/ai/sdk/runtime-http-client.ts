/**
 * LangGraph Runtime HTTP Client —— 实现 LangGraphRuntimeClient。
 *
 * - runs.stream（POST /runs/stream，owner 发起）、runs.joinStream（GET /runs/:rid/stream，重连）、
 *   runs.list（GET /runs）、runs.cancel（POST /runs/:rid/cancel）：自 fetch（list/cancel JSON，stream/joinStream 经 sse-stream 解析拿 seq）。
 * - threads.create / threads.getState：透传 @langchain/langgraph-sdk Client（无需 seq）。
 *
 * 替代 runtime-factory 旧实现里 `createLangGraphClient() as unknown as LangGraphRuntimeClient`
 * 的强转 —— 旧实现无法提供 joinStream/list/seq。
 *
 * 注：SDK 1.9.11 的 threads.create 返回 Promise<Thread>、getState 返回 Promise<ThreadState>，
 * 与 LangGraphRuntimeClient 契约（thread_id 形 / values 形）结构不完全一致（运行时兼容，
 * 因后端响应同时携带 thread_id 与 values）。故在透传处用最小断言收敛类型，避免 `as unknown` 整体强转。
 */

import type { Client } from '@langchain/langgraph-sdk';
import type {
    LangGraphRawMessage,
    LangGraphRunSummary,
    LangGraphRunsStreamPayload,
    LangGraphRuntimeClient,
    LangGraphStreamEvent,
} from '../langgraph/types';
import { createLangGraphClient, LANGGRAPH_API_URL } from './langgraph-client';
import { fetchSSE } from './sse-stream';

export function createLangGraphRuntimeClient(): LangGraphRuntimeClient {
    const sdk: Client = createLangGraphClient();
    const base = LANGGRAPH_API_URL.replace(/\/$/, '');

    return {
        threads: {
            create: () =>
                // SDK 返回 Thread（含 thread_id 等），契约要求 { thread_id }；运行时兼容，最小断言。
                sdk.threads.create() as Promise<{ thread_id: string }>,
            getState: (threadId: string) =>
                // SDK 返回 ThreadState（含 values），契约要求 { values? }；运行时兼容，最小断言。
                sdk.threads.getState(threadId) as Promise<{
                    values?: { messages?: LangGraphRawMessage[] };
                }>,
        },
        runs: {
            stream: (threadId, _assistantId, payload) => streamRunHttp(base, threadId, payload),
            joinStream: (threadId, runId, since) => joinStreamHttp(base, threadId, runId, since),
            list: (threadId: string) => listRunsHttp(base, threadId),
            cancel: async (threadId, runId, _wait, _action) => {
                // 后端 POST /api/threads/:tid/runs/:rid/cancel（无 body，忽略 wait/action）
                const res = await fetch(`${base}/threads/${threadId}/runs/${runId}/cancel`, {
                    method: 'POST',
                });
                if (!res.ok) throw new Error(`cancel failed: ${res.status}`);
            },
        },
    };
}

async function* streamRunHttp(
    base: string,
    threadId: string,
    payload?: LangGraphRunsStreamPayload,
): AsyncGenerator<LangGraphStreamEvent> {
    const body = toRunsStreamBody(payload);
    yield* fetchSSE(`${base}/threads/${threadId}/runs/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: payload?.signal,
    });
}

async function* joinStreamHttp(
    base: string,
    threadId: string,
    runId: string,
    since?: number,
): AsyncGenerator<LangGraphStreamEvent> {
    const query = since !== undefined ? `?since=${since}` : '';
    yield* fetchSSE(`${base}/threads/${threadId}/runs/${runId}/stream${query}`, {
        method: 'GET',
    });
}

async function listRunsHttp(base: string, threadId: string): Promise<LangGraphRunSummary[]> {
    const res = await fetch(`${base}/threads/${threadId}/runs`, { method: 'GET' });
    if (!res.ok) throw new Error(`listRuns failed: ${res.status}`);
    const runs = (await res.json()) as Array<{ id: string; status: string }>;
    return runs.map(r => ({ id: r.id, status: r.status }));
}

/** 前端 payload（camelCase）→ 后端 RunsStreamBody（snake_case multitask_strategy） */
function toRunsStreamBody(payload?: LangGraphRunsStreamPayload): Record<string, unknown> {
    const body: Record<string, unknown> = {};
    if (payload?.input !== undefined) body.input = payload.input;
    if (payload?.command !== undefined) body.command = payload.command;
    if (payload?.context !== undefined) body.context = payload.context;
    if (payload?.multitaskStrategy !== undefined) {
        body.multitask_strategy = payload.multitaskStrategy;
    }
    return body;
}
