/**
 * SSE 解析器：fetch + ReadableStream + TextDecoder，产出 { event, data, seq? }。
 *
 * 用于 owner 的 runs.stream（POST）与重连的 runs.joinStream（GET）。SDK Client 不解析
 * SSE 标准 `id:` 行，故需自 fetch 以拿到 seq（spec 3.4/3.5 重连去重锚）。
 *
 * 解析规则（SSE 规范子集）：
 *   - 以空行（\n\n）分隔事件块
 *   - `event:` 行 → event 名（默认 'message'）
 *   - `data:` 行 → data（取首行，JSON.parse，失败保留原字符串）
 *   - `id:` 行 → seq（parseInt，NaN 时忽略）
 */

export interface ParsedSSEEvent {
    event: string;
    data: unknown;
    seq?: number;
}

export async function* fetchSSE(url: string, init: RequestInit): AsyncGenerator<ParsedSSEEvent> {
    const headers = new Headers({ Accept: 'text/event-stream' });
    if (init.headers) {
        // 规范化调用者 headers（Headers 实例 / plain object / array 均可），调用者优先覆盖默认 Accept。
        for (const [key, value] of new Headers(init.headers)) {
            headers.set(key, value);
        }
    }
    const res = await fetch(url, {
        ...init,
        headers,
    });
    if (!res.ok || !res.body) {
        throw new Error(`SSE request failed: ${res.status}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    try {
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const blocks = buffer.split('\n\n');
            buffer = blocks.pop() ?? '';
            for (const block of blocks) {
                const parsed = parseSSEBlock(block);
                if (parsed) yield parsed;
            }
        }
        if (buffer.trim()) {
            const parsed = parseSSEBlock(buffer);
            if (parsed) yield parsed;
        }
    } finally {
        reader.releaseLock();
    }
}

function parseSSEBlock(block: string): ParsedSSEEvent | null {
    let event = 'message';
    let dataStr = '';
    let seq: number | undefined;

    for (const line of block.split('\n')) {
        if (line.startsWith('event:')) {
            event = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
            // 单行 data 语义（后端 writeSSE 单行 data）：取首行 JSON，忽略后续 data 行。
            if (dataStr === '') dataStr = line.slice(5).trim();
        } else if (line.startsWith('id:')) {
            const n = Number.parseInt(line.slice(3).trim(), 10);
            if (Number.isFinite(n)) seq = n;
        }
    }

    if (dataStr === '' && event === 'message' && seq === undefined) return null;

    let data: unknown = dataStr;
    if (dataStr) {
        try {
            data = JSON.parse(dataStr);
        } catch {
            data = dataStr;
        }
    }
    return { event, data, seq };
}
