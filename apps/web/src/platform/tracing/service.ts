import { ServiceBase } from '@/platform/base/service-base';
import { Service } from '@/platform/di';
import type { ITracingService, SpanData, SpanEvent, SpanLink, SpanOptions } from './types';

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

    constructor(options: { name: string } & SpanOptions) {
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

        if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
            const blob = new Blob([JSON.stringify({ spans })], { type: 'application/json' });
            const ok = navigator.sendBeacon(`${API_URL}/traces/spans`, blob);
            if (ok) return;
        }

        fetch(`${API_URL}/traces/spans`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ spans }),
        }).catch(() => undefined);
    }

    forceFlush(): void {
        this.flush();
    }

    dispose(): void {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
    }
}

@Service({ singleton: true })
export class TracingService extends ServiceBase implements ITracingService {
    private readonly exporter = new BrowserSpanExporter();
    private activeTraceparent: string | null = null;
    private readonly handleBeforeUnload = () => this.forceFlush();

    constructor() {
        super();
        if (typeof window !== 'undefined') {
            window.addEventListener('beforeunload', this.handleBeforeUnload);
        }
    }

    startSpan(name: string, options?: SpanOptions): ActiveSpan {
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
        return `00-${traceId}-${spanId}-01`;
    }

    setActiveTraceparent(traceparent: string | null): void {
        this.activeTraceparent = traceparent;
    }

    getActiveTraceparent(): string | null {
        return this.activeTraceparent;
    }

    forceFlush(): void {
        this.exporter.forceFlush();
    }

    override dispose(): void {
        if (typeof window !== 'undefined') {
            window.removeEventListener('beforeunload', this.handleBeforeUnload);
        }
        this.exporter.dispose();
        super.dispose();
    }
}

function generateTraceId(): string {
    return randomHex(16);
}

function generateSpanId(): string {
    return randomHex(8);
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
