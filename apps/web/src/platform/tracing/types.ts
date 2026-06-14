export interface SpanEvent {
    name: string;
    time: string;
    attributes?: Record<string, unknown>;
}

export interface SpanLink {
    traceId: string;
    spanId: string;
    attributes?: Record<string, unknown>;
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

export interface SpanOptions {
    traceId?: string;
    parentSpanId?: string;
    kind?: string;
    attributes?: Record<string, unknown>;
    links?: SpanLink[];
}

export interface TraceContext {
    readonly traceId: string;
    readonly spanId: string;
    readonly traceparent: string;
}

export interface ITracingService {
    startSpan(name: string, options?: SpanOptions): ActiveSpanLike;
    endSpan(span: ActiveSpanLike): SpanData;
    getTraceparent(traceId: string, spanId: string): string;
    toTraceContext(span: ActiveSpanLike): TraceContext;
    forceFlush(): void;
}

export interface ActiveSpanLike {
    readonly spanId: string;
    readonly traceId: string;
    readonly parentSpanId?: string;
    setAttribute(key: string, value: unknown): ActiveSpanLike;
    addEvent(name: string, attributes?: Record<string, unknown>): ActiveSpanLike;
    setError(message: string): ActiveSpanLike;
    end(): SpanData;
    toData(): SpanData;
}
