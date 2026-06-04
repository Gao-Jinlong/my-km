# AI 后端重写 — Thread/Run 架构方案

## 背景

当前后端 AI 模块积累了大量架构债务：
- **SSEExecutor 是一个 God Object**（256 行）：同时管理房间、持久化消息、调用 LLM、发射 SSE 事件——所有职责耦合在一个类中。
- **两条并行执行路径**：SSE 路径完全绕过 LangGraph；WebSocket 路径使用了它，但因 `BaseExecutor.runToolLoop()` 中的无限递归问题被弃用。
- **缺少 Service 层**：Controller 直接实例化 `SSEExecutor`，违反 NestJS 分层架构。
- **概念不匹配**：使用 "room" 而非 LangGraph 的 "thread" 术语。
- **无 Checkpointer**：LangGraph graph 编译时没有 checkpointer，丧失状态恢复能力。
- **Agents 模块未使用**：Editor→Writer 管道从未集成。

**目标**：删除整个 `apps/server/src/ai/` 目录，用对齐 LangGraph Platform 协议的 Thread/Run 架构重建。

## 决策汇总（共 17 项）

| # | 决策 | 选择 |
|---|------|------|
| D1 | API 路由 | RESTful 嵌套路由：`/ai/threads/:threadId/runs`、`/ai/runs/:runId/resume` |
| D2 | LLM 执行路径 | 回归 LangGraph StateGraph（修复递归 bug） |
| D3 | Checkpointer 存储 | 可配置：MemorySaver（开发）/ PostgresSaver（生产） |
| D4 | EventStore | Prisma + PostgreSQL 全功能（append、replay、subscribe） |
| D5 | 跨 Thread KV 存储 | LangGraph BaseStore 接口 |
| D6 | 删除范围 | 删除整个 `ai/` 目录，从零重建 |
| D7 | Token 追踪 | RunRecord 累计 + finalize 时持久化 |
| D8 | Agents 模块 | 完全删除 |
| D9 | Graph 编译 | 每次 Run 编译 + LRU 缓存（最大 10） |
| D10 | AppConfig | 每次请求的不可变快照 |
| D11 | 测试策略 | TDD — 测试先行 |
| D12 | Graph 编译性能 | LRU 缓存避免重复编译 |
| T1 | 持久化策略 | Checkpointer 替代 MessageStore 作为主持久化层 |
| T2 | Run 分层 | 保持三层：RunManager + RunRecord + RunContext |
| T3 | EventStore 角色 | 保留 EventStore 用于 SSE 回放/重连（与 Checkpointer 状态分离） |
| T4 | 并发 Run | 三种模式：rejected（默认）/ interrupt / rollback — 通过 HTTP 参数声明 |
| T5 | 前端迁移 | 同步重构前端传输层 |

## 目标架构

