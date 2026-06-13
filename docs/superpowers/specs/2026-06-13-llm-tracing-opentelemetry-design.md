# LLM 链路追踪方案 — 基于 OpenTelemetry

> 日期：2026-06-13
> 状态：已批准

## 背景

需要一套端到端的链路追踪系统，覆盖前端交互、HTTP 传输、LangGraph 工作流、LLM 调用、前端工具执行的完整流程，用于调试和追踪 bug 原因。

**决策**：以 OpenTelemetry 为核心，自建 PgSpanExporter 写 PostgreSQL，保留 LangSmith 作为补充。未来可通过 OTLP Exporter 无缝接入 Jaeger/Grafana 等外部 APM。

## 1. Span 树设计

一次用户消息的完整生命周期映射为 OTel Span 树：

```
Trace（一次用户消息的完整生命周期）
│
├── Span: frontend.chat.sendMessage              [前端根 Span]
│   attr: userId, threadId, messageLength
│   │
│   ├── Span: POST /runs/stream                  [前端 → 后端 HTTP]
│   │   (携带 traceparent header)
│   │
│   ├── Span: frontend.sse.receive               [前端 SSE 接收]
│   │   events: metadata, messages/*, tool_interrupt
│   │
│   ├── Span: frontend.tool.execute              [前端 - 工具执行]
│   │   attr: toolName, toolCallId
│   │   │
│   │   ├── Span: tool.doc_read                  [前端]
│   │   │   ├── Span: doc.load
│   │   │   │   attr: documentId, format
│   │   │   └── Span: doc.parse
│   │   │       attr: chunkCount, totalLength
│   │   │
│   │   ├── Span: tool.doc_edit                  [前端]
│   │   │   ├── Span: edit.load_document
│   │   │   ├── Span: edit.apply_operation
│   │   │   │   attr: operation("splice-text"|"insert-text"), position, textLength
│   │   │   └── Span: edit.render_result
│   │   │       attr: editorState updated
│   │   │
│   │   ├── Span: tool.file_ops                  [前端]
│   │   │   ├── Span: file.list
│   │   │   │   attr: path, fileCount
│   │   │   ├── Span: file.create
│   │   │   │   attr: path, contentLength
│   │   │   └── Span: file.read
│   │   │       attr: path, size
│   │   │
│   │   └── Span: tool.search                    [前端]
│   │       ├── Span: search.query
│   │       │   attr: query, scope
│   │       └── Span: search.rank
│   │           attr: resultCount, topScore
│   │
│   └── Span: POST /runs/:rid/resume             [前端 → 后端 HTTP]
│       (携带 traceparent + 工具结果)
│
├── ── ── ── ── ── ── 同一 Trace 的后端 Span ── ── ── ── ── ──
│
├── Span: POST /api/threads/:tid/runs/stream      [后端, HTTP 自动]
│   │
│   ├── Span: langgraph.run                       [后端, 自定义]
│   │   attr: runId, threadId, modelName
│   │   │
│   │   ├── Span: llm_node.invoke                 [后端, 第1轮]
│   │   │   attr: model, provider, inputTokens, outputTokens
│   │   │   │
│   │   │   └── Span: anthropic.chat              [后端, SDK 自动]
│   │   │       attr: request.model, usage.*
│   │   │
│   │   ├── Span: tool_node.interrupt             [后端]
│   │   │   attr: toolName, toolCallId
│   │   │   link → frontend.tool.execute
│   │   │
│   │   └── Span: llm_node.invoke                 [后端, 第2轮]
│   │       attr: model, provider, inputTokens, outputTokens
│   │
│   ├── Span: prisma.query                        [后端, 自动]
│   └── Span: redis.get                           [后端, 自动]
│
└── Span: POST /api/threads/:tid/runs/:rid/resume  [后端, HTTP 自动]
    └── Span: langgraph.run.resume                 [后端]
```

关键设计点：
- 前后端通过 `traceparent` header 串联为同一个 Trace
- LangGraph 循环（LLM → Tool → LLM → ...）展开为平级兄弟 Span
- 前端工具执行通过 OTel Link 与后端 tool_node.interrupt 关联
- 自动埋点覆盖 HTTP、Prisma、Redis，零代码
- 自定义 Span 只需在 3 处手动打点：LLM Node、Tool Node、LangGraph Run

## 2. 后端 OTel 集成架构

### 模块结构

```
apps/server/src/
├── tracing/
│   ├── tracing.module.ts             # NestJS 模块
│   ├── tracing.init.ts               # OTel SDK 初始化（bootstrap 前执行）
│   ├── exporters/
│   │   ├── pg-span.exporter.ts       # Phase 1: 自定义 PG Exporter
│   │   └── composite.exporter.ts     # Phase 2: PG + OTLP 复合导出
│   ├── instrumentations/
│   │   ├── langgraph.instrumentation.ts
│   │   ├── llm-node.instrumentation.ts
│   │   └── tool-node.instrumentation.ts
│   ├── propagators/
│   │   └── sse-propagator.ts
│   └── decorators/
│       └── with-span.decorator.ts    # @WithSpan() 装饰器
```

