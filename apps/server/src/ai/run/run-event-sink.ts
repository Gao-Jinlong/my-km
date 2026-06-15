import type { RunStreamEvent } from '../event/event-bus';

/**
 * RunEventSink — joinStream 的事件出口抽象（spec 3.8）。
 *
 * JoinStreamService 把回放/续实时的事件 push 到 sink，controller 负责把 sink
 * 适配到 SSE Response（push → writeSSE，close → res.end）。service 因此与
 * HTTP/SSE 解耦，可用收集器 sink 单测。
 */
export interface RunEventSink {
    /** 推送一个事件（已按 seq 去重，调用方直接渲染） */
    push(event: RunStreamEvent): void;
    /** 关闭流（终态到达或客户端断开） */
    close(): void;
}