```
┌──────────────────────────────────────────────────────────────────────┐
│                          控制器层                                    │
│  AiChatController（薄层 — 仅 DTO 解析 + SSE 头设置）                  │
│    POST   /ai/threads/:threadId/runs        → startRun              │
│    POST   /ai/runs/:runId/resume            → resume                │
│    POST   /ai/runs/:runId/cancel            → cancel                │
│    GET    /ai/threads                        → 列出 threads          │
│    POST   /ai/threads                        → 创建 thread           │
│    GET    /ai/threads/:id                    → 获取 thread           │
│    GET    /ai/threads/:id/messages           → 获取消息历史          │
│    PATCH  /ai/threads/:id                    → 更新 thread           │
│    DELETE /ai/threads/:id                    → 删除 thread           │
└────────────┬─────────────────────────────────────────────────────────┘
             │
┌────────────▼─────────────────────────────────────────────────────────┐
│                          服务层                                      │
│  AiChatService                                                      │
│    startRun(threadId, content, context, concurrency) → RunRecord    │
│    resume(runId, toolCallId, result)                  → RunRecord    │
│    cancel(runId)                                      → void         │
│                                                                      │
│  ThreadService（基于 Prisma 的 CRUD，"Room" 模型 → "Thread" 概念）    │
└────────────┬─────────────────────────────────────────────────────────┘
             │
┌────────────▼─────────────────────────────────────────────────────────┐
│                        Run 执行层                                    │
│                                                                      │
│  RunManager（生命周期 + 并发控制）                                    │
│    createRun(threadId, ctx)        → RunRecord                      │
│    getRun(runId)                   → RunRecord | undefined          │
│    cancelRun(runId)                → void                            │
│    cleanup()                       → 移除过期的 RunRecord            │
│                                                                      │
│  RunRecord（单次 Run 的状态持有者）                                   │
│    id, threadId, status, tokenUsage                                 │
│    execute(history, tools)          → AsyncIterable<StreamEvent>    │
│    resume(toolCallId, result)       → AsyncIterable<StreamEvent>    │
│    abort()                                                           │
│    emitEvent(event)                 → SSE 写入 + EventStore.append   │
│    finalize()                       → 持久化 tokenUsage              │
│                                                                      │
│  RunContext（依赖注入容器，模块初始化时创建一次）                       │
│    checkpointer: BaseCheckpointSaver                                │
│    store: BaseStore（跨 Thread KV）                                   │
│    eventStore: RunEventStore                                        │
│    threadStore: ThreadStore                                          │
│    getCompiledGraph(configKey): CompiledGraph（LRU 缓存）             │
└────────────┬─────────────────────────────────────────────────────────┘
             │
┌────────────▼─────────────────────────────────────────────────────────┐
│                        基础设施层                                    │
│                                                                      │
│  LLM Providers（复用）       LangGraph Graph（重建）                  │
│  ├─ AnthropicProvider       ├─ ChatGraph: START→llm→[tools→llm]→END │
│  ├─ OpenAIProvider          └─ Nodes: llm-node, tool-node, router   │
│  ├─ ZhipuProvider                                                  │
│  └─ DashscopeProvider       Checkpointer（新增）                     │
│                              ├─ MemorySaver（开发）                   │
│  SSE 协议（复用）            └─ PostgresSaver（生产）                 │
│  └─ ai-stream.protocol.ts                                         │
│                              EventStore（新增）                      │
│  工具定义（复用）            └─ Prisma + PostgreSQL                   │
│  └─ @my-km/shared                                                 │
│                              KV Store（新增）                        │
│                              └─ LangGraph BaseStore                  │
└──────────────────────────────────────────────────────────────────────┘
```

## 数据流

### 启动 Run
```
POST /ai/threads/:threadId/runs { content, context?, concurrency?, llmConfig? }
  Controller: 校验 DTO → 设置 SSE 头 → flush
  Service.startRun():
    1. ThreadService.findOrCreate(threadId)
    2. 检查该 thread 上的并发 run（并发策略）
       - rejected: 如果存在活跃 run 则拒绝
       - interrupt: 取消已有 run，保留 checkpoint，启动新 run
       - rollback: 取消已有 run，回滚到 run 前的 checkpoint，启动新 run
    3. 构建 AppConfig 快照（不可变，从 ConfigService 读取）
    4. RunManager.createRun(threadId, runContext, appConfig)
    5. RunRecord.execute():
       a. 用 checkpointer 编译 graph（LRU 缓存）
       b. graph.stream({ messages: [userMessage] }, { configurable: { thread_id } })
       c. 对每个 graph 输出：
          - 转换为 SSE StreamEvent
          - emitEvent(): 写入 SSE 响应 + EventStore.append()
       d. 如果输出包含 tool calls：
          - RunRecord.status = 'interrupted'
          - 发射 lifecycle:interrupted
          - 等待 resume
       e. 如果没有 tool calls：
          - RunRecord.status = 'completed'
          - 发射 lifecycle:completed
       f. 出错时：
          - RunRecord.status = 'failed'
          - 发射 lifecycle:failed
       g. finalize(): 持久化 tokenUsage
```

