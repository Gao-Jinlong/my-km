import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import 'reflect-metadata';
import { TracingService } from '../service';

describe('TracingService', () => {
    let service: TracingService;

    beforeEach(() => {
        vi.useFakeTimers();
        service = new TracingService();
    });

    afterEach(() => {
        service.dispose();
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('creates spans with ids and serializes ended span data', () => {
        const span = service.startSpan('frontend.test', {
            attributes: { feature: 'tracing' },
        });

        span.addEvent('started', { ok: true });
        span.setAttribute('phase', 'unit');
        const data = service.endSpan(span);

        expect(data.name).toBe('frontend.test');
        expect(data.serviceName).toBe('my-km-web');
        expect(data.traceId).toMatch(/^[a-f0-9]{32}$/);
        expect(data.spanId).toMatch(/^[a-f0-9]{16}$/);
        expect(data.attributes).toEqual({ feature: 'tracing', phase: 'unit' });
        expect(data.events).toHaveLength(1);
        expect(data.endTime).toBeDefined();
        expect(data.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('creates child spans with parent context', () => {
        const parent = service.startSpan('parent');
        const child = service.startSpan('child', {
            traceId: parent.traceId,
            parentSpanId: parent.spanId,
        });

        expect(child.traceId).toBe(parent.traceId);
        expect(child.parentSpanId).toBe(parent.spanId);
    });

    it('formats W3C traceparent values', () => {
        const traceId = '0123456789abcdef0123456789abcdef';
        const spanId = '0123456789abcdef';

        expect(service.getTraceparent(traceId, spanId)).toBe(
            '00-0123456789abcdef0123456789abcdef-0123456789abcdef-01',
        );
    });

    it('creates immutable TraceContext snapshot from a span', () => {
        const span = service.startSpan('frontend.test');
        const ctx = service.toTraceContext(span);

        expect(ctx.traceId).toBe(span.traceId);
        expect(ctx.spanId).toBe(span.spanId);
        expect(ctx.traceparent).toBe(`00-${span.traceId}-${span.spanId}-01`);
    });

    it('stores and clears active traceparent', () => {
        service.setActiveTraceparent('00-0123456789abcdef0123456789abcdef-0123456789abcdef-01');
        expect(service.getActiveTraceparent()).toBe(
            '00-0123456789abcdef0123456789abcdef-0123456789abcdef-01',
        );

        service.setActiveTraceparent(null);
        expect(service.getActiveTraceparent()).toBeNull();
    });

    it('flushes ended spans with fetch when sendBeacon is unavailable', async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
        vi.stubGlobal('fetch', fetchMock);
        vi.stubGlobal('navigator', {});

        const span = service.startSpan('frontend.flush');
        service.endSpan(span);
        service.forceFlush();

        expect(fetchMock).toHaveBeenCalledWith(
            'http://localhost:3000/api/traces/spans',
            expect.objectContaining({
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
            }),
        );
        const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
        expect(body.spans).toHaveLength(1);
        expect(body.spans[0].name).toBe('frontend.flush');
    });

    it('registers beforeunload flush and removes it on dispose', () => {
        const addSpy = vi.spyOn(window, 'addEventListener');
        const removeSpy = vi.spyOn(window, 'removeEventListener');
        const lifecycleService = new TracingService();

        expect(addSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function));

        lifecycleService.dispose();

        expect(removeSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function));
    });
});
