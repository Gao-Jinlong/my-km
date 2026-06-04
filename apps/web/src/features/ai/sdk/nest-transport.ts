/**
 * NestSSETransport — 自定义 Transport 对接 NestJS SSE 端点
 *
 * 实现 FetchStreamTransport 兼容的接口，连接 Thread/Run 架构的后端。
 *
 * SSE 事件格式: event: <method>\ndata: <JSON>\n\n
 * 返回 AsyncGenerator<{ event: string, data: unknown }>
 */

const API_URL = process.env.NEXT_PUBLIC_AI_API_URL ?? 'http://localhost:3001';

/**
 * 动态 URL 构建 — 对齐后端 Thread/Run 路由
 */
function runUrl(threadId: string): string {
    return `${API_URL}/api/v1/ai/threads/${threadId}/runs`;
}

function resumeUrl(runId: string): string {
    return `${API_URL}/api/v1/ai/runs/${runId}/resume`;
}

function cancelUrl(runId: string): string {
    return `${API_URL}/api/v1/ai/runs/${runId}/cancel`;
}

export interface SSEEvent {
    event: string;
    data: unknown;
}

/**
 * 解析 SSE 流为 AsyncGenerator
 */
async function* parseSSEStream(
    body: ReadableStream<Uint8Array>,
    signal?: AbortSignal,
): AsyncGenerator<SSEEvent> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
        while (true) {
            if (signal?.aborted) break;

            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });

            // SSE 事件之间用 \n\n 分隔
            const parts = buffer.split('\n\n');
            // 最后一个可能不完整，保留在 buffer
            buffer = parts.pop() ?? '';

            for (const part of parts) {
                if (!part.trim()) continue;

                let event = 'message';
                let data = '';

                for (const line of part.split('\n')) {
                    if (line.startsWith('event: ')) {
                        event = line.slice(7).trim();
                    } else if (line.startsWith('data: ')) {
                        data = line.slice(6);
                    }
                }

                if (data) {
                    try {
                        const parsed = JSON.parse(data);
                        yield { event, data: parsed };
                    } catch {
                        yield { event, data };
                    }
                }
            }
        }
    } finally {
        reader.releaseLock();
    }
}

export interface ChatRequest {
    content?: string;
    context?: {
        documentId?: string;
        documentTitle?: string;
        documentPath?: string;
        selectedText?: string | null;
        fullContent?: string | null;
        cursorPosition?: unknown;
        formatState?: unknown;
    };
    concurrency?: 'rejected' | 'interrupt' | 'rollback';
    llmConfig?: { provider?: string; model?: string };
}

/**
 * 发送聊天消息并返回 SSE 事件流
 *
 * threadId 放入 URL 路径，body 只包含 content/context/concurrency/llmConfig。
 */
export async function* streamChat(
    threadId: string,
    request: ChatRequest,
    signal?: AbortSignal,
): AsyncGenerator<SSEEvent> {
    const response = await fetch(runUrl(threadId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        signal,
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`HTTP ${response.status}: ${text}`);
    }

    if (!response.body) {
        throw new Error('Response body is null — SSE not supported');
    }

    yield* parseSSEStream(response.body, signal);
}

/**
 * 发送工具恢复请求并返回 SSE 事件流
 *
 * runId 放入 URL 路径，body 只包含 toolCallId 和 result。
 */
export async function* streamResume(
    runId: string,
    toolCallId: string,
    result: unknown,
    signal?: AbortSignal,
): AsyncGenerator<SSEEvent> {
    const response = await fetch(resumeUrl(runId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toolCallId, result }),
        signal,
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`HTTP ${response.status}: ${text}`);
    }

    if (!response.body) {
        throw new Error('Response body is null');
    }

    yield* parseSSEStream(response.body, signal);
}

/**
 * 取消正在进行的 Run
 */
export async function cancelRun(runId: string): Promise<void> {
    await fetch(cancelUrl(runId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
    });
}

/** @deprecated Use cancelRun instead */
export const cancelChat = cancelRun;
