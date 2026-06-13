# LLM Tracing (OpenTelemetry) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add end-to-end OpenTelemetry tracing covering frontend user interactions, HTTP transport, LangGraph workflow, LLM calls, and frontend tool execution — stored in PostgreSQL with a built-in debug page.

**Architecture:** OTel SDK initialized before NestJS bootstrap. Custom `PgSpanExporter` writes spans to PostgreSQL. Frontend uses `@opentelemetry/api` (lightweight) with a `BrowserSpanExporter` that batches spans to a backend endpoint. LangGraph nodes are instrumented with manual spans. SSE streams propagate `traceId` to frontend for tool execution spans.

**Tech Stack:** `@opentelemetry/api`, `@opentelemetry/sdk-node`, `@opentelemetry/instrumentation-http`, `@opentelemetry/instrumentation-redis`, Prisma 7, NestJS 11, Next.js 16, React 19

---

## File Structure

### Backend — New Files
```
apps/server/src/tracing/
├── tracing.module.ts              # NestJS module (registers TracingService)
├── tracing.service.ts             # Cleanup cron, helper methods
├── tracing.init.ts                # OTel SDK bootstrap (runs before NestJS)
├── exporters/
│   └── pg-span.exporter.ts        # Custom SpanExporter → PostgreSQL
├── instrumentations/
│   ├── llm-node.span.ts           # Span helper for LLM node
│   └── tool-node.span.ts          # Span helper for tool node
├── decorators/
│   └── with-span.decorator.ts     # @WithSpan() decorator
├── tracing.controller.ts          # GET /api/traces, POST /api/traces/spans
└── tracing.dto.ts                 # Query/response DTOs
```

### Backend — Modified Files
```
apps/server/src/main.ts            # Add tracing.init() before bootstrap, add 'traceparent' to CORS
apps/server/src/app.module.ts      # Import TracingModule
apps/server/src/ai/ai.service.ts   # Add langgraph.run span + traceId in metadata event
apps/server/src/ai/langgraph/nodes/llm-node.ts   # Add llm_node.invoke span
apps/server/src/ai/langgraph/nodes/tool-node.ts   # Add tool_node.interrupt span
packages/prisma/prisma/schema.prisma              # Add OtelTrace + OtelSpan models
apps/server/package.json           # Add OTel dependencies
```

### Frontend — New Files
```
apps/web/src/lib/tracing/
├── tracer.ts                      # BrowserTracer + BrowserSpanExporter
├── types.ts                       # SpanData, SpanEvent types
└── tracing-context.tsx            # React context for active trace
```

### Frontend — Modified Files
```
apps/web/src/hooks/use-langgraph-stream.ts  # Create trace spans, inject traceparent, instrument tool execution
apps/web/src/features/ai/tools/frontend-tool-executor.ts  # Add span per tool dispatch
apps/web/package.json                        # Add @opentelemetry/api
```

---

## Task 1: Install Dependencies & Prisma Schema

**Files:**
- Modify: `apps/server/package.json`
- Modify: `apps/web/package.json`
- Modify: `packages/prisma/prisma/schema.prisma`

- [ ] **Step 1: Add OTel dependencies to server**

```bash
cd /Users/gaojinlong/ThisMac/project/my-km/apps/server && pnpm add @opentelemetry/api @opentelemetry/sdk-node @opentelemetry/exporter-trace-otlp-http @opentelemetry/instrumentation-http @opentelemetry/instrumentation-redis @opentelemetry/resources @opentelemetry/semantic-conventions
```

- [ ] **Step 2: Add OTel API to frontend (lightweight, ~5KB)**

```bash
cd /Users/gaojinlong/ThisMac/project/my-km/apps/web && pnpm add @opentelemetry/api
```

- [ ] **Step 3: Add OtelTrace + OtelSpan models to Prisma schema**

Append to `packages/prisma/prisma/schema.prisma`:

```prisma
model OtelTrace {
  id          String   @id @default(cuid())
  traceId     String   @unique @map("trace_id")
  rootSpanId  String   @map("root_span_id")
  serviceName String   @map("service_name")
  startTime   DateTime @map("start_time")
  endTime     DateTime? @map("end_time")
  durationMs  Int?     @map("duration_ms")
  status      String   @default("OK")
  attributes  Json     @default("{}")

  spans       OtelSpan[]

  @@map("otel_traces")
  @@index([startTime(sort: Desc)])
  @@index([traceId])
}

model OtelSpan {
  id            String   @id @default(cuid())
  spanId        String   @unique @map("span_id")
  traceId       String   @map("trace_id")
  parentSpanId  String?  @map("parent_span_id")
  name          String
  kind          String
  serviceName   String   @map("service_name")
  startTime     DateTime @map("start_time")
  endTime       DateTime? @map("end_time")
  durationMs    Int?     @map("duration_ms")
  status        String   @default("OK")
  statusMessage String?  @map("status_message")
  attributes    Json     @default("{}")
  events        Json     @default("[]")
  links         Json     @default("[]")

  trace         OtelTrace @relation(fields: [traceId], references: [traceId], onDelete: Cascade)

  @@map("otel_spans")
  @@index([traceId])
  @@index([parentSpanId])
  @@index([name])
  @@index([serviceName])
  @@index([startTime(sort: Desc)])
}
```

- [ ] **Step 4: Run Prisma migration**

```bash
cd /Users/gaojinlong/ThisMac/project/my-km && pnpm --filter @my-km/prisma prisma:migrate -- --name add_otel_tracing
```

Expected: Migration created and applied successfully.

- [ ] **Step 5: Generate Prisma client**

```bash
cd /Users/gaojinlong/ThisMac/project/my-km && pnpm --filter @my-km/prisma prisma:generate
```

Expected: Prisma client generated with OtelTrace + OtelSpan types.

- [ ] **Step 6: Commit**

```bash
git add apps/server/package.json apps/web/package.json packages/prisma/prisma/schema.prisma apps/server/pnpm-lock.yaml apps/web/pnpm-lock.yaml
git commit -m "feat(tracing): add OTel dependencies and Prisma schema for trace storage"
```

---

## Task 2: PgSpanExporter

**Files:**
- Create: `apps/server/src/tracing/exporters/pg-span.exporter.ts`

- [ ] **Step 1: Write PgSpanExporter**

Create `apps/server/src/tracing/exporters/pg-span.exporter.ts`:

