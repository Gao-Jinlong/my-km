import type { Prisma, PrismaClient } from '@my-km/prisma';
import { ExportResultCode } from '@opentelemetry/core';
import type { ReadableSpan, SpanExporter } from '@opentelemetry/sdk-trace-base';

/**
 * PgSpanExporter — write OTel Spans to PostgreSQL via Prisma.
 *
 * PrismaClient is lazily resolved via a factory function to avoid
 * module-level side effects and NestJS DI ordering issues.
 */
export class PgSpanExporter implements SpanExporter {
    private prisma: PrismaClient | null = null;
    private isShutdown = false;

    constructor(private readonly getPrisma: () => PrismaClient) {}

    private ensurePrisma(): PrismaClient {
        if (!this.prisma) {
            this.prisma = this.getPrisma();
        }
        return this.prisma;
    }

    export(
        spans: ReadableSpan[],
        resultCallback: (result: { code: ExportResultCode; error?: Error }) => void,
    ): void {
        if (this.isShutdown) {
            resultCallback({ code: ExportResultCode.FAILED });
            return;
        }

        this.writeSpans(spans)
            .then(() => resultCallback({ code: ExportResultCode.SUCCESS }))
            .catch((err: Error) => {
                console.error('[PgSpanExporter] write failed:', err);
                resultCallback({ code: ExportResultCode.FAILED, error: err });
            });
    }

    async forceFlush(): Promise<void> {
        // BatchSpanProcessor handles flushing via export() synchronously
    }

    async shutdown(): Promise<void> {
        this.isShutdown = true;
    }

    private async writeSpans(spans: ReadableSpan[]): Promise<void> {
        const prisma = this.ensurePrisma();

        // Group spans by traceId
        const traceMap = new Map<string, ReadableSpan[]>();
        for (const span of spans) {
            const traceId = span.spanContext().traceId;
            const group = traceMap.get(traceId);
            if (group) {
                group.push(span);
            } else {
                traceMap.set(traceId, [span]);
            }
        }

        for (const [traceId, traceSpans] of traceMap) {
            // Find root span (no parent), fall back to first span
            const rootSpan = traceSpans.find(s => !s.parentSpanContext?.spanId) ?? traceSpans[0];
            const rootCtx = rootSpan.spanContext();

            // Upsert trace record
            await prisma.otelTrace.upsert({
                where: { traceId },
                create: {
                    traceId,
                    rootSpanId: rootCtx.spanId,
                    serviceName: getServiceName(rootSpan),
                    startTime: hrTimeToDate(rootSpan.startTime),
                    endTime: hrTimeToDate(rootSpan.endTime),
                    durationMs: durationMs(rootSpan),
                    status: mapStatus(rootSpan.status.code),
                    attributes: attrsToJson(rootSpan.resource.attributes),
                },
                update: {
                    endTime: hrTimeToDate(rootSpan.endTime),
                    durationMs: durationMs(rootSpan),
                    status: mapStatus(rootSpan.status.code),
                },
            });

            // Upsert each span
            for (const span of traceSpans) {
                const ctx = span.spanContext();

                const events = span.events.map(e => ({
                    name: e.name,
                    time: hrTimeToDate(e.time).toISOString(),
                    attributes: e.attributes ? attrsToJson(e.attributes) : undefined,
                }));

                const links = span.links.map(l => ({
                    traceId: l.context.traceId,
                    spanId: l.context.spanId,
                    attributes: l.attributes ? attrsToJson(l.attributes) : undefined,
                }));

                const eventsJson = events as unknown as Prisma.InputJsonValue;
                const linksJson = links as unknown as Prisma.InputJsonValue;

                await prisma.otelSpan.upsert({
                    where: { spanId: ctx.spanId },
                    create: {
                        spanId: ctx.spanId,
                        traceId,
                        parentSpanId: span.parentSpanContext?.spanId ?? undefined,
                        name: span.name,
                        kind: mapKind(span.kind),
                        serviceName: getServiceName(span),
                        startTime: hrTimeToDate(span.startTime),
                        endTime: hrTimeToDate(span.endTime),
                        durationMs: durationMs(span),
                        status: mapStatus(span.status.code),
                        statusMessage: span.status.message ?? undefined,
                        attributes: attrsToJson(span.attributes),
                        events: eventsJson,
                        links: linksJson,
                    },
                    update: {
                        endTime: hrTimeToDate(span.endTime),
                        durationMs: durationMs(span),
                        status: mapStatus(span.status.code),
                        statusMessage: span.status.message ?? undefined,
                        attributes: attrsToJson(span.attributes),
                        events: eventsJson,
                    },
                });
            }
        }
    }
}

// ========== Helpers ==========

function hrTimeToDate(hrTime: [number, number]): Date {
    const ms = hrTime[0] * 1000 + hrTime[1] / 1_000_000;
    return new Date(ms);
}

function durationMs(span: ReadableSpan): number {
    return span.duration[0] * 1000 + Math.round(span.duration[1] / 1_000_000);
}

function getServiceName(span: ReadableSpan): string {
    return (span.resource.attributes['service.name'] as string | undefined) ?? 'unknown';
}

function mapStatus(code: number): string {
    switch (code) {
        case 0:
            return 'UNSET';
        case 1:
            return 'OK';
        case 2:
            return 'ERROR';
        default:
            return 'UNSET';
    }
}

function mapKind(kind: number): string {
    const kinds = ['INTERNAL', 'SERVER', 'CLIENT', 'PRODUCER', 'CONSUMER'];
    return kinds[kind] ?? 'INTERNAL';
}

function attrsToJson(attrs: Record<string, unknown>): Prisma.InputJsonValue {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(attrs)) {
        result[k] = v;
    }
    return result as Prisma.InputJsonValue;
}
