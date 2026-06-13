/**
 * OTel SDK 初始化 — 必须在 NestJS bootstrap 之前调用
 *
 * 注册：
 * - 自动埋点: http, redis
 * - SpanProcessor: BatchSpanProcessor(PgSpanExporter)
 * - Context Propagator: W3cTraceContext + Baggage
 * - Resource: service.name = "my-km-server"
 */

import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { RedisInstrumentation } from '@opentelemetry/instrumentation-redis';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { PgSpanExporter } from './exporters/pg-span.exporter';

let sdk: NodeSDK | undefined;

export function shouldIgnoreIncomingTracingRequest(url?: string): boolean {
    if (!url) return false;
    const path = url.split('?')[0];
    return path === '/api/health' || path === '/favicon.ico' || path.startsWith('/api/traces');
}

/**
 * 初始化 OTel SDK
 *
 * @param getPrisma - 延迟获取 PrismaClient（避免循环依赖）
 */
export function initTracing(getPrisma: () => import('@my-km/prisma').PrismaClient): void {
    // 如果未启用追踪，跳过
    if (process.env.OTEL_TRACING_ENABLED === 'false') {
        console.log('[Tracing] Disabled by OTEL_TRACING_ENABLED=false');
        return;
    }

    const exporter = new PgSpanExporter(getPrisma);

    sdk = new NodeSDK({
        serviceName: 'my-km-server',
        spanProcessor: new BatchSpanProcessor(exporter, {
            maxExportBatchSize: 50,
            scheduledDelayMillis: 2000,
        }),
        instrumentations: [
            new HttpInstrumentation({
                ignoreIncomingRequestHook: req => shouldIgnoreIncomingTracingRequest(req.url),
            }),
            new RedisInstrumentation(),
        ],
    });

    sdk.start();

    const shutdown = async () => {
        await sdk?.shutdown();
    };
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);

    console.log('[Tracing] OTel SDK initialized');
}

/**
 * 获取 OTel Tracer
 */
export function getTracer(name = 'my-km-server') {
    const { trace } = require('@opentelemetry/api') as typeof import('@opentelemetry/api');
    return trace.getTracer(name);
}