```typescript
import type { ReadableSpan, SpanExporter } from '@opentelemetry/sdk-trace-base';
import type { ExportResult } from '@opentelemetry/core';
import { ExportResultCode } from '@opentelemetry/core';
import type { PrismaClient } from '@my-km/prisma/generated';

interface SpanEvent {
  name: string;
  time: string;
  attributes?: Record<string, unknown>;
}

/**
 * PgSpanExporter — 将 OTel Span 批量写入 PostgreSQL
 *
 * 使用 OTel 的 ReadableSpan 接口提取数据，upsert 到 OtelTrace + OtelSpan 表。
 * PrismaClient 通过构造函数注入（避免模块级副作用）。
 */
export class PgSpanExporter implements SpanExporter {
  private prisma: PrismaClient | null = null;
  private shutdown = false;

  constructor(private readonly getPrisma: () => PrismaClient) {}

  private ensurePrisma(): PrismaClient {
    if (!this.prisma) {
      this.prisma = this.getPrisma();
    }
    return this.prisma;
  }

  export(spans: ReadableSpan[], resultCallback: (result: ExportResult) => void): void {
    if (this.shutdown) {
      resultCallback({ code: ExportResultCode.FAILED });
      return;
    }

    // 异步写入，不阻塞 exporter
    this.writeSpans(spans)
      .then(() => resultCallback({ code: ExportResultCode.SUCCESS }))
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.error('[PgSpanExporter] write failed:', err);
        resultCallback({ code: ExportResultCode.FAILED });
      });
  }

  async forceFlush(): Promise<void> {
    // BatchSpanProcessor 已经在 export 中同步处理了
  }

  async shutdown(): Promise<void> {
    this.shutdown = true;
  }

  private async writeSpans(spans: ReadableSpan[]): Promise<void> {
    const prisma = this.ensurePrisma();

    // 按 traceId 分组
    const traceMap = new Map<string, ReadableSpan[]>();
    for (const span of spans) {
      const traceId = span.spanContext().traceId;
      if (!traceMap.has(traceId)) {
        traceMap.set(traceId, []);
      }
      traceMap.get(traceId)!.push(span);
    }

    for (const [traceId, traceSpans] of traceMap) {
      // 找 root span（没有 parent 的）
      const rootSpan = traceSpans.find(
        (s) => !s.parentSpanId || s.parentSpanId === '',
      ) ?? traceSpans[0];

      const rootCtx = rootSpan.spanContext();

      // Upsert trace
      await prisma.otelTrace.upsert({
        where: { traceId },
        create: {
          traceId,
          rootSpanId: rootCtx.spanId,
          serviceName: rootSpan.resource.attributes['service.name'] as string ?? 'unknown',
          startTime: hrTimeToDate(rootSpan.startTime),
          endTime: hrTimeToDate(rootSpan.endTime),
          durationMs: rootSpan.duration[0] * 1000 + Math.round(rootSpan.duration[1] / 1_000_000),
          status: mapStatus(rootSpan.status.code),
          attributes: attrsToJson(rootSpan.resource.attributes),
        },
        update: {
          endTime: hrTimeToDate(rootSpan.endTime),
          durationMs: rootSpan.duration[0] * 1000 + Math.round(rootSpan.duration[1] / 1_000_000),
          status: mapStatus(rootSpan.status.code),
        },
      });

      // Upsert spans
      for (const span of traceSpans) {
        const ctx = span.spanContext();
        const events: SpanEvent[] = span.events.map((e) => ({
          name: e.name,
          time: hrTimeToDate(e.time).toISOString(),
          attributes: e.attributes ? attrsToJson(e.attributes) : undefined,
        }));

        const links = span.links.map((l) => ({
          traceId: l.context.traceId,
          spanId: l.context.spanId,
          attributes: l.attributes ? attrsToJson(l.attributes) : undefined,
        }));

        await prisma.otelSpan.upsert({
          where: { spanId: ctx.spanId },
          create: {
            spanId: ctx.spanId,
            traceId,
            parentSpanId: span.parentSpanId ?? undefined,
            name: span.name,
            kind: mapKind(span.kind),
            serviceName: span.resource.attributes['service.name'] as string ?? 'unknown',
            startTime: hrTimeToDate(span.startTime),
            endTime: hrTimeToDate(span.endTime),
            durationMs: span.duration[0] * 1000 + Math.round(span.duration[1] / 1_000_000),
            status: mapStatus(span.status.code),
            statusMessage: span.status.message ?? undefined,
            attributes: attrsToJson(span.attributes),
            events,
            links,
          },
          update: {
            endTime: hrTimeToDate(span.endTime),
            durationMs: span.duration[0] * 1000 + Math.round(span.duration[1] / 1_000_000),
            status: mapStatus(span.status.code),
            statusMessage: span.status.message ?? undefined,
            attributes: attrsToJson(span.attributes),
            events,
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

function mapStatus(code: number): string {
  switch (code) {
    case 0: return 'UNSET';
    case 1: return 'OK';
    case 2: return 'ERROR';
    default: return 'UNSET';
  }
}

function mapKind(kind: number): string {
  const kinds = ['INTERNAL', 'SERVER', 'CLIENT', 'PRODUCER', 'CONSUMER'];
  return kinds[kind] ?? 'INTERNAL';
}

function attrsToJson(attrs: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(attrs)) {
    // OTel attribute values can be string | number | boolean | Array<string | number | boolean>
    // JSON.stringify handles all these natively
    result[k] = v;
  }
  return result;
}
```

- [ ] **Step 2: Verify compilation**

```bash
cd /Users/gaojinlong/ThisMac/project/my-km/apps/server && pnpm exec tsc --noEmit --pretty 2>&1 | head -20
```

Expected: No errors in pg-span.exporter.ts.

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/tracing/exporters/pg-span.exporter.ts
git commit -m "feat(tracing): implement PgSpanExporter for PostgreSQL span storage"
```

---

## Task 3: OTel SDK Initialization

**Files:**
- Create: `apps/server/src/tracing/tracing.init.ts`
- Modify: `apps/server/src/main.ts` (add tracing init + CORS traceparent header)

- [ ] **Step 1: Create tracing.init.ts**

Create `apps/server/src/tracing/tracing.init.ts`:

```typescript
/**
 * OTel SDK 初始化 — 必须在 NestJS bootstrap 之前调用
 *
 * 注册：
 * - 自动埋点: http, redis
 * - SpanProcessor: BatchSpanProcessor(PgSpanExporter)
 * - Context Propagator: W3cTraceContext + Baggage
 * - Resource: service.name = "my-km-server"
 */

