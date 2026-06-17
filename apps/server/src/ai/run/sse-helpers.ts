/**
 * SSE 协议帧工具（run streaming 传输细节）。
 *
 * 标准 SSE 事件格式：
 *   event: <type>\n
 *   id: <seq>\n   (可选)
 *   data: <JSON>\n\n
 *
 * 这三个纯函数由 AiChatService 在 streamRun/joinStream 内部调用，
 * controller 不直接碰 SSE 帧格式。
 */

import type { Response } from 'express';

/**
 * 写一条 SSE 事件。
 *
 * @param seq per-run 单调递增，作为 SSE 标准 `id:` 行透传，
 *            供前端 joinStream/断线重连做 since=lastSeq 去重锚。省略时不写 id 行。
 */
export function writeSSE(res: Response, event: string, data: unknown, seq?: number): void {
    if (!res.writableEnded) {
        const idLine = seq !== undefined ? `id: ${seq}\n` : '';
        res.write(`event: ${event}\n${idLine}data: ${JSON.stringify(data)}\n\n`);
    }
}

/** 设置 SSE 响应头并 flush（开启流式响应）。 */
export function setSseHeaders(res: Response): void {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
}

/**
 * 写 SSE 错误帧并结束响应。用于 streamRun/joinStream 执行中异常的协议映射。
 * res 已结束时为 no-op（避免重复 end）。
 */
export function sendProtocolError(res: Response, code: string, message: string): void {
    if (!res.writableEnded) {
        res.write(`event: error\ndata: ${JSON.stringify({ error: code, message })}\n\n`);
        res.end();
    }
}
