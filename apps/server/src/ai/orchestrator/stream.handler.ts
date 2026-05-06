/**
 * StreamHandler — 流式输出处理
 *
 * 处理 LLM 流式输出片段的推送和累积。
 */

export interface StreamCallbacks {
    onChunk: (content: string) => void;
    onToolCall: (toolCall: { id: string; name: string; arguments: object }) => void;
    onDone: () => void;
    onError: (error: Error) => void;
}

export class StreamHandler {
    private accumulatedText = '';

    constructor(private callbacks: StreamCallbacks) {}

    /**
     * 处理流式输出片段
     */
    handleChunk(chunk: {
        type: string;
        content?: string;
        toolCall?: { id: string; name: string; arguments: object };
    }): void {
        if (chunk.type === 'text_chunk') {
            const text = chunk.content ?? '';
            this.accumulatedText += text;
            this.callbacks.onChunk(text);
        } else if (chunk.type === 'tool_call' && chunk.toolCall) {
            this.callbacks.onToolCall(chunk.toolCall);
        } else if (chunk.type === 'done') {
            this.callbacks.onDone();
        }
    }

    /**
     * 获取累积的文本
     */
    get text(): string {
        return this.accumulatedText;
    }

    /**
     * 处理错误
     */
    handleError(error: unknown): void {
        const err = error instanceof Error ? error : new Error(String(error));
        this.callbacks.onError(err);
    }
}