### 恢复 Run
```
POST /ai/runs/:runId/resume { toolCallId, result }
  Controller: 校验 DTO → 设置 SSE 头 → flush
  Service.resume():
    1. RunManager.getRun(runId)
    2. 校验 run.status === 'interrupted'
    3. RunRecord.resume(toolCallId, result):
       a. 追加 tool_result 消息到状态
       b. graph.stream 用更新后的状态（checkpointer 自动加载 checkpoint）
       c. 与 execute() 相同的事件循环
```

### 并发 Run 处理
```
请求到达 thread T，而 run R1 仍在活跃：

rejected（默认）：
  → 响应 409 Conflict { message: "Run already in progress" }

interrupt：
  → R1.abort()
  → 等待 abort 完成
  → 在同一 thread 上创建 R2（checkpoint 包含 R1 的部分状态）

rollback：
  → R1.abort()
  → 回滚 checkpointer 到 R1 运行前的 checkpoint
  → 在干净的状态上创建 R2
```

## 目录结构

```
apps/server/src/ai/
  ai.module.ts                    — NestJS 模块（DI 连线）
  ai.controller.ts                — 薄控制器
  ai.service.ts                   — 业务逻辑层
  dto/
    send-message.dto.ts           — 请求 DTO（class-validator）
  types/
    ai.types.ts                   — 共享类型（LLMMessage, LLMOutput, ToolDefinition）
    run.types.ts                  — Run 相关类型（RunStatus, ConcurrencyPolicy）
    thread.types.ts               — Thread 相关类型

  thread/
    thread.service.ts             — Thread CRUD（基于 Prisma）
    thread-store.ts               — Thread 元数据存储接口

  run/
    run-manager.ts                — Run 生命周期管理
    run-record.ts                 — 单次 Run 状态 + graph 执行
    run-context.ts                — 依赖注入容器（checkpointer, store, eventStore 等）

  llm/                            — 复用（从旧代码复制）
    provider.types.ts
    provider-registry.ts
    llm-factory.ts
    llm-default-config.ts
    anthropic.provider.ts
    openai.provider.ts
    zhipu.provider.ts
    dashscope.provider.ts

  langgraph/                      — 重建（修复递归 bug）
    graphs/
      chat-graph.ts               — 支持 checkpointer 的 ChatGraph
    nodes/
      llm-node.ts                 — LLM 调用节点（修复：干净的状态处理）
      tool-node.ts                — 工具结果节点
      router-node.ts              — 条件路由
    types/
      workflow.types.ts           — 状态注解、GraphConfig

  sse/                            — 复用（从旧 platform/ 复制）
    ai-stream.protocol.ts         — SSE 事件编码（LangGraph Protocol 兼容）

  tools/                          — 复用（从旧代码复制）
    tool.types.ts
    tool-router.ts

  store/                          — 新增
    run-event-store.ts            — EventStore 接口 + Prisma 实现
    base-store.ts                 — LangGraph BaseStore 封装

  checkpointer/                   — 新增
    checkpointer-provider.ts      — 接口 + 工厂（MemorySaver / PostgresSaver）
```

## 关键实现细节

### 1. 修复无限递归 Bug

**根因**（来自 `BaseExecutor.runToolLoop()`）：
```typescript
// 旧代码（有 bug）：while 循环将累积的状态重新传入 graph.stream()
while (!done) {
  const stream = await graph.stream(initialState, { configurable });
  // initialState.toolResults 不断累积，但 graph 内部状态可能未正确重置
}
```

**修复**：不使用 while 循环。让 graph 自己的条件边自然处理 tool 循环：
```typescript
// 新代码：单次 graph.stream() 调用 — graph 通过条件边内部循环
const stream = await graph.stream(
  { messages: [userMessage] },
  { configurable: { thread_id: threadId, llmCaller, tools, onChunk } }
);
// graph 自行处理：llm_call → [tools → llm_call]* → END
// checkpointer 在每一步保存状态
```

graph 自身的 `addConditionalEdges` 已经处理了 `hasToolCalls → 'tools' → 'llm_call'`。Bug 的根因是 `BaseExecutor` 试图在外部重新驱动循环。

