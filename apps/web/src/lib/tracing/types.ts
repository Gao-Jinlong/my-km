/**
 * 前端 OTel Span 数据结构（序列化后发送到后端）
 */

export interface SpanEvent {
    name: string;
    time: string;
    attributes?: Record<string, unknown>;
}

export interface SpanLink {
    traceId: string;
    spanId: string;
}

export interface SpanData {
    spanId: string;
    traceId: string;
    parentSpanId?: string;
    name: string;
    kind: string;
    serviceName: string;
    startTime: string;
    endTime?: string;
    durationMs?: number;
    status?: string;
    statusMessage?: string;
    attributes?: Record<string, unknown>;
    events?: SpanEvent[];
    links?: SpanLink[];
}
