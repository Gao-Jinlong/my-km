import { Prisma } from '@my-km/prisma';
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import type { IngestSpansDto } from './tracing.dto';

@Injectable()
export class TracingService {
    private readonly logger = new Logger(TracingService.name);

    constructor(private readonly prisma: PrismaService) {}

    async queryTraces(dto: {
        threadId?: string;
        status?: string;
        from?: string;
        to?: string;
        page: number;
        pageSize: number;
    }) {
        const where: Record<string, unknown> = {};

        if (dto.status) {
            where.status = dto.status;
        }
        if (dto.from || dto.to) {
            where.startTime = {};
            if (dto.from) (where.startTime as Record<string, unknown>).gte = new Date(dto.from);
            if (dto.to) (where.startTime as Record<string, unknown>).lte = new Date(dto.to);
        }

        const [traces, total] = await Promise.all([
            this.prisma.otelTrace.findMany({
                where,
                orderBy: { startTime: 'desc' },
                skip: (dto.page - 1) * dto.pageSize,
                take: dto.pageSize,
                include: { _count: { select: { spans: true } } },
            }),
            this.prisma.otelTrace.count({ where }),
        ]);

        return { traces, total, page: dto.page, pageSize: dto.pageSize };
    }

    async getTrace(traceId: string) {
        return this.prisma.otelTrace.findUnique({
            where: { traceId },
            include: { spans: { orderBy: { startTime: 'asc' } } },
        });
    }

    async getStats(from?: string, to?: string) {
        const where: Record<string, unknown> = {};
        if (from || to) {
            where.startTime = {};
            if (from) (where.startTime as Record<string, unknown>).gte = new Date(from);
            if (to) (where.startTime as Record<string, unknown>).lte = new Date(to);
        }

        const [total, errorResult] = await Promise.all([
            this.prisma.otelTrace.count({ where }),
            this.prisma.otelTrace.aggregate({
                where: { ...where, status: 'ERROR' },
                _count: true,
            }),
        ]);

        return {
            total,
            errorCount: errorResult._count,
        };
    }

    /**
     * 接收前端上报的 Span 数据
     */
    async ingestSpans(spans: NonNullable<IngestSpansDto['spans']>) {
        for (const span of spans) {
            // Upsert trace
            await this.prisma.otelTrace.upsert({
                where: { traceId: span.traceId },
                create: {
                    traceId: span.traceId,
                    rootSpanId: span.parentSpanId ?? span.spanId,
                    serviceName: span.serviceName,
                    startTime: new Date(span.startTime),
                    endTime: span.endTime ? new Date(span.endTime) : undefined,
                    durationMs: span.durationMs,
                    status: span.status ?? 'OK',
                    attributes: {},
                },
                update: {
                    endTime: span.endTime ? new Date(span.endTime) : undefined,
                    durationMs: span.durationMs,
                },
            });

            // Upsert span
            await this.prisma.otelSpan.upsert({
                where: { spanId: span.spanId },
                create: {
                    spanId: span.spanId,
                    traceId: span.traceId,
                    parentSpanId: span.parentSpanId,
                    name: span.name,
                    kind: span.kind,
                    serviceName: span.serviceName,
                    startTime: new Date(span.startTime),
                    endTime: span.endTime ? new Date(span.endTime) : undefined,
                    durationMs: span.durationMs,
                    status: span.status ?? 'OK',
                    statusMessage: span.statusMessage,
                    attributes: (span.attributes ?? {}) as unknown as Prisma.InputJsonValue,
                    events: (span.events ?? []) as unknown as Prisma.InputJsonValue,
                    links: (span.links ?? []) as unknown as Prisma.InputJsonValue,
                },
                update: {
                    endTime: span.endTime ? new Date(span.endTime) : undefined,
                    durationMs: span.durationMs,
                    status: span.status ?? 'OK',
                    attributes: (span.attributes ?? {}) as unknown as Prisma.InputJsonValue,
                    events: (span.events ?? []) as unknown as Prisma.InputJsonValue,
                },
            });
        }
    }

    /**
     * 定时清理过期 trace 数据
     */
    @Cron('0 3 * * *')
    async cleanupTraces() {
        const retentionDays = Number(process.env.TRACE_RETENTION_DAYS) || 30;
        const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

        const deletedSpans = await this.prisma.otelSpan.deleteMany({
            where: { trace: { startTime: { lt: cutoff } } },
        });
        const deletedTraces = await this.prisma.otelTrace.deleteMany({
            where: { startTime: { lt: cutoff } },
        });

        this.logger.log(
            `Cleaned up traces older than ${retentionDays} days: ${deletedTraces.count} traces, ${deletedSpans.count} spans`,
        );
    }
}