### 2. Checkpointer 替代 MessageStore

- **主持久化**：LangGraph Checkpointer（在每个节点转换时保存 graph 状态）
- **消息查询**：通过 `ThreadStore.getMessages(threadId)` 从 checkpointer 状态中读取
- **EventStore**：独立关注点——存储 SSE StreamEvent 用于回放/重连，不存储 graph 状态

### 3. RunContext 单例

```typescript
class RunContext {
  private graphCache = new LRUCache<string, CompiledWorkflowGraph>({ max: 10 });

  constructor(
    readonly checkpointer: BaseCheckpointSaver,
    readonly store: BaseStore,
    readonly eventStore: RunEventStore,
    readonly threadStore: ThreadStore,
  ) {}

  getCompiledGraph(configKey: string, appConfig: AppConfig): CompiledWorkflowGraph {
    const cached = this.graphCache.get(configKey);
    if (cached) return cached;

    const graph = new ChatGraph().createGraph();
    const compiled = graph.compile({ checkpointer: this.checkpointer });
    this.graphCache.set(configKey, compiled);
    return compiled;
  }
}
```

### 4. 并发策略实现

```typescript
enum ConcurrencyPolicy {
  Rejected = 'rejected',    // 存在活跃 run 时返回 409
  Interrupt = 'interrupt',  // 取消旧 run，保留 checkpoint，启动新 run
  Rollback = 'rollback',    // 取消旧 run，回滚 checkpoint，启动新 run
}

// 在 AiChatService.startRun() 中：
const activeRun = this.runManager.getActiveRunForThread(threadId);
if (activeRun) {
  switch (policy) {
    case 'rejected':
      throw new ConflictException('Run already in progress');
    case 'interrupt':
      await activeRun.abort();
      break;
    case 'rollback':
      await activeRun.abort();
      await this.runContext.checkpointer.deleteThread(threadId, activeRun.checkpointId);
      break;
  }
}
```

### 5. EventStore 数据库表

```sql
CREATE TABLE run_events (
  id          SERIAL PRIMARY KEY,
  run_id      VARCHAR(64) NOT NULL,
  thread_id   VARCHAR(64) NOT NULL,
  seq         INTEGER NOT NULL,        -- 事件序号
  event_type  VARCHAR(64) NOT NULL,    -- 'messages', 'lifecycle', 'tools', 'values', 'error'
  event_name  VARCHAR(64) NOT NULL,    -- 'content-block-delta', 'started' 等
  payload     JSONB NOT NULL,          -- 完整的事件数据
  created_at  TIMESTAMPTZ DEFAULT NOW(),

  INDEX idx_run_events_run_id (run_id, seq),
  INDEX idx_run_events_thread_id (thread_id, created_at)
);
```

## 实现顺序（TDD）

### 阶段 1：基础（测试先行）
1. **类型与接口**：`types/` 目录 — 所有类型定义
2. **ThreadService**：基于 Prisma 的 CRUD（测试：create/find/list/update/delete）
3. **ThreadStore**：元数据存储接口 + Prisma 实现（测试：CRUD）
4. **Prisma 迁移**：重命名 Room → Thread 模型（或新增 Thread 模型）

### 阶段 2：基础设施（测试先行）
5. **Checkpointer provider**：MemorySaver + PostgresSaver 工厂（测试：save/load/clear）
6. **EventStore**：Prisma 实现（测试：append/replay/getEvents/subscribe/cleanup）
7. **KV Store**：LangGraph BaseStore 封装（测试：get/set/delete/scan）
8. **LLM Providers**：从旧代码复制，验证测试通过

### 阶段 3：Graph（测试先行）
9. **修复 ChatGraph**：添加 checkpointer 支持，修复状态处理（测试：完整 run、tool 中断、多轮对话）
10. **修复 LLM Node**：干净的状态管理，无外部 while 循环（测试：文本输出、tool 调用、abort）
11. **SSE 协议**：从旧代码复制，验证编码测试通过

