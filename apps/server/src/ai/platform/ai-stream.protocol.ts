/**
 * AI Stream Protocol — LangGraph Agent Streaming Protocol 适配器
 *
 * 将本地 LangGraph StateGraph 执行结果转换为 LangGraph Protocol SSE 事件格式。
 * 前端 @langchain/langgraph-sdk 的 FetchStreamTransport 消费此格式。
 *
 * SSE 事件格式 (每行):
 *   event: <method>\n
 *   data: <JSON payload>\n\n
 *
 * 支持的事件类型:
 *   messages    — 流式文本片段 (替代旧 text_chunk)
 *   lifecycle   — 运行生命周期 (started/completed/failed/interrupted)
 *   values      — 完整状态快照 (完成时发送)
 *   tools       — 工具调用/结果 (替代旧 tool_call)
 *   error       — 错误事件
 */

/**
 * SSE 事件: 写入一个格式化的 SSE 事件到 Response stream
 */
export interface StreamEvent {
    event: string;
    data: unknown;
}

/**
 * 将 StreamEvent 编码为 SSE 文本格式
 */
export function encodeSSE(e: StreamEvent): string {
    return `event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`;
}

// ========== Lifecycle Events ==========

export function lifecycleStarted(threadId?: string): StreamEvent {
    return {
        event: 'lifecycle',
        data: {
            event: 'started',
            namespace: [],
            timestamp: Date.now(),
            ...(threadId && { threadId }),
        },
    };
}

export function lifecycleCompleted(): StreamEvent {
    return {
        event: 'lifecycle',
        data: {
            event: 'completed',
            namespace: [],
            timestamp: Date.now(),
        },
    };
}

export function lifecycleFailed(error: string): StreamEvent {
    return {
        event: 'lifecycle',
        data: {
            event: 'failed',
            namespace: [],
            timestamp: Date.now(),
            error,
        },
    };
}

export function lifecycleInterrupted(): StreamEvent {
    return {
        event: 'lifecycle',
        data: {
            event: 'interrupted',
            namespace: [],
            timestamp: Date.now(),
        },
    };
}

// ========== Messages Events ==========
// 使用 content-block-centric 模型流式传输 AI 消息

let messageSeqCounter = 0;

export function resetMessageSeq(): void {
    messageSeqCounter = 0;
}

/** 消息开始 — AI 开始生成回复 */
export function messageStart(messageId: string): StreamEvent {
    return {
        event: 'messages',
        data: {
            event: 'message-start',
            message_id: messageId,
            role: 'ai',
            seq: messageSeqCounter++,
        },
    };
}

/** 文本内容块开始 */
export function contentBlockStart(index: number, messageId: string): StreamEvent {
    return {
        event: 'messages',
        data: {
            event: 'content-block-start',
            message_id: messageId,
            seq: messageSeqCounter++,
            index,
            content_block: { type: 'text', text: '' },
        },
    };
}

/** 文本增量 — 流式文本片段 */
export function textDelta(text: string, index: number, messageId: string): StreamEvent {
    return {
        event: 'messages',
        data: {
            event: 'content-block-delta',
            message_id: messageId,
            seq: messageSeqCounter++,
            index,
            delta: { type: 'text-delta', text },
        },
    };
}

/** 内容块完成 */
export function contentBlockFinish(
    index: number,
    messageId: string,
    fullText: string,
): StreamEvent {
    return {
        event: 'messages',
        data: {
            event: 'content-block-finish',
            message_id: messageId,
            seq: messageSeqCounter++,
            index,
            content_block: { type: 'text', text: fullText },
        },
    };
}

/** 消息完成 */
export function messageFinish(messageId: string, reason: string = 'stop'): StreamEvent {
    return {
        event: 'messages',
        data: {
            event: 'message-finish',
            message_id: messageId,
            seq: messageSeqCounter++,
            reason,
        },
    };
}

// ========== Tool Events ==========

/** 工具调用开始 */
export function toolStarted(
    toolCallId: string,
    toolName: string,
    args: Record<string, unknown>,
): StreamEvent {
    return {
        event: 'tools',
        data: {
            event: 'tool-started',
            tool_call_id: toolCallId,
            name: toolName,
            args,
            timestamp: Date.now(),
        },
    };
}

/** 工具调用完成 */
export function toolCompleted(toolCallId: string, result: unknown): StreamEvent {
    return {
        event: 'tools',
        data: {
            event: 'tool-completed',
            tool_call_id: toolCallId,
            result,
            timestamp: Date.now(),
        },
    };
}

/** 工具调用错误 */
export function toolError(toolCallId: string, error: string): StreamEvent {
    return {
        event: 'tools',
        data: {
            event: 'tool-error',
            tool_call_id: toolCallId,
            error,
            timestamp: Date.now(),
        },
    };
}

// ========== Values Events ==========

/** 完整状态快照 — 图执行完成时发送 */
export function valuesSnapshot(values: { messages: unknown[]; threadId: string }): StreamEvent {
    return {
        event: 'values',
        data: values,
    };
}

// ========== Error Events ==========

export function errorEvent(code: string, message: string): StreamEvent {
    return {
        event: 'error',
        data: {
            type: 'error',
            id: null,
            error: code,
            message,
        },
    };
}