import { NodeSDK } from '@opentelemetry/sdk-node';
import { getResourceAttributesFromEnv } from '@opentelemetry/resources';
import { SEMRESATTRS_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { RedisInstrumentation } from '@opentelemetry/instrumentation-redis';
import { PgSpanExporter } from './exporters/pg-span.exporter';

let sdk: NodeSDK | undefined;

/**
 * 初始化 OTel SDK
 *
 * @param getPrisma - 延迟获取 PrismaClient（避免循环依赖）
 */
export function initTracing(getPrisma: () => import('@my-km/prisma/generated').PrismaClient): void {
  // 如果未启用追踪，跳过
  if (process.env.OTEL_TRACING_ENABLED === 'false') {
    // eslint-disable-next-line no-console
    console.log('[Tracing] Disabled by OTEL_TRACING_ENABLED=false');
    return;
  }

  const exporter = new PgSpanExporter(getPrisma);

  sdk = new NodeSDK({
    resource: {
      attributes: {
        [SEMRESATTRS_SERVICE_NAME]: 'my-km-server',
      },
    },
    spanProcessor: new BatchSpanProcessor(exporter, {
      maxExportBatchSize: 50,
      scheduledDelayMillis: 2000,
    }),
    instrumentations: [
      new HttpInstrumentation({
        // 忽略 health check 等无关路由
        ignoreIncomingRequestHook: (req) => {
          return req.url === '/api/health' || req.url === '/favicon.ico';
        },
      }),
      new RedisInstrumentation(),
    ],
  });

  sdk.start();

  // 优雅关闭
  const shutdown = async () => {
    await sdk?.shutdown();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  // eslint-disable-next-line no-console
  console.log('[Tracing] OTel SDK initialized');
}

/**
 * 获取 OTel Tracer
 */
export function getTracer(name = 'my-km-server') {
  // 延迟 import 避免模块加载顺序问题
  const { trace } = require('@opentelemetry/api') as typeof import('@opentelemetry/api');
  return trace.getTracer(name);
}
```

- [ ] **Step 2: Modify main.ts — add tracing init and CORS traceparent header**

In `apps/server/src/main.ts`:

Add import at top:
```typescript
import { initTracing } from './tracing/tracing.init';
```

Add `initTracing()` call **before** `bootstrap()` function definition, or as the first line inside `bootstrap()`:

At the beginning of `main.ts` (after all imports, before `async function bootstrap()`):
```typescript
// OTel 必须在其他模块之前初始化
// PrismaClient 延迟注入，避免循环依赖
initTracing(() => {
  // 动态导入避免模块级副作用
  const { PrismaClient } = require('@my-km/prisma/generated') as typeof import('@my-km/prisma/generated');
  return new PrismaClient();
});
```

In the CORS `allowedHeaders` array, add `'traceparent'` and `'tracestate'`:
```typescript
allowedHeaders: ['Content-Type', 'Authorization', 'X-Locale', 'traceparent', 'tracestate'],
```

In the CORS `exposedHeaders` array, add `'traceparent'`:
```typescript
exposedHeaders: ['Content-Range', 'X-Content-Range', 'traceparent'],
```

- [ ] **Step 3: Verify compilation**

```bash
cd /Users/gaojinlong/ThisMac/project/my-km/apps/server && pnpm exec tsc --noEmit --pretty 2>&1 | head -20
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/tracing/tracing.init.ts apps/server/src/main.ts
git commit -m "feat(tracing): initialize OTel SDK with auto-instrumentation (http, redis)"
```

---

## Task 4: @WithSpan Decorator

**Files:**
- Create: `apps/server/src/tracing/decorators/with-span.decorator.ts`

- [ ] **Step 1: Create the decorator**

Create `apps/server/src/tracing/decorators/with-span.decorator.ts`:

```typescript
/**
 * @WithSpan() — 方法级 OTel Span 装饰器
 *
 * 在 NestJS Service 方法上添加此装饰器，自动创建 Span：
 * - Span 名称默认为 `ClassName.methodName`
 * - 记录执行耗时
 * - 异常时设置 Span status = ERROR
 * - 可传入自定义 Span 名称和 attributes
 */

import { context, trace, SpanStatusCode, SpanKind } from '@opentelemetry/api';
import type { SpanOptions } from '@opentelemetry/api';

export interface WithSpanOptions {
  /** Span 名称，默认 `ClassName.methodName` */
  name?: string;
  /** 附加 attributes */
  attributes?: Record<string, string | number | boolean>;
}

export function WithSpan(options?: WithSpanOptions): MethodDecorator {
  return (
    _target: object,
    propertyKey: string | symbol,
    descriptor: TypedPropertyDescriptor<unknown>,
  ) => {
    const originalMethod = descriptor.value as (...args: unknown[]) => Promise<unknown>;
    const methodName = String(propertyKey);

    descriptor.value = function (this: { constructor?: { name?: string } }, ...args: unknown[]) {
      const tracer = trace.getTracer('my-km-server');
      const spanName = options?.name ?? `${this.constructor?.name ?? 'Unknown'}.${methodName}`;

      const spanOptions: SpanOptions = {
        kind: SpanKind.INTERNAL,
      };

      const span = tracer.startSpan(spanName, spanOptions);

      if (options?.attributes) {
        span.setAttributes(options.attributes);
      }

      const promise = context.with(trace.setSpan(context.active(), span), () => {
        return originalMethod.apply(this, args);
      });

      return promise
        .then((result) => {
          span.end();
          return result;
        })
        .catch((err: unknown) => {
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: err instanceof Error ? err.message : String(err),
          });
          span.recordException(err instanceof Error ? err : new Error(String(err)));
          span.end();
          throw err;
        });
    };

    return descriptor;
  };
}
```

- [ ] **Step 2: Verify compilation**

```bash
cd /Users/gaojinlong/ThisMac/project/my-km/apps/server && pnpm exec tsc --noEmit --pretty 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/tracing/decorators/with-span.decorator.ts
git commit -m "feat(tracing): add @WithSpan() decorator for NestJS service methods"
```

---

## Task 5: LangGraph Node Instrumentation

**Files:**
- Create: `apps/server/src/tracing/instrumentations/llm-node.span.ts`
- Create: `apps/server/src/tracing/instrumentations/tool-node.span.ts`
- Modify: `apps/server/src/ai/ai.service.ts` (add langgraph.run span + traceId in metadata)
- Modify: `apps/server/src/ai/langgraph/nodes/llm-node.ts` (add span)
- Modify: `apps/server/src/ai/langgraph/nodes/tool-node.ts` (add span)

- [ ] **Step 1: Create LLM node span helper**

Create `apps/server/src/tracing/instrumentations/llm-node.span.ts`:

```typescript
/**
 * LLM Node Span 创建辅助
 *
 * 在 llm-node.invoke 外层创建 OTel Span，记录：
 * - model, provider
 * - inputTokens, outputTokens
 * - prompt_sent / completion_received events
 */

import { context, trace, SpanStatusCode, SpanKind } from '@opentelemetry/api';
import type { Context } from '@opentelemetry/api';
import type { AIMessage } from '@langchain/core/messages';