### 阶段 4：Run 层（测试先行）
12. **RunContext**：DI 容器 + LRU 缓存（测试：graph 编译、缓存命中/未命中）
13. **RunRecord**：核心 execute/resume/abort 逻辑（测试：正常路径、tool 中断、resume、cancel、错误）
14. **RunManager**：生命周期 + 并发控制（测试：create/get/cancel、并发模式）

### 阶段 5：Service & Controller（测试先行）
15. **AiChatService**：业务逻辑（测试：startRun、resume、cancel、错误处理）
16. **AiChatController**：薄路由层（测试：DTO 校验、SSE 头、错误响应）
17. **AiModule**：DI 连线

### 阶段 6：前端迁移
18. 更新前端传输层以适配新的 API 路由
19. E2E 测试：完整对话流程

## 删除范围

```
apps/server/src/ai/           — 整个目录删除后重建
```

**需要保留的代码（复制到新结构中）**：
- `llm/` — 所有 provider 实现、工厂、注册表
- `message/providers/` — PrismaMessageStoreProvider（作为 EventStore Prisma 模式的参考）
- `langgraph/graphs/chat-graph.ts` — graph 结构（修复而非重写）
- `langgraph/nodes/` — 节点实现（修复状态处理）
- `langgraph/types/` — 类型定义（适配）
- `platform/ai-stream.protocol.ts` — SSE 协议（复制到 `sse/`）
- `platform/tool-definitions.ts` — 前端工具定义（复制到 `tools/`）

## 现有代码复用映射

| 新模块 | 来源 | 操作 |
|--------|------|------|
| `llm/*` | 旧 `llm/*` | 原样复制 |
| `sse/ai-stream.protocol.ts` | 旧 `platform/ai-stream.protocol.ts` | 复制 |
| `tools/tool-definitions.ts` | 旧 `platform/tool-definitions.ts` | 复制 |
| `langgraph/graphs/chat-graph.ts` | 旧 `langgraph/graphs/chat-graph.ts` | 复制 + 修复 |
| `langgraph/nodes/*` | 旧 `langgraph/nodes/*` | 复制 + 修复递归 |
| `langgraph/types/workflow.types.ts` | 旧 `langgraph/types/workflow.types.ts` | 适配（room→thread） |
| `types/ai.types.ts` | 旧 `ai.types.ts` | 复制 |
| `dto/*` | 旧 `dto/*` | 为新路由重写 |
| `thread/thread.service.ts` | 旧 `conversation/room.service.ts` | 重写（Room→Thread） |

## 不在范围内

| 项目 | 延后原因 |
|------|---------|
| 多 Agent 管道（Editor→Writer） | 按用户决定删除；可基于新架构后续重建 |
| WebSocket 传输 | SSE 是主路径；WS 支持可后续添加 |
| 速率限制 | 当前 `AiRateLimiter` 可作为 NestJS guard 重新添加 |
| 流取消（AbortController） | 取消框架存在于 RunRecord.abort()；完整实现延后 |
| LangGraph 子图 | 单个 ChatGraph 足够；复杂工作流的子图后续再做 |
| 管理/监控 UI | EventStore 数据可用但无管理面板 |

## 验证方案

### 单元测试（TDD 过程中按模块运行）
```bash
cd apps/server
npm test -- --testPathPattern="ai/"
```

### 集成测试（阶段 5 完成后）
1. 使用 `MemorySaver` checkpointer 启动服务器
2. `POST /ai/threads` → 创建 thread → 验证 201
3. `POST /ai/threads/:id/runs { content: "Hello" }` → SSE 流 → 验证 lifecycle 事件
4. `POST /ai/threads/:id/runs { content: "编辑这个" }` → tool 调用中断 → 验证 `lifecycle:interrupted`
5. `POST /ai/runs/:id/resume { toolCallId, result }` → 恢复流 → 验证完成
6. `GET /ai/threads` → 验证 thread 列表包含正确元数据
7. `GET /ai/threads/:id/messages` → 验证从 checkpointer 获取的消息历史

