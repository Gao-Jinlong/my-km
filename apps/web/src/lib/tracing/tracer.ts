/**
 * BrowserTracer — 轻量级前端 Span 追踪器
 *
 * 不引入 OTel SDK 全家桶（太重），只用 `@opentelemetry/api` 的
 * traceContext 生成工具。手动创建 Span 数据，通过 BrowserSpanExporter
 * 批量 POST 到后端。
 *
 * 使用方式：
 *   const tracer = new BrowserTracer();
 *   const span = tracer.startSpan('frontend.chat.sendMessage', { ... });
 *   span.addEvent('stream_start');
 *   span.end();
 */

import type { SpanData, SpanEvent, SpanLink } from './types';

const SERVICE_NAME = 'my-km-web';
const FLUSH_INTERVAL = 5000;
const FLUSH_BATCH_SIZE = 10;
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api';

export class ActiveSpan {
    readonly spanId: string;
    readonly traceId: string;
    readonly parentSpanId?: string;
    readonly name: string;
    readonly kind: string;
    readonly startTime: string;
    readonly attributes: Record<string, unknown>;
    readonly events: SpanEvent[] = [];
    readonly links: SpanLink[] = [];
    status: string = 'OK';
    statusMessage?: string;
    endTime?: string;
    durationMs?: number;
    private ended = false;

    constructor(options: {
        name: string;
        traceId?: string;
        parentSpanId?: string;
        kind?: string;
        attributes?: Record<string, unknown>;
        links?: SpanLink[];
    }) {
        this.spanId = generateSpanId();
        this.traceId = options.traceId ?? generateTraceId();
        this.parentSpanId = options.parentSpanId;
        this.name = options.name;
        this.kind = options.kind ?? 'INTERNAL';
        this.startTime = new Date().toISOString();
        this.attributes = options.attributes ?? {};
        this.links = options.links ?? [];
    }

    setAttribute(key: string, value: unknown): this {
        if (!this.ended) this.attributes[key] = value;
        return this;
    }

    addEvent(name: string, attributes?: Record<string, unknown>): this {
        if (!this.ended) {
            this.events.push({
                name,
                time: new Date().toISOString(),
                attributes,
            });
        }
        return this;
    }

    setError(message: string): this {
        if (!this.ended) {
            this.status = 'ERROR';
            this.statusMessage = message;
        }
        return this;
    }

    end(): SpanData {
        if (this.ended) return this.toData();
        this.ended = true;
        this.endTime = new Date().toISOString();
        const startMs = new Date(this.startTime).getTime();
        const endMs = new Date(this.endTime).getTime();
        this.durationMs = endMs - startMs;
        return this.toData();
    }

    toData(): SpanData {
        return {
            spanId: this.spanId,
            traceId: this.traceId,
            parentSpanId: this.parentSpanId,
            name: this.name,
            kind: this.kind,
            serviceName: SERVICE_NAME,
            startTime: this.startTime,
            endTime: this.endTime,
            durationMs: this.durationMs,
            status: this.status,
            statusMessage: this.statusMessage,
            attributes: { ...this.attributes },
            events: [...this.events],
            links: [...this.links],
        };
    }
}

class BrowserSpanExporter {
    private buffer: SpanData[] = [];
    private timer: ReturnType<typeof setTimeout> | null = null;

    export(span: SpanData): void {
        this.buffer.push(span);

        if (this.buffer.length >= FLUSH_BATCH_SIZE) {
            this.flush();
        } else if (!this.timer) {
            this.timer = setTimeout(() => this.flush(), FLUSH_INTERVAL);
        }
    }

    flush(): void {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }

        if (this.buffer.length === 0) return;

        const spans = this.buffer.splice(0);

        // 使用 sendBeacon 兜底（页面卸载时）
        if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
            const blob = new Blob([JSON.stringify({ spans })], { type: 'application/json' });
            const ok = navigator.sendBeacon(`${API_URL}/traces/spans`, blob);
            if (ok) return;
        }

        // 正常情况用 fetch
        fetch(`${API_URL}/traces/spans`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ spans }),
        }).catch(() => {
            // 上报失败静默处理
        });
    }

    /** 页面卸载时调用 */
    forceFlush(): void {
        this.flush();
    }
}

export class BrowserTracer {
    private exporter = new BrowserSpanExporter();

    startSpan(
        name: string,
        options?: {
            traceId?: string;
            parentSpanId?: string;
            kind?: string;
            attributes?: Record<string, unknown>;
            links?: SpanLink[];
        },
    ): ActiveSpan {
        return new ActiveSpan({
            name,
            traceId: options?.traceId,
            parentSpanId: options?.parentSpanId,
            kind: options?.kind,
            attributes: options?.attributes,
            links: options?.links,
        });
    }

    endSpan(span: ActiveSpan): SpanData {
        const data = span.end();
        this.exporter.export(data);
        return data;
    }

    getTraceparent(traceId: string, spanId: string): string {
        // W3C traceparent format: version-traceId-spanId-flags
        return `00-${traceId}-${spanId}-01`;
    }

    forceFlush(): void {
        this.exporter.forceFlush();
    }
}

// 全局单例
let _tracer: BrowserTracer | null = null;

export function getTracer(): BrowserTracer {
    if (!_tracer) {
        _tracer = new BrowserTracer();
        // 页面卸载时 flush
        if (typeof window !== 'undefined') {
            window.addEventListener('beforeunload', () => _tracer?.forceFlush());
        }
    }
    return _tracer;
}

// ========== ID 生成 ==========

function generateTraceId(): string {
    return `${randomHex(8)}${randomHex(8)}${randomHex(8)}${randomHex(8)}`;
}

function generateSpanId(): string {
    return `${randomHex(8)}${randomHex(8)}`;
}

function randomHex(bytes: number): string {
    const array = new Uint8Array(bytes);
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
        crypto.getRandomValues(array);
    } else {
        for (let i = 0; i < bytes; i++) array[i] = Math.floor(Math.random() * 256);
    }
    return Array.from(array)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}