### 初始化流程

在 `main.ts` 的 NestJS bootstrap 之前执行 OTel SDK 初始化：
1. 注册自动埋点：http、redis、socket.io
2. 注册 SpanProcessor：BatchSpanProcessor(PgSpanExporter)
3. 注册 Context Propagator：W3cTraceContext + Baggage
4. 注册 Resource：service.name = "my-km-server"

### 埋点方式（3 层）

**第 1 层：自动埋点** — HTTP、Redis、Socket.io 由 SDK 自动拦截，零代码。

**第 2 层：装饰器** — 在 Service 方法上加 `@WithSpan()` 注解，自动创建 Span 记录耗时/异常。

**第 3 层：手动 Span** — 在 LLM Node、Tool Node 等需要精细 attributes 和 events 的地方手动创建 Span。

### SSE 传播 traceId

后端在 SSE 流的 `metadata` 事件中附加 traceId，前端获取后用于创建工具执行 Span 的 parent context。

## 3. 前端埋点方案

### 模块结构

```
apps/web/src/
├── lib/tracing/
│   ├── tracing-provider.tsx       # React Context
│   ├── tracer.ts                  # Tracer 单例 + BrowserSpanExporter
│   └── types.ts
├── hooks/
│   ├── use-langgraph-stream.ts    # 改造: 注入 traceparent + 记录 SSE Span
│   └── use-trace.ts               # 获取当前 traceId/Span
```

### 核心决策

前端不引入 OTel SDK 全家桶（太重），只用 `@opentelemetry/api`（~5KB 纯接口包）手动创建 Span，通过自定义 BrowserSpanExporter 批量 POST 到后端 `/api/traces/spans` 端点。

### BrowserSpanExporter 上报策略

- 缓冲区满 10 个 Span 或空闲 5 秒触发上报
- 上报失败静默处理，不影响用户体验
- 页面 unload 时通过 `navigator.sendBeacon` 兜底发送

## 4. PostgreSQL Schema

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

### 数据清理

定时任务每天凌晨执行，默认保留 30 天，可通过 `TRACE_RETENTION_DAYS` 环境变量配置。

### 数据量估算

- 简单问答 ~8 span/次，带工具调用 ~15 span/次，复杂多轮 ~25 span/次
- 单条 span ~1KB，每日 1000 次对话约 10-25MB，30 天 ~300-750MB
- PostgreSQL 完全可承受

## 5. 调试页面

### 后端 API

| 端点 | 说明 |
|------|------|
| `GET /api/traces` | 列表查询，支持 threadId/status/时间范围筛选 |
| `GET /api/traces/:traceId` | 单个 trace 详情（含所有 span） |
| `POST /api/traces/spans` | 接收前端上报的 span |
| `GET /api/traces/stats` | 统计概览 |

### 前端页面

- `/debug/traces` — 列表页：展示时间、Thread、耗时、状态、模型
- `/debug/traces/:traceId` — 详情页：瀑布时间线 + Span 属性/事件面板

### 访问控制

调试页面通过现有 Auth Guard + 角色检查保护，仅管理员可访问。

## 6. Phase 划分

### Phase 1（本次实施）

| 模块 | 内容 |
|------|------|
| 后端 OTel SDK 初始化 | `@opentelemetry/sdk-node` + http/redis 自动埋点 |
| PgSpanExporter | 自定义 Exporter，批量写 PostgreSQL |
| LangGraph 自定义 Span | langgraph.run、llm_node.invoke、tool_node.interrupt |
| SSE traceId 传播 | metadata event 中附加 traceId |
| 前端 Tracer | `@opentelemetry/api` + BrowserSpanExporter |
| 前端工具执行 Span | doc_edit、doc_read、file_ops、search |
| traceparent 传播 | 前端 → 后端 HTTP header 自动注入/提取 |
| PostgreSQL Schema | OtelTrace + OtelSpan 表 + 清理定时任务 |
| 调试页面 | trace 列表页 + 详情瀑布图页 |
| @WithSpan 装饰器 | 便捷打点 |

### Phase 2（后续按需）

| 模块 | 触发条件 |
|------|---------|
| CompositeExporter (PG + OTLP) | 需接入 Jaeger/Grafana 时 |
| Prisma 自动埋点 | 确认 instrumentation-prisma 支持 Prisma 7 后 |
| Metrics 采集 | 需要 token 用量趋势、P95 延迟等统计 |
| Logs 关联 | Winston 日志自动注入 traceId/spanId |
| Socket.io 自动埋点 | 需追踪 WebSocket 事件链路时 |
| Grafana 仪表盘 | 接入 Grafana 可视化 |

### 依赖包（Phase 1）

```
# 后端
@opentelemetry/api
@opentelemetry/sdk-node
@opentelemetry/exporter-trace-otlp-http   # 预留 Phase 2
@opentelemetry/instrumentation-http
@opentelemetry/instrumentation-redis

# 前端
@opentelemetry/api                        # ~5KB 纯接口包
```