### E2E 测试（阶段 6 完成后）
1. 前端发送消息 → SSE 流在聊天 UI 中渲染
2. Tool 调用中断 → 前端执行工具 → resume → 继续
3. 并发消息测试 → 验证 rejected/interrupt/rollback 行为
4. 网络断开 → 重连 → EventStore 回放

### 性能检查
- Graph 编译缓存命中率 > 90%
- EventStore append 延迟 < 5ms p99
- SSE 首 token 延迟 < 500ms

## 失败模式

| 代码路径 | 失败场景 | 有测试？ | 有错误处理？ | 用户影响 |
|---------|---------|---------|------------|---------|
| RunRecord.execute | LLM provider 超时 | 需要测试 | AbortSignal + lifecycle:failed | 聊天中显示错误消息 |
| RunRecord.execute | Checkpointer DB 宕机 | 需要测试 | Catch → failed 状态 | 错误 + 重试提示 |
| RunRecord.execute | Graph 无限循环 | 需要测试 | 最大迭代次数守卫 | 错误消息 |
| RunManager.createRun | 并发 Run 冲突 | 需要测试 | 并发策略 | 按策略行为 |
| RunRecord.resume | Resume 已完成的 run | 需要测试 | 状态检查 → 400 | 清晰的错误消息 |
| RunRecord.resume | Resume 过期的 run | 需要测试 | 状态检查 → 410 | 提示新 thread |
| EventStore.append | DB 写入失败 | 需要测试 | Fire-and-forget + 日志 | 静默（SSE 仍正常） |
| EventStore.replay | 未找到事件 | 需要测试 | 返回空数组 | 优雅的空状态 |
| Graph 编译 | 内存不足 | 不太可能 | LRU 淘汰 | 旧 graph 被重新编译 |

**关键缺口**：Graph 无限循环（原始 bug）必须有最大迭代次数守卫。这是第一优先级修复项。

## 并行化策略

顺序实现 — 依赖链紧密：

```
阶段 1（types + thread）→ 阶段 2（infra）→ 阶段 3（graph）→ 阶段 4（run）→ 阶段 5（service+controller）→ 阶段 6（frontend）
```

无并行车道 — 每个阶段依赖前一阶段。但在阶段 2 内，`EventStore` 和 `KV Store` 相互独立，可以在独立的 worktree 中并行。

## 完成总结

- Step 0: Scope Challenge — 范围按原样接受（重写合理）
- 架构评审：发现 6 个问题，确认 6 项决策
- 代码质量评审：发现 4 个问题，确认 4 项决策
- 测试评审：生成覆盖图，识别 68 个缺口，确认 TDD
- 性能评审：发现 1 个问题（graph 编译），确认 LRU 缓存
- 不在范围内：已记录（7 项延后）
- 现有代码复用：已记录（复用映射）
- 外部意见：已运行（Claude 子代理），12 项发现，5 个张力已解决
- 失败模式：9 个场景映射，1 个关键缺口（无限循环守卫）
- 并行化：顺序执行，无并行车道
- 完整度评分：17 项建议中 14 项选择了完整方案

## GSTACK 评审报告

| 评审 | 触发方式 | 目的 | 次数 | 状态 | 发现 |
|------|---------|------|------|------|------|
| CEO 评审 | `/plan-ceo-review` | 范围与策略 | 0 | — | — |
| Codex 评审 | `/codex review` | 独立第二意见 | 0 | — | — |
| 工程评审 | `/plan-eng-review` | 架构与测试（必须） | 19 | 有问题 | 12 个问题，1 个关键缺口（无限循环守卫） |
| 设计评审 | `/plan-design-review` | UI/UX 缺口 | 0 | — | — |
| DX 评审 | `/plan-devex-review` | 开发者体验缺口 | 0 | — | — |

- **外部意见**：Claude 子代理已运行，12 项发现，5 个跨模型张力通过 AskUserQuestion 解决
- **未解决**：0 — 全部 17 项决策已由用户确认
- **结论**：工程评审有问题但所有决策已确认 — 准备实施