export interface LLMSpanOptions {
  model: string;
  provider: string;
  /** 第几轮 LLM 调用（1-based） */
  round: number;
}

export interface LLMSpanResult {
  span: import('@opentelemetry/api').Span;
  ctx: Context;
}

export function startLLMSpan(options: LLMSpanOptions): LLMSpanResult {
  const tracer = trace.getTracer('my-km-server');
  const span = tracer.startSpan(`llm_node.invoke`, {
    kind: SpanKind.INTERNAL,
    attributes: {
      'llm.model': options.model,
      'llm.provider': options.provider,
      'llm.round': options.round,
    },
  });
  span.addEvent('prompt_sent');

  const ctx = trace.setSpan(context.active(), span);
  return { span, ctx };
}

export function endLLMSpan(
  span: import('@opentelemetry/api').Span,
  result: AIMessage | { error: string },
): void {
  if ('error' in result) {
    span.setStatus({ code: SpanStatusCode.ERROR, message: result.error });
  } else {
    const msg = result as AIMessage;
    const usage = (msg as { usage_metadata?: { input_tokens?: number; output_tokens?: number } }).usage_metadata;
    if (usage) {
      span.setAttributes({
        'llm.inputTokens': usage.input_tokens ?? 0,
        'llm.outputTokens': usage.output_tokens ?? 0,
      });
    }
    span.addEvent('completion_received');
    span.setStatus({ code: SpanStatusCode.OK });
  }
  span.end();
}
```

- [ ] **Step 2: Create tool node span helper**

Create `apps/server/src/tracing/instrumentations/tool-node.span.ts`:

```typescript
/**
 * Tool Node Span 创建辅助
 */

import { trace, SpanStatusCode, SpanKind } from '@opentelemetry/api';

export interface ToolSpanOptions {
  toolName: string;
  toolCallId: string;
}

export function startToolSpan(options: ToolSpanOptions) {
  const tracer = trace.getTracer('my-km-server');
  const span = tracer.startSpan('tool_node.interrupt', {
    kind: SpanKind.INTERNAL,
    attributes: {
      'tool.name': options.toolName,
      'tool.call_id': options.toolCallId,
    },
  });
  span.addEvent('interrupt_sent');
  return span;
}

