/**
 * LangGraph Protocol SSE 事件编码器
 *
 * 重构(Plan A1):
 * 大部分事件(messages、values)由 LangGraph runtime 透传 —
 * controller 直接订阅 `graph.stream(input, { streamMode: ['messages-tuple', 'values'] })`
 * 并把每个 chunk 用 `writeSSE` 转发即可。
 *
 * 此文件保留的辅助函数仅用于 controller/service 主动发出的协议事件:
 *   - metadata: run 开始时
 *   - end:      流结束
 *   - error:    异常
 *
 * 标准 SSE 事件格式:
 *   event: <type>\n
 *   data: <JSON>\n\n
 */

import type { Response } from 'express';

/**
 * 写一条 SSE 事件。seq（per-run 单调递增，spec 3.4/3.5）作为 SSE 标准 `id:` 行透传，
 * 供前端 joinStream/断线重连做 since=lastSeq 去重锚。seq 省略时不写 id 行
 * （向后兼容 writeMetadata/writeEnd/writeError 等无 seq 的内部调用）。
 */
export function writeSSE(res: Response, event: string, data: unknown, seq?: number): void {
    if (!res.writableEnded) {
        const idLine = seq !== undefined ? `id: ${seq}\n` : '';
        res.write(`event: ${event}\n${idLine}data: ${JSON.stringify(data)}\n\n`);
    }
}

/**
 * Run 开始时发送 metadata 事件。
 * SDK 用此获取 run_id 和 thread_id。
 */
export function writeMetadata(res: Response, runId: string, threadId: string): void {
    writeSSE(res, 'metadata', { run_id: runId, thread_id: threadId });
}

/**
 * 流结束事件。SDK 收到此事件后知道 run 完成。
 */
export function writeEnd(res: Response): void {
    writeSSE(res, 'end', {});
}

/**
 * 错误事件。
 */
export function writeError(res: Response, code: string, message: string): void {
    writeSSE(res, 'error', { error: code, message });
}
