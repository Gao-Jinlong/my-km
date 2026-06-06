/**
 * LangGraph Protocol SSE 事件编码器
 *
 * 将内部事件转换为 LangGraph Platform 标准 SSE 格式，
 * 供 @langchain/langgraph-sdk 的 BytesLineDecoder + SSEDecoder 消费。
 *
 * 标准 SSE 事件格式:
 *   event: <type>\n
 *   data: <JSON>\n\n
 *
 * 支持的事件类型:
 *   metadata  — run 开始时发送一次 {run_id, thread_id}
 *   values    — 完整状态快照 {messages: [...]}
 *   error     — 错误 {error: string, message: string}
 *   end       — 流结束 {}
 */

import type { Response } from 'express';

// ========== SSE 写入工具 ==========

/**
 * 将事件编码为 SSE 文本格式并写入 Response
 */
export function writeSSE(res: Response, event: string, data: unknown): void {
    if (!res.writableEnded) {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    }
}

// ========== Metadata Events ==========

/**
 * Run 开始时发送 metadata 事件。
 * SDK 用此获取 run_id 和 thread_id。
 */
export function writeMetadata(res: Response, runId: string, threadId: string): void {
    writeSSE(res, 'metadata', { run_id: runId, thread_id: threadId });
}

// ========== Values Events ==========

/**
 * 发送完整状态快照。
 * SDK 的 useStream 用 values 事件更新 messages 列表。
 *
 * messages 格式遵循 LangChain 消息类型:
 *   - HumanMessage: { type: 'human', content: string, id: string }
 *   - AIMessage:    { type: 'ai', content: string, id: string, tool_calls?: [...] }
 */
export function writeValues(res: Response, messages: Array<Record<string, unknown>>): void {
    writeSSE(res, 'values', { messages });
}

// ========== End Events ==========

/**
 * 流结束事件。SDK 收到此事件后知道 run 完成。
 */
export function writeEnd(res: Response): void {
    writeSSE(res, 'end', {});
}

// ========== Error Events ==========

/**
 * 错误事件。
 */
export function writeError(res: Response, code: string, message: string): void {
    writeSSE(res, 'error', { error: code, message });
}

// ========== Helper: 构建 LangChain 格式的 messages ==========

/**
 * 将内部消息格式转换为 LangChain SDK 期望的 Message 格式。
 *
 * 输入（内部格式）:
 *   { role: 'user' | 'assistant', content: string }
 *
 * 输出（LangChain 格式）:
 *   { type: 'human' | 'ai', content: string, id: string }
 */
export function toLangChainMessages(
    internalMessages: Array<{ role: string; content: string; id?: string }>,
): Array<Record<string, unknown>> {
    return internalMessages.map(msg => ({
        type: msg.role === 'user' || msg.role === 'human' ? 'human' : 'ai',
        content: msg.content,
        id: msg.id ?? crypto.randomUUID(),
    }));
}