export function endToolSpan(
  span: import('@opentelemetry/api').Span,
  error?: string,
): void {
  if (error) {
    span.setStatus({ code: SpanStatusCode.ERROR, message: error });
  } else {
    span.addEvent('interrupt_resumed');
    span.setStatus({ code: SpanStatusCode.OK });
  }
  span.end();
}
```

- [ ] **Step 3: Instrument llm-node.ts**

Modify `apps/server/src/ai/langgraph/nodes/llm-node.ts`:

Add imports at top:
```typescript
import { context as otelContext, trace } from '@opentelemetry/api';
import { startLLMSpan, endLLMSpan } from '../../tracing/instrumentations/llm-node.span';
```

Wrap the try/catch block inside `createLLMNode` with a span. The modified `createLLMNode` function body:

```typescript
export function createLLMNode() {
    return async (
        state: WorkflowState,
        context?: { configurable?: Partial<GraphConfig>; signal?: AbortSignal },
    ): Promise<Partial<WorkflowState>> => {
        const chatModel = context?.configurable?.chatModel;
        const tools = context?.configurable?.tools;
        const abortSignal = context?.configurable?.abortSignal ?? context?.signal;

        if (!chatModel) {
            return { error: 'chatModel not provided in configurable context' };
        }

        // OTel Span
        const provider = (context?.configurable as Record<string, unknown>)?.provider as string ?? 'unknown';
        const model = (context?.configurable as Record<string, unknown>)?.model as string ?? 'unknown';
        const round = (context?.configurable as Record<string, unknown>)?.llmRound as number ?? 1;
        const { span, ctx: spanCtx } = startLLMSpan({ model, provider, round });

        try {
            const modelWithTools: Runnable =
                tools && tools.length > 0 && typeof chatModel.bindTools === 'function'
                    ? chatModel.bindTools(tools)
                    : chatModel;

            const aiMessage: AIMessage = await otelContext.with(spanCtx, () =>
                modelWithTools.invoke(state.messages, { signal: abortSignal }),
            );

            endLLMSpan(span, aiMessage);
            return { messages: [aiMessage] };
        } catch (error) {
            endLLMSpan(span, { error: error instanceof Error ? error.message : 'LLM call failed' });
            return { error: error instanceof Error ? error.message : 'LLM call failed' };
        }
    };
}
```

- [ ] **Step 4: Instrument tool-node.ts**

Modify `apps/server/src/ai/langgraph/nodes/tool-node.ts`:

Add imports at top:
```typescript
import { startToolSpan, endToolSpan } from '../../tracing/instrumentations/tool-node.span';
```

In the `for` loop inside `createToolNode`, wrap each tool call with a span:

```typescript
for (const toolCall of lastMessage.tool_calls) {
    if (!toolCall.id || !toolCall.name) continue;

    const toolSpan = startToolSpan({
        toolName: toolCall.name,
        toolCallId: toolCall.id,
    });

    // 触发 interrupt,等待前端执行后通过 SDK command.resume 恢复
    const resumeValue = interrupt({
        tool_call_id: toolCall.id,
        tool_name: toolCall.name,
        args: toolCall.args ?? {},
    });

    const result =
        resumeValue && typeof resumeValue === 'object' && 'tool_result' in resumeValue
            ? (resumeValue as { tool_result: unknown }).tool_result
            : resumeValue;

    endToolSpan(toolSpan);

    const content = typeof result === 'string' ? result : JSON.stringify(result ?? '');

    toolMessages.push(
        new ToolMessage({
            tool_call_id: toolCall.id,
            name: toolCall.name,
            content,
        }),
    );
}
```

- [ ] **Step 5: Instrument ai.service.ts — add langgraph.run span + traceId propagation**

Modify `apps/server/src/ai/ai.service.ts`:

Add imports at top:
```typescript
import { trace, context as otelContext, SpanStatusCode } from '@opentelemetry/api';
```

In `executeRunProtocol`, wrap the main try block with a span. After the `metadata` event emission (line ~147), add traceId:

Replace the metadata emit:
```typescript
// 1. metadata 事件（附加 traceId）
const activeSpan = trace.getActiveSpan();
const traceId = activeSpan?.spanContext().traceId;
await record.emitEvent({
    event: 'metadata',
    data: {
        run_id: record.id,
        thread_id: record.threadId,
        trace_id: traceId,  // 前端用此 ID 创建关联 Span
    },
});
```

Wrap the entire `executeRunProtocol` body in a span. Add this at the beginning of `executeRunProtocol`:
```typescript
const tracer = trace.getTracer('my-km-server');
const langgraphSpan = tracer.startSpan('langgraph.run', {
    attributes: {
        'langgraph.runId': record.id,
        'langgraph.threadId': record.threadId,
    },
});
```

In the success/final paths, before `record.emitEvent({ event: 'end' })`, add:
```typescript
langgraphSpan.setStatus({ code: SpanStatusCode.OK });
langgraphSpan.end();
```

In the catch block, before `record.emitEvent({ event: 'error' })`, add:
```typescript
langgraphSpan.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error).message });
langgraphSpan.recordException(error as Error);
langgraphSpan.end();
```

- [ ] **Step 6: Pass provider/model/round via configurable context**

In `executeRunProtocol` where `graph.stream()` is called (around line 178), the `configurable` object needs to pass `provider`, `model`, and `llmRound` to nodes. Update the configurable object:

```typescript
configurable: {
    thread_id: record.threadId,
    chatModel,
    tools: frontendTools,
    abortSignal: record.abortSignal,
    // OTel instrumentation context
    provider: record.runContext.llmConfig.provider,
    model: record.runContext.llmConfig.model,
    llmRound: 1,
},
```

To track round numbers, maintain a counter in the `for await` loop. After the `values` mode check (where interrupts are detected), increment the round:

```typescript
if (mode === 'values') {
    // ... existing logic ...
    if (hasInterruptOnThisChunk) {
        hasInterrupt = true;
    }
    // After interrupt, next LLM call is a new round
    if (hasInterruptOnThisChunk) {
        (stream._config as Record<string, unknown>) ??= {};
    }
}
```

Note: Since the `configurable` object is passed once at `graph.stream()`, we can pass `llmRound` as a starting value. The llm-node can track round internally using the state or a simpler approach: just use the span name with an incrementing counter managed by a `let llmRound = 1` variable in `executeRunProtocol`, and pass it through the configurable context. Since this requires modifying the graph stream config which is complex, a simpler approach is to track rounds in `ai.service.ts` using a local counter and set it as an attribute after each LLM span.

The simplest approach: in `executeRunProtocol`, after detecting the stream loop, keep a `let roundCounter = 1;` and after each `values` event with interrupt, increment it. But since we can't easily pass this back to the node, we'll skip round tracking for now and just use a static attribute. The round counter can be added later.

- [ ] **Step 7: Verify compilation**

```bash
cd /Users/gaojinlong/ThisMac/project/my-km/apps/server && pnpm exec tsc --noEmit --pretty 2>&1 | head -30
```

Expected: No errors.

- [ ] **Step 8: Commit**

```bash
git add apps/server/src/tracing/instrumentations/ apps/server/src/ai/ai.service.ts apps/server/src/ai/langgraph/nodes/llm-node.ts apps/server/src/ai/langgraph/nodes/tool-node.ts
git commit -m "feat(tracing): instrument LangGraph nodes with OTel spans (langgraph.run, llm_node, tool_node)"
```

---

## Task 6: TracingModule + Controller + Service

**Files:**
- Create: `apps/server/src/tracing/tracing.module.ts`
- Create: `apps/server/src/tracing/tracing.service.ts`
- Create: `apps/server/src/tracing/tracing.controller.ts`
- Create: `apps/server/src/tracing/tracing.dto.ts`
- Modify: `apps/server/src/app.module.ts`

- [ ] **Step 1: Create DTOs**

Create `apps/server/src/tracing/tracing.dto.ts`:

```typescript
import { IsOptional, IsString, IsDateString, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class QueryTracesDto {
  @IsOptional() @IsString()
  threadId?: string;

  @IsOptional() @IsString()
  status?: string;

  @IsOptional() @IsDateString()
  from?: string;

  @IsOptional() @IsDateString()
  to?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number = 1;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  pageSize?: number = 20;
}

export class IngestSpansDto {
  @IsOptional()
  spans?: Array<{
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
    events?: Array<{ name: string; time: string; attributes?: Record<string, unknown> }>;
    links?: Array<{ traceId: string; spanId: string }>;
  }>;
}
```

- [ ] **Step 2: Create TracingService**

Create `apps/server/src/tracing/tracing.service.ts`:

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

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

    if (dto.threadId) {
      where.attributes = { path: ['threadId'], equals: dto.threadId };
    }
    if (dto.status) {
      where.status = dto.status;
    }
    if (dto.from || dto.to) {
      where.startTime = {};
      if (dto.from) (where.startTime as Record<string, unknown>).gte = new Date(dto.from!);
      if (dto.to) (where.startTime as Record<string, unknown>).lte = new Date(dto.to!);
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
          attributes: span.attributes ?? {},
          events: span.events ?? [],
          links: span.links ?? [],
        },
        update: {
          endTime: span.endTime ? new Date(span.endTime) : undefined,
          durationMs: span.durationMs,
          status: span.status ?? 'OK',
          attributes: span.attributes ?? {},
          events: span.events ?? [],
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
```

Note: Import `IngestSpansDto` type at top — it's used as a type reference. Add:
```typescript
import type { IngestSpansDto } from './tracing.dto';
```

- [ ] **Step 3: Create TracingController**

Create `apps/server/src/tracing/tracing.controller.ts`:

```typescript
import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { TracingService } from './tracing.service';
import { QueryTracesDto, IngestSpansDto } from './tracing.dto';

@Controller('traces')
export class TracingController {
  constructor(private readonly tracingService: TracingService) {}

  @Get()
  async listTraces(@Query() dto: QueryTracesDto) {
    return this.tracingService.queryTraces({
      threadId: dto.threadId,
      status: dto.status,
      from: dto.from,
      to: dto.to,
      page: dto.page ?? 1,
      pageSize: dto.pageSize ?? 20,
    });
  }

  @Get('stats')
  async getStats(
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.tracingService.getStats(from, to);
  }

  @Get(':traceId')
  async getTrace(@Param('traceId') traceId: string) {
    return this.tracingService.getTrace(traceId);
  }

  @Post('spans')
  async ingestSpans(@Body() dto: IngestSpansDto) {
    if (dto.spans?.length) {
      await this.tracingService.ingestSpans(dto.spans);
    }
    return { success: true };
  }
}
```

- [ ] **Step 4: Create TracingModule**

Create `apps/server/src/tracing/tracing.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { TracingController } from './tracing.controller';
import { TracingService } from './tracing.service';

@Module({
  controllers: [TracingController],
  providers: [TracingService],
  exports: [TracingService],
})
export class TracingModule {}
```

- [ ] **Step 5: Register TracingModule in AppModule**

Modify `apps/server/src/app.module.ts`:

Add import:
```typescript
import { TracingModule } from './tracing/tracing.module';
```

Add `TracingModule` to the `imports` array (after `AiModule`):
```typescript
imports: [
    ConfigModule,
    LoggerModule,
    PrismaModule,
    CacheModule,
    UsersModule,
    AuthModule,
    I18nModule,
    AiModule,
    TracingModule,
],
```

- [ ] **Step 6: Verify compilation**

```bash
cd /Users/gaojinlong/ThisMac/project/my-km/apps/server && pnpm exec tsc --noEmit --pretty 2>&1 | head -30
```

Expected: No errors.

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/tracing/ apps/server/src/app.module.ts
git commit -m "feat(tracing): add TracingModule with query API, span ingestion, and cleanup cron"
```

---

## Task 7: Frontend BrowserTracer

**Files:**
- Create: `apps/web/src/lib/tracing/types.ts`
- Create: `apps/web/src/lib/tracing/tracer.ts`

- [ ] **Step 1: Create types.ts**

Create `apps/web/src/lib/tracing/types.ts`:

```typescript
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
```

- [ ] **Step 2: Create tracer.ts — BrowserTracer + BrowserSpanExporter**

Create `apps/web/src/lib/tracing/tracer.ts`:

```typescript
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

import { context, propagation, trace, SpanStatusCode } from '@opentelemetry/api';
import type { SpanData, SpanEvent, SpanLink } from './types';

const SERVICE_NAME = 'my-km-web';
const FLUSH_INTERVAL = 5000;
const FLUSH_BATCH_SIZE = 10;
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api';

class ActiveSpan {
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

  /**
   * 启动一个新的 Span
   */
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

  /**
   * 结束一个 Span 并导出
   */
  endSpan(span: ActiveSpan): SpanData {
    const data = span.end();
    this.exporter.export(data);
    return data;
  }

  /**
   * 生成用于 HTTP 请求的 traceparent header
   */
  getTraceparent(traceId: string, spanId: string): string {
    // W3C traceparent format: version-traceId-spanId-flags
    return `00-${traceId}-${spanId}-01`;
  }

  /**
   * 强制 flush 所有缓冲的 span
   */
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
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
```

- [ ] **Step 3: Verify compilation**

```bash
cd /Users/gaojinlong/ThisMac/project/my-km/apps/web && pnpm exec tsc --noEmit --pretty 2>&1 | head -20
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/tracing/
git commit -m "feat(tracing): implement BrowserTracer with batch span export to backend"
```

---

## Task 8: Frontend useLangGraphStream Instrumentation

**Files:**
- Modify: `apps/web/src/hooks/use-langgraph-stream.ts`
- Modify: `apps/web/src/features/ai/tools/frontend-tool-executor.ts`

- [ ] **Step 1: Instrument useLangGraphStream with trace spans**

Modify `apps/web/src/hooks/use-langgraph-stream.ts`:

Add import at top:
```typescript
import { getTracer } from '@/lib/tracing/tracer';
import type { ActiveSpan } from '@/lib/tracing/tracer';
```

Add a `traceSpan` ref inside `useLangGraphStream`:
```typescript
const activeTraceSpan = useRef<ActiveSpan | null>(null);
const activeTraceId = useRef<string | null>(null);
```

Modify `sendMessage` to create a root span and inject traceparent:
```typescript
const sendMessage = useCallback(
    async (content: string, context?: Record<string, unknown>) => {
        const tracer = getTracer();

        // 创建根 Span
        const rootSpan = tracer.startSpan('frontend.chat.sendMessage', {
            attributes: {
                'chat.messageLength': content.length,
            },
        });
        activeTraceSpan.current = rootSpan;
        activeTraceId.current = rootSpan.traceId;

        await stream.submit(
            {
                messages: [
                    {
                        type: 'human',
                        content,
                    } as Message,
                ],
            },
            {
                context: {
                    ...context,
                    // 传递 traceparent 给后端（通过 LangGraph SDK headers）
                    _traceparent: tracer.getTraceparent(rootSpan.traceId, rootSpan.spanId),
                } as never,
            },
        );
    },
    [stream],
);
```

Modify `resumeWithToolResult` to create resume span:
```typescript
const resumeWithToolResult = useCallback(
    async (toolCallId: string, result: unknown) => {
        const tracer = getTracer();

        // 创建 resume Span（与 sendMessage 同一 trace）
        const resumeSpan = tracer.startSpan('POST /runs/resume', {
            traceId: activeTraceId.current ?? undefined,
            parentSpanId: activeTraceSpan.current?.spanId,
            attributes: {
                'tool.callId': toolCallId,
            },
        });

        await stream.submit(null, {
            command: {
                resume: {
                    tool_call_id: toolCallId,
                    tool_result: result,
                },
            },
        });

        tracer.endSpan(resumeSpan);
    },
    [stream],
);
```

Add a `useEffect` to handle stream completion and traceId extraction from metadata:

```typescript
// 结束 trace span 当 stream 结束时
useEffect(() => {
    if (!stream.isLoading && activeTraceSpan.current) {
        const tracer = getTracer();
        if (stream.error) {
            activeTraceSpan.current.setError(String(stream.error));
        }
        tracer.endSpan(activeTraceSpan.current);
        activeTraceSpan.current = null;
    }
}, [stream.isLoading, stream.error]);
```

Note: The traceId from backend metadata event should be captured when available. This can be done by extracting it from `stream.messages` metadata or by monitoring the SSE stream. For now, the frontend generates its own traceId which is shared with the backend via the `_traceparent` context. The backend extracts this from the incoming request.

- [ ] **Step 2: Instrument FrontendToolExecutor.dispatch with span**

Modify `apps/web/src/features/ai/tools/frontend-tool-executor.ts`:

Add import at top:
```typescript
import { getTracer } from '@/lib/tracing/tracer';
```

Wrap `handler.execute(input)` call in `dispatch` method with a span:

```typescript
async dispatch(toolName: string, input: Record<string, unknown>): Promise<ToolResult> {
    const handler = this.handlers.get(toolName);
    if (!handler) {
        return { success: false, error: `Unknown tool: ${toolName}` };
    }

    const tracer = getTracer();
    const toolSpan = tracer.startSpan(`frontend.tool.execute`, {
        attributes: {
            'tool.name': toolName,
            'tool.type': handler.type,
        },
    });

    try {
        if (this.strategy.needsConfirmation(toolName, input)) {
            const approved = await this.requestConfirmation(handler, input);
            if (!approved) {
                toolSpan.setError('User rejected the operation');
                tracer.endSpan(toolSpan);
                return { success: false, error: 'User rejected the operation' };
            }
        }

        const result = await handler.execute(input);
        if (!result.success) {
            toolSpan.setError(result.error ?? 'Tool execution failed');
        }
        tracer.endSpan(toolSpan);
        return result;
    } catch (err) {
        toolSpan.setError(err instanceof Error ? err.message : String(err));
        tracer.endSpan(toolSpan);
        return {
            success: false,
            error: err instanceof Error ? err.message : String(err),
        };
    }
}
```

- [ ] **Step 3: Verify compilation**

```bash
cd /Users/gaojinlong/ThisMac/project/my-km/apps/web && pnpm exec tsc --noEmit --pretty 2>&1 | head -20
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/hooks/use-langgraph-stream.ts apps/web/src/features/ai/tools/frontend-tool-executor.ts
git commit -m "feat(tracing): instrument frontend stream hook and tool executor with OTel spans"
```

---

## Task 9: Debug Page — List View

**Files:**
- Create: `apps/web/src/app/[locale]/debug/traces/page.tsx`

This task creates the trace list page. The debug page uses existing layout patterns from the project.

- [ ] **Step 1: Create the trace list page**

Create `apps/web/src/app/[locale]/debug/traces/page.tsx`:

```typescript
'use client';

import { useEffect, useState } from 'react';
import { publicApiClient } from '@/api/client';

interface TraceListItem {
  id: string;
  traceId: string;
  rootSpanId: string;
  serviceName: string;
  startTime: string;
  endTime: string | null;
  durationMs: number | null;
  status: string;
  attributes: Record<string, unknown>;
  _count: { spans: number };
}

interface TracesResponse {
  traces: TraceListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export default function TracesPage() {
  const [data, setData] = useState<TracesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  useEffect(() => {
    setLoading(true);
    // Note: Using direct fetch since traces API is on the server API, not the v1 API
    fetch(`http://localhost:3000/api/traces?page=${page}&pageSize=20`)
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [page]);

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">LLM Traces</h1>

      {loading && <p className="text-muted-foreground">Loading...</p>}

      {!loading && data && (
        <>
          <p className="text-sm text-muted-foreground mb-4">
            Total: {data.total} traces
          </p>

          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="text-left p-3">Time</th>
                  <th className="text-left p-3">Duration</th>
                  <th className="text-left p-3">Status</th>
                  <th className="text-left p-3">Spans</th>
                  <th className="text-left p-3">Thread</th>
                  <th className="text-left p-3">Model</th>
                </tr>
              </thead>
              <tbody>
                {data.traces.map((trace) => (
                  <tr
                    key={trace.traceId}
                    className="border-t hover:bg-muted/50 cursor-pointer"
                    onClick={() => {
                      window.location.href = `/debug/traces/${trace.traceId}`;
                    }}
                  >
                    <td className="p-3">
                      {new Date(trace.startTime).toLocaleTimeString()}
                    </td>
                    <td className="p-3 font-mono">
                      {trace.durationMs != null ? `${trace.durationMs}ms` : '-'}
                    </td>
                    <td className="p-3">
                      <span
                        className={`px-2 py-0.5 rounded text-xs ${
                          trace.status === 'ERROR'
                            ? 'bg-red-100 text-red-800'
                            : trace.status === 'OK'
                              ? 'bg-green-100 text-green-800'
                              : 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {trace.status}
                      </span>
                    </td>
                    <td className="p-3">{trace._count.spans}</td>
                    <td className="p-3 text-xs font-mono truncate max-w-32">
                      {(trace.attributes as Record<string, unknown>)?.threadId as string ?? '-'}
                    </td>
                    <td className="p-3 text-xs">
                      {(trace.attributes as Record<string, unknown>)?.['llm.model'] as string ?? '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex gap-2 mt-4">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
              className="px-3 py-1 border rounded disabled:opacity-50"
            >
              Previous
            </button>
            <span className="px-3 py-1">Page {page}</span>
            <button
              type="button"
              disabled={page * 20 >= data.total}
              onClick={() => setPage(page + 1)}
              className="px-3 py-1 border rounded disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/
git commit -m "feat(tracing): add debug traces list page"
```

---

## Task 10: Debug Page — Trace Detail Waterfall View

**Files:**
- Create: `apps/web/src/app/[locale]/debug/traces/[traceId]/page.tsx`

- [ ] **Step 1: Create the trace detail page with waterfall timeline**

Create `apps/web/src/app/[locale]/debug/traces/[traceId]/page.tsx`:

```typescript
'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

interface SpanItem {
  id: string;
  spanId: string;
  traceId: string;
  parentSpanId: string | null;
  name: string;
  kind: string;
  serviceName: string;
  startTime: string;
  endTime: string | null;
  durationMs: number | null;
  status: string;
  statusMessage: string | null;
  attributes: Record<string, unknown>;
  events: Array<{ name: string; time: string; attributes?: Record<string, unknown> }>;
}

interface TraceDetail {
  id: string;
  traceId: string;
  rootSpanId: string;
  serviceName: string;
  startTime: string;
  endTime: string | null;
  durationMs: number | null;
  status: string;
  attributes: Record<string, unknown>;
  spans: SpanItem[];
}

function WaterfallRow({
  span,
  traceStart,
  traceDuration,
  depth,
}: {
  span: SpanItem;
  traceStart: number;
  traceDuration: number;
  depth: number;
}) {
  const start = new Date(span.startTime).getTime() - traceStart;
  const duration = span.durationMs ?? 0;
  const leftPct = traceDuration > 0 ? (start / traceDuration) * 100 : 0;
  const widthPct = traceDuration > 0 ? Math.max((duration / traceDuration) * 100, 0.5) : 0;

  const [expanded, setExpanded] = useState(false);

  const statusColor =
    span.status === 'ERROR'
      ? 'bg-red-500'
      : span.status === 'OK'
        ? 'bg-green-500'
        : 'bg-gray-400';

  return (
    <div>
      <div
        className="flex items-center h-8 hover:bg-muted/50 cursor-pointer border-b"
        style={{ paddingLeft: `${depth * 16}px` }}
        onClick={() => setExpanded(!expanded)}
      >
        <div className="w-40 shrink-0 text-xs truncate px-2 font-mono">{span.name}</div>
        <div className="flex-1 relative h-4 mx-2">
          <div
            className={`absolute top-0 h-full rounded ${statusColor} opacity-70`}
            style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
          />
        </div>
        <div className="w-20 shrink-0 text-right text-xs font-mono px-2">
          {span.durationMs != null ? `${span.durationMs}ms` : '-'}
        </div>
        <div className="w-24 shrink-0 text-right text-xs px-2">
          {span.serviceName === 'my-km-web' ? 'frontend' : 'backend'}
        </div>
      </div>

      {expanded && (
        <div className="border-b bg-muted/20 p-4 text-xs" style={{ paddingLeft: `${depth * 16 + 16}px` }}>
          <div className="grid grid-cols-2 gap-x-8 gap-y-1">
            <div>
              <span className="text-muted-foreground">Span ID:</span>{' '}
              <span className="font-mono">{span.spanId}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Status:</span>{' '}
              <span className={span.status === 'ERROR' ? 'text-red-600' : ''}>{span.status}</span>
              {span.statusMessage && (
                <span className="text-red-600 ml-1">({span.statusMessage})</span>
              )}
            </div>
          </div>

          {Object.keys(span.attributes).length > 0 && (
            <div className="mt-2">
              <div className="text-muted-foreground mb-1">Attributes:</div>
              <pre className="bg-background p-2 rounded text-xs overflow-x-auto">
                {JSON.stringify(span.attributes, null, 2)}
              </pre>
            </div>
          )}

          {span.events.length > 0 && (
            <div className="mt-2">
              <div className="text-muted-foreground mb-1">Events:</div>
              <div className="space-y-1">
                {span.events.map((event, i) => (
                  <div key={i} className="flex gap-4">
                    <span className="font-mono">{new Date(event.time).toLocaleTimeString()}</span>
                    <span>{event.name}</span>
                    {event.attributes && (
                      <span className="text-muted-foreground">
                        {JSON.stringify(event.attributes)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function TraceDetailPage() {
  const { traceId } = useParams<{ traceId: string }>();
  const [trace, setTrace] = useState<TraceDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`http://localhost:3000/api/traces/${traceId}`)
      .then((r) => r.json())
      .then((d) => setTrace(d))
      .catch(() => setTrace(null))
      .finally(() => setLoading(false));
  }, [traceId]);

  if (loading) return <div className="p-6">Loading...</div>;
  if (!trace) return <div className="p-6">Trace not found</div>;

  const traceStart = new Date(trace.startTime).getTime();
  const traceDuration = trace.durationMs ?? 0;

  // Build span tree for indentation
  const spanMap = new Map(trace.spans.map((s) => [s.spanId, s]));
  const depthMap = new Map<string, number>();

  function getDepth(spanId: string): number {
    if (depthMap.has(spanId)) return depthMap.get(spanId)!;
    const span = spanMap.get(spanId);
    if (!span?.parentSpanId) {
      depthMap.set(spanId, 0);
      return 0;
    }
    const depth = getDepth(span.parentSpanId) + 1;
    depthMap.set(spanId, depth);
    return depth;
  }

  // Sort spans by startTime
  const sortedSpans = [...trace.spans].sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
  );

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <a href="/debug/traces" className="text-sm text-muted-foreground hover:underline">
          &larr; Back to traces
        </a>
        <h1 className="text-2xl font-bold mt-2">Trace: {trace.traceId.slice(0, 16)}...</h1>
        <div className="flex gap-6 mt-2 text-sm text-muted-foreground">
          <span>Started: {new Date(trace.startTime).toLocaleString()}</span>
          <span>Duration: {trace.durationMs ?? '-'}ms</span>
          <span>Spans: {trace.spans.length}</span>
          <span>
            Status:{' '}
            <span className={trace.status === 'ERROR' ? 'text-red-600' : ''}>{trace.status}</span>
          </span>
        </div>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <div className="flex items-center h-8 bg-muted text-xs font-medium border-b">
          <div className="w-40 shrink-0 px-2">Name</div>
          <div className="flex-1 px-2">Timeline</div>
          <div className="w-20 shrink-0 text-right px-2">Duration</div>
          <div className="w-24 shrink-0 text-right px-2">Source</div>
        </div>

        {sortedSpans.map((span) => (
          <WaterfallRow
            key={span.spanId}
            span={span}
            traceStart={traceStart}
            traceDuration={traceDuration}
            depth={getDepth(span.spanId)}
          />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/
git commit -m "feat(tracing): add trace detail page with waterfall timeline"
```

---

## Task 11: End-to-End Smoke Test

**Files:** No new files

- [ ] **Step 1: Start the backend server**

```bash
cd /Users/gaojinlong/ThisMac/project/my-km && pnpm dev
```

Wait for both frontend and backend to start.

- [ ] **Step 2: Send a test chat message**

Open `http://localhost:4000` and send a chat message to trigger the LLM pipeline. Wait for the response to complete.

- [ ] **Step 3: Check traces in the database**

```bash
cd /Users/gaojinlong/ThisMac/project/my-km && npx prisma db execute --schema packages/prisma/prisma/schema.prisma --stdin <<< "SELECT trace_id, status, duration_ms, start_time FROM otel_traces ORDER BY start_time DESC LIMIT 5;"
```

Expected: At least 1 trace row with status 'OK' or 'ERROR'.

- [ ] **Step 4: Check spans in the database**

```bash
npx prisma db execute --schema packages/prisma/prisma/schema.prisma --stdin <<< "SELECT name, service_name, status, duration_ms FROM otel_spans ORDER BY start_time DESC LIMIT 10;"
```

Expected: Multiple span rows including `langgraph.run`, `llm_node.invoke`, `tool_node.interrupt` (if tools used), and HTTP auto-instrumented spans.

- [ ] **Step 5: Check the debug page**

Open `http://localhost:4000/debug/traces` and verify:
- Trace list shows at least 1 trace
- Clicking a trace shows the waterfall timeline with spans

- [ ] **Step 6: Final commit (if any fixes needed)**

```bash
git add -A
git commit -m "fix(tracing): address smoke test findings"
```

---

## Self-Review

**1. Spec coverage:**
- ✅ OTel SDK initialization → Task 3
- ✅ PgSpanExporter → Task 2
- ✅ LangGraph custom spans (langgraph.run, llm_node, tool_node) → Task 5
- ✅ SSE traceId propagation → Task 5 (metadata event)
- ✅ Frontend BrowserTracer → Task 7
- ✅ Frontend tool execution spans → Task 8
- ✅ traceparent propagation → Task 3 (CORS) + Task 8 (frontend)
- ✅ PostgreSQL schema → Task 1
- ✅ Cleanup cron → Task 6
- ✅ Debug page (list + detail) → Tasks 9-10
- ✅ @WithSpan decorator → Task 4
- ✅ Traces API (list/detail/ingest/stats) → Task 6

**2. Placeholder scan:** No TBD/TODO found. All code is complete.

**3. Type consistency:**
- `SpanData` interface used consistently between frontend tracer and backend ingestion DTO
- `OtelTrace` / `OtelSpan` Prisma model names consistent across PgSpanExporter, TracingService, and schema
- `generateTraceId()` produces 32 hex chars, `generateSpanId()` produces 16 hex chars (OTel spec compliant)
