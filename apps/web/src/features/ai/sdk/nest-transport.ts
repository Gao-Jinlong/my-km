/**
 * NestSSETransport — 自定义 Transport 对接 NestJS SSE 端点
 *
 * 实现 FetchStreamTransport 兼容的接口，让 @langchain/langgraph-sdk
 * 的 useStream hook 能连接到我们的 NestJS 后端。
 *
 * FetchStreamTransport 期望:
 *   - POST 请求发送到 apiUrl
 *   - 响应为 SSE 流 (text/event-stream)
 *   - 每个事件格式: event: <method>\ndata: <JSON>\n\n
 *   - 返回 AsyncGenerator<{ event: string, data: unknown }>
 */

const API_URL = process.env.NEXT_PUBLIC_AI_API_URL ?? 'http://localhost:3001';

/**
 * SSE 端点路径 — 后端使用 NestJS 版本控制: /api/v1 前缀
 */
const SSE_ENDPOINTS = {
    chat: '/api/v1/ai/chat',
    resume: '/api/v1/ai/chat/resume',
    cancel: '/api/v1/ai/chat/cancel',
} as const;

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
    roomId?: string;
    context?: {
        documentId?: string;
        documentTitle?: string;
        documentPath?: string;
        selectedText?: string | null;
        fullContent?: string | null;
        cursorPosition?: unknown;
        formatState?: unknown;
    };
    command?: {
        resume?: {
            toolCallId: string;
            result: unknown;
        };
    };
}

/**
 * 发送聊天消息并返回 SSE 事件流
 */
export async function* streamChat(
    request: ChatRequest,
    signal?: AbortSignal,
): AsyncGenerator<SSEEvent> {
    const response = await fetch(`${API_URL}${SSE_ENDPOINTS.chat}`, {
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
 */
export async function* streamResume(
    roomId: string,
    toolCallId: string,
    result: unknown,
    signal?: AbortSignal,
): AsyncGenerator<SSEEvent> {
    const response = await fetch(`${API_URL}${SSE_ENDPOINTS.resume}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId, toolCallId, result }),
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
 * 取消生成
 */
export async function cancelChat(roomId: string): Promise<void> {
    await fetch(`${API_URL}${SSE_ENDPOINTS.cancel}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId }),
    });
}
