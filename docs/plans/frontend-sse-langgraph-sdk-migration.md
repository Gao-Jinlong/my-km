# 前端迁移方案：对齐 LangGraph Platform 协议 + React SDK

生成日期：2026-06-06
状态：计划中
范围：后端 API 协议对齐 + 前端 WebSocket→SSE 迁移 + useStream hook 集成

## 背景

后端已完成 Thread/Run 架构重构（`ai-backend-thread-run-architecture.md`、`run-context-per-run-snapshot-refactor.md`），使用 SSE + interrupt/resume 模式调用 AI。

但：
1. **后端 API 格式是自定义的**，不完全兼容 LangGraph Platform 标准协议
2. **前端仍有 WebSocket 遗留代码**（`WSClientService`、`AIHarnessService`）
3. **前端已有手写 SSE 客户端**（`nest-transport.ts`、`useAIThread`），但未利用 LangGraph React SDK

**目标**：改造后端 API 对齐 LangGraph Platform 标准 SSE 协议，前端使用 `@langchain/langgraph-sdk` 的 `useStream` hook，删除 WebSocket 遗留代码。

## 现状分析

### 当前前端双传输层

```
路径 A（WebSocket，legacy，未被 AIPanel 使用）:
  AIPanel ← useAIHarness ← AIHarnessService ← WSClientService ← socket.io ← 后端 WsGateway

路径 B（SSE，当前 AIPanel 使用的）:
  AIPanel ← useAIThread ← nest-transport.ts ← fetch SSE ← 后端 AiChatController
```

**AIPanel 已经在用路径 B（SSE）**。路径 A（WebSocket）是遗留代码，没有被任何活跃 UI 使用。

### 后端 API 差距分析

| 当前后端端点 | LangGraph 标准 | 差距 |
|---|---|---|
| `POST /api/v1/ai/threads` → `{id?, title?}` | `POST /threads` → `{metadata?, thread_id?}` | 请求体格式不同 |
| `GET /api/v1/ai/threads` | `POST /threads/search` → `{metadata?, limit?, offset?}` | 方法 + 格式不同 |
| `GET /api/v1/ai/threads/:id` | `GET /threads/:id` | 路径前缀 |
| `PATCH /api/v1/ai/threads/:id` → `{title?}` | `PATCH /threads/:id` → `{metadata?}` | 格式不同 |
| `DELETE /api/v1/ai/threads/:id` | `DELETE /threads/:id` | 路径前缀 |
| `GET /api/v1/ai/threads/:id/messages` | `GET /threads/:id/state` | 语义不同（消息 vs 完整状态） |
| `POST /api/v1/ai/threads/:id/runs` | `POST /threads/:id/runs/stream` | 少 `/stream` 后缀 |
| `POST /api/v1/ai/runs/:id/resume` | 通过 `runs/stream` 的 `command` 参数 | 路径和机制不同 |
| `POST /api/v1/ai/runs/:id/cancel` | `POST /threads/:tid/runs/:rid/cancel` | 路径不同 |

### SSE 事件格式差距

| 当前后端 SSE 事件 | LangGraph 标准 | 差距 |
|---|---|---|
| `event: lifecycle\ndata: {event: "started"}` | `event: metadata\ndata: {run_id: "..."}` | 格式不同 |
| `event: messages\ndata: {event: "content-block-delta", ...}` | `event: messages/tuple\ndata: [...]` | 格式不同 |
| `event: tools\ndata: {event: "tool-started", ...}` | 通过 `messages/tuple` 中 tool_call 消息表示 | 机制不同 |
| `event: values\ndata: {messages: [...]}` | `event: values\ndata: {messages: [...]}` | 格式类似 |
| `event: error\ndata: {message: "..."}` | `event: error\ndata: {error: "...", message: "..."}` | 格式略有不同 |
| 无 | `event: end\ndata: {}` | 缺少 |

## 决策汇总

| # | 决策 | 选择 |
|---|------|------|
| D1 | 迁移策略 | 改后端对齐标准协议 + 前端 useStream |
| D2 | API 路径策略 | NestJS 控制器添加 LangGraph 兼容路由（保留旧路由兼容） |
| D3 | Thread 管理 | 前端用 SDK `client.threads.*` 替换手写 `conversation-api.ts` |
| D4 | 前端状态管理 | `useStream` hook 自带状态管理，替换 `useAIThread` |
| D5 | WebSocket 清理 | 删除 `WSClientService`、`AIHarnessService`、`useAIHarness` |
| D6 | Assistant 概念 | 后端引入固定 `assistant_id = "default"` 作为 graph 标识 |

## 目标架构

```
┌─────────────────────────────────────────────────────────────────┐
│                    前端 (Next.js + React)                        │
│                                                                  │
│  AIPanel                                                         │
│    └─ useStream<{ messages: Message[] }>                        │
│         ├─ stream.messages → MessageBubble[]                    │
│         ├─ stream.isLoading → streaming indicator               │
│         ├─ stream.interrupt → tool confirm UI                   │
│         ├─ stream.submit() → send message                      │
│         ├─ stream.respond() → resume tool interrupt             │
│         └─ stream.stop() → cancel run                          │
│                                                                  │
│  ConversationList                                                │
│    └─ client.threads.search() → thread list                    │
│                                                                  │
│  Client (from @langchain/langgraph-sdk)                         │
│    ├─ client.threads.create() / .search() / .get() / .delete() │
│    └─ client.runs.stream() / .cancel()                         │
│         └─ HTTP → 后端 /threads/... /runs/...                  │
└─────────────────────────────────────────────────────────────────┘
                          │ HTTP/SSE
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                    后端 (NestJS)                                  │
│                                                                  │
│  LangGraph 兼容控制器（新增）                                     │
│    POST   /threads                           → createThread     │
│    POST   /threads/search                    → searchThreads    │
│    GET    /threads/:id                       → getThread        │
│    PATCH  /threads/:id                       → updateThread     │
│    DELETE /threads/:id                       → deleteThread     │
│    GET    /threads/:id/state                 → getThreadState   │
│    POST   /threads/:id/history               → getHistory      │
│    POST   /threads/:id/runs/stream           → startRun (SSE)  │
│    GET    /threads/:id/runs/:rid/stream      → joinStream      │
│    POST   /threads/:id/runs/:rid/cancel      → cancelRun       │
│                                                                  │
│  SSE 事件格式对齐 LangGraph Protocol                              │
│    event: metadata   → {run_id, thread_id}                      │
│    event: messages/tuple → [message_metadata, message]          │
│    event: values     → {messages: [...]}                        │
│    event: end        → {}                                        │
│    event: error      → {error, message}                         │
│                                                                  │
│  旧控制器保留（/api/v1/ai/...）用于向后兼容                       │
└─────────────────────────────────────────────────────────────────┘
```

## 实施阶段

### 阶段 1：后端 API 协议对齐（后端改）

#### 1.1 新增 LangGraph 兼容控制器

**文件**：`apps/server/src/ai/langgraph-controller.ts`（新增）

```typescript
@Controller()
export class LangGraphController {
    // Thread CRUD
    @Post('threads')
    async createThread(@Body() body: LGCreateThreadDto) { ... }

    @Post('threads/search')
    async searchThreads(@Body() body: LGSearchThreadsDto) { ... }

    @Get('threads/:threadId')
    async getThread(@Param('threadId') threadId: string) { ... }

    @Patch('threads/:threadId')
    async updateThread(...) { ... }

    @Delete('threads/:threadId')
    async deleteThread(...) { ... }

    @Get('threads/:threadId/state')
    async getThreadState(...) { ... }

    @Post('threads/:threadId/history')
    async getHistory(...) { ... }

    // Run streaming
    @Post('threads/:threadId/runs/stream')
    async streamRun(...) { ... }  // SSE — 对齐 LangGraph Protocol

    @Get('threads/:threadId/runs/:runId/stream')
    async joinStream(...) { ... }

    @Post('threads/:threadId/runs/:runId/cancel')
    async cancelRun(...) { ... }
}
```

**关键差异**：
- 控制器注册在根路径（无 `ai/` 前缀），因为 SDK 直接请求 `/threads/...`
- 使用 `@Controller()` 而非 `@Controller('ai')`
- 不走 `api/v1` 前缀 — 需要在 NestJS 中为这个控制器排除全局前缀

#### 1.2 SSE 事件格式转换

**文件**：`apps/server/src/ai/sse/langgraph-sse-encoder.ts`（新增）

```typescript
/**
 * LangGraph Protocol SSE 事件编码器
 *
 * 将内部事件转换为 LangGraph 标准 SSE 格式。
 * 参考：@langchain/langgraph-sdk 的 SSEDecoder
 *
 * 标准事件类型：
 * - metadata:  {run_id, thread_id} — 流开始时发送一次
 * - messages/tuple: [MessageMetadata, AIMessageChunk] — 消息增量
 * - values:    {messages: [...]} — 完整状态快照
 * - end:       {} — 流结束
 * - error:     {error, message} — 错误
 */
export class LangGraphSseEncoder {
    *encodeMetadata(runId: string, threadId: string): Generator<string> {
        yield `event: metadata\ndata: ${JSON.stringify({ run_id: runId, thread_id: threadId })}\n\n`;
    }

    *encodeMessageTuple(metadata: MessageMetadata, chunk: AIMessageChunk): Generator<string> {
        yield `event: messages/tuple\ndata: ${JSON.stringify([metadata, chunk])}\n\n`;
    }

    *encodeValues(state: GraphState): Generator<string> {
        yield `event: values\ndata: ${JSON.stringify(state)}\n\n`;
    }

    *encodeEnd(): Generator<string> {
        yield `event: end\ndata: {}\n\n`;
    }

    *encodeError(error: string, message: string): Generator<string> {
        yield `event: error\ndata: ${JSON.stringify({ error, message })}\n\n`;
    }
}
```

#### 1.3 全局前缀排除

**文件**：`apps/server/src/main.ts`

```typescript
// 需要让 LangGraphController 不走 api/v1 前缀
// 方案：使用 NestJS 的 exclude 或在控制器上用 @Controller({ version: ... })
// 或者：LangGraphController 走独立的路由前缀
```

**推荐方案**：让 SDK 的 `apiUrl` 指向后端的 `/api/v1`，然后在 LangGraph 兼容控制器上用 `@Controller('threads')` 注册（去掉 `ai/` 前缀）。这样 SDK 请求 `/api/v1/threads/...` 就能命中。

#### 1.4 Thread 数据格式转换

**文件**：`apps/server/src/ai/types/langgraph.types.ts`（新增）

```typescript
/**
 * LangGraph SDK 期望的 Thread 格式
 */
export interface LGThread {
    thread_id: string;
    metadata: Record<string, unknown>;
    created_at: string;
    updated_at: string;
    status: 'idle' | 'busy' | 'error';
    values: Record<string, unknown>;
}

/**
 * LangGraph SDK 期望的 ThreadState 格式
 */
export interface LGThreadState<T = Record<string, unknown>> {
    values: T;
    checkpoint: {
        checkpoint_id: string;
        thread_id: string;
        // ...其他 checkpoint 字段
    };
    metadata: Record<string, unknown>;
    created_at: string;
    parent_checkpoint?: { checkpoint_id: string };
}
```

### 阶段 2：前端 SDK 集成（前端改）

#### 2.1 SDK Client 初始化

**文件**：`apps/web/src/features/ai/sdk/langgraph-client.ts`（新增）

```typescript
import { Client } from '@langchain/langgraph-sdk';

const API_URL = process.env.NEXT_PUBLIC_LANGGRAPH_API_URL ?? 'http://localhost:3000/api/v1';

export const langgraphClient = new Client({
    apiUrl: API_URL,
    // apiKey 暂不需要（本地开发）
});

export default langgraphClient;
```

#### 2.2 AIPanel 改用 useStream

**文件**：`apps/web/src/components/workspace/ai-panel/ai-panel.tsx`

```diff
- import { useAIThread } from '@/hooks/use-ai-thread';
+ import { useStream } from '@langchain/langgraph-sdk/react';
+ import langgraphClient from '@/features/ai/sdk/langgraph-client';
+ import type { Message } from '@langchain/langgraph-sdk';

  export function AIPanel() {
-     const { messages, isStreaming, error, threadId, interrupt,
-             sendMessage, resumeWithToolResult, stop } = useAIThread();
+     const [threadId, setThreadId] = useState<string | null>(null);
+
+     const stream = useStream<{ messages: Message[] }>({
+         client: langgraphClient,
+         assistantId: 'default',
+         threadId,
+         onThreadId: (id) => setThreadId(id),
+     });
+
+     // messages: stream.messages
+     // isStreaming: stream.isLoading
+     // error: stream.error
+     // interrupt: stream.interrupt
+     // sendMessage: stream.submit({ messages: [{ type: 'human', content }] })
+     // resumeWithToolResult: stream.respond({ confirmed: true })
+     // stop: stream.stop()
  }
```

#### 2.3 ConversationList 改用 SDK

**文件**：`apps/web/src/components/workspace/ai-panel/conversation-list.tsx`

```diff
- import { listThreads, createThread } from '@/features/ai/api/conversation-api';
+ import langgraphClient from '@/features/ai/sdk/langgraph-client';

  // 在 hook 中：
- const threads = await listThreads();
+ const threads = await langgraphClient.threads.search();

- const thread = await createThread({ title });
+ const thread = await langgraphClient.threads.create({
+     metadata: { title },
+ });
```

### 阶段 3：清理遗留代码

#### 3.1 删除文件

| 文件 | 原因 |
|------|------|
| `apps/web/src/platform/ws-client/ws-client.service.ts` | WebSocket 客户端，不再需要 |
| `apps/web/src/platform/ws-client/__tests__/ws-client-protocol.test.ts` | WebSocket 测试 |
| `apps/web/src/features/ai/harness/ai-harness.service.ts` | 依赖 WebSocket 的 AI 服务 |
| `apps/web/src/features/ai/harness/conversation-state.ts` | Harness 的状态管理 |
| `apps/web/src/features/ai/harness/context-collector.ts` | Harness 的上下文收集（功能移至 AIPanel） |
| `apps/web/src/features/ai/harness/tool-registry.ts` | Harness 的工具注册 |
| `apps/web/src/features/ai/harness/index.ts` | Harness 导出 |
| `apps/web/src/hooks/use-ai-harness.ts` | WebSocket hook |
| `apps/web/src/features/ai/sdk/nest-transport.ts` | 手写 SSE 客户端，被 SDK 替代 |
| `apps/web/src/hooks/use-ai-thread.ts` | 手写 SSE hook，被 useStream 替代 |

#### 3.2 修改 bootstrap.ts

```diff
- import { createWSClientService, WSClientService } from './ws-client';
- import { type AIHarnessService, createAIHarnessService } from '../features/ai/harness/ai-harness.service';

  export interface AppServices {
-     wsClient: WSClientService;
-     aiHarness: AIHarnessService;
  }

  function createServiceContainer(): ServiceContainer {
      // ...其他服务注册...
-     const wsUrl = process.env.NEXT_PUBLIC_AI_WS_URL ?? 'http://localhost:3000/ai';
-     const wsClient = createWSClientService(wsUrl);
-     container.registerInstance(WSClientService.name, wsClient);
-     const aiHarness = createAIHarnessService(wsClient);
-     container.registerInstance('aiHarness', aiHarness);
      return container;
  }
```

#### 3.3 保留但标记为 deprecated

| 文件 | 原因 |
|------|------|
| `apps/web/src/features/ai/api/conversation-api.ts` | 保留 deprecated aliases，过渡期可用 |

#### 3.4 后端清理

- 后端的 `WsGateway` 和 `WsModule` 暂时保留（可能其他功能依赖）
- 后端的 `@nestjs/platform-socket.io` 依赖暂时保留
- 后端的 `main.ts` 中 `IoAdapter` 配置暂时保留

### 阶段 4：环境配置

#### 4.1 新增环境变量

**`.env`**：
```bash
# LangGraph SDK 指向后端 API
NEXT_PUBLIC_LANGGRAPH_API_URL=http://localhost:3000/api

# 可删除（不再需要）：
# NEXT_PUBLIC_AI_WS_URL=http://localhost:3000/ai
# NEXT_PUBLIC_AI_API_URL=http://localhost:3000
```

#### 4.2 保留兼容

`NEXT_PUBLIC_AI_API_URL` 暂时保留，`conversation-api.ts` 的 deprecated aliases 仍然使用它。

## 目录结构变更

### 新增

```
apps/server/src/ai/
  langgraph-controller.ts          — LangGraph 兼容控制器
  sse/langgraph-sse-encoder.ts     — 标准 SSE 事件编码器
  types/langgraph.types.ts         — LangGraph SDK 期望的类型

apps/web/src/features/ai/sdk/
  langgraph-client.ts              — SDK Client 初始化
  editor-context.ts                — 保留（上下文收集）
```

### 删除

```
apps/web/src/platform/ws-client/              — 整个目录
apps/web/src/features/ai/harness/             — 整个目录
apps/web/src/hooks/use-ai-harness.ts          — WebSocket hook
apps/web/src/hooks/use-ai-thread.ts           — 手写 SSE hook
apps/web/src/features/ai/sdk/nest-transport.ts — 手写 SSE 客户端
```

### 修改

```
apps/web/src/components/workspace/ai-panel/ai-panel.tsx      — 使用 useStream
apps/web/src/components/workspace/ai-panel/conversation-list.tsx — 使用 SDK client
apps/web/src/components/workspace/ai-panel/tool-setup.ts     — 移除 AIHarness 依赖
apps/web/src/platform/bootstrap.ts                           — 移除 WSClient + AIHarness
apps/server/src/ai/ai.module.ts                              — 注册 LangGraphController
```

## 关键实现细节

### 1. `runs/stream` 端点的请求体格式

LangGraph SDK 发送的请求体：
```json
{
    "input": {
        "messages": [
            { "type": "human", "content": "hello", "id": "msg-xxx" }
        ]
    },
    "assistant_id": "default",
    "stream_mode": ["values", "messages"],
    "config": {
        "configurable": {
            "model": "gpt-4o"
        }
    },
    "command": null
}
```

**Resume 的请求体**（通过同一个 `runs/stream` 端点）：
```json
{
    "input": null,
    "command": {
        "resume": { "confirmed": true }
    },
    "assistant_id": "default",
    "stream_mode": ["values", "messages"]
}
```

后端需要识别 `command.resume` 并执行恢复逻辑。

### 2. SSE 事件格式

`useStream` 使用 `stream_mode: ["values", "messages"]`（默认），期望的 SSE 事件：

```
event: metadata
data: {"run_id":"run-123","thread_id":"thread-456"}

event: messages/tuple
data: [{"run_id":"run-123","langgraph_node":"llm_call","langgraph_step":1,"langgraph_triggers":["start"]},{"id":"msg-789","type":"ai","content":[{"type":"text","text":""}]}]

event: messages/tuple
data: [{"run_id":"run-123","langgraph_node":"llm_call","langgraph_step":1,"langgraph_triggers":["stream"]},{"id":"msg-789","type":"ai","content":[{"type":"text","text":"Hello"}]}]

event: values
data: {"messages":[...]}

event: end
data: {}
```

### 3. Assistant 概念

LangGraph SDK 需要 `assistantId`。后端当前没有 assistant 概念。

**方案**：在 `LangGraphController` 中硬编码 `assistant_id = "default"`，映射到当前的 ChatGraph。如果未来需要多 graph，可以通过 assistant_id 查找不同的 graph 配置。

### 4. Thread 状态 vs Messages

当前后端有 `GET /ai/threads/:id/messages` 返回消息列表。
LangGraph 标准是 `GET /threads/:id/state` 返回完整 graph 状态（包含 messages）。

**方案**：`getThreadState` 端点从 checkpointer 读取 graph 状态，返回 `ThreadState` 格式。`values.messages` 就是消息列表。

### 5. `useStream` 的 Context 传递

当前 `useAIThread` 支持传递编辑器上下文（`context` 字段）。
`useStream.submit()` 支持 `context` 参数：

```typescript
stream.submit(
    { messages: [{ type: 'human', content: 'hello' }] },
    { context: { documentTitle: '...', selectedText: '...' } }
);
```

后端需要从 `context` 字段提取编辑器上下文。

## NOT in scope

| 项目 | 延后原因 |
|------|---------|
| 后端 WsGateway / WsModule 删除 | 可能有其他模块依赖，需要单独评估 |
| Headless tools（前端自动执行工具） | Phase 4 功能，当前只做手动确认 |
| 多 Assistant / 多 Graph | 当前只需要 default，后续扩展 |
| Thread 元数据搜索 | LangGraph 标准 search 支持按 metadata 过滤，后续实现 |
| Optimistic UI | useStream 自带 optimistic 模式，默认开启 |
| 流重连 / EventStore 回放 | useStream 的 joinStream 支持重连，后续集成 |

## 实施任务

- [ ] **T1 (P1, human: ~4h / CC: ~30min)** — 后端：新增 `LangGraphController`，实现 Thread CRUD 兼容端点
  - Files: `apps/server/src/ai/langgraph-controller.ts`, `apps/server/src/ai/types/langgraph.types.ts`
  - Verify: curl 测试 `/threads`, `/threads/search`, `/threads/:id`

- [ ] **T2 (P1, human: ~4h / CC: ~30min)** — 后端：新增 `runs/stream` 端点，实现 LangGraph SSE 事件编码
  - Files: `apps/server/src/ai/langgraph-controller.ts`, `apps/server/src/ai/sse/langgraph-sse-encoder.ts`
  - Verify: curl 测试 SSE 流，事件格式符合 SDK 期望

- [ ] **T3 (P1, human: ~2h / CC: ~15min)** — 后端：实现 `command.resume` 逻辑（替代独立的 `/runs/:id/resume` 端点）
  - Files: `apps/server/src/ai/langgraph-controller.ts`, `apps/server/src/ai/ai.service.ts`
  - Verify: tool interrupt → resume 完整流程

- [ ] **T4 (P1, human: ~2h / CC: ~15min)** — 后端：注册 LangGraphController 到 AiModule，配置路由排除全局前缀
  - Files: `apps/server/src/ai/ai.module.ts`, `apps/server/src/main.ts`
  - Verify: SDK Client 能成功调用所有端点

- [ ] **T5 (P1, human: ~2h / CC: ~15min)** — 前端：新增 `langgraph-client.ts`，配置环境变量
  - Files: `apps/web/src/features/ai/sdk/langgraph-client.ts`
  - Verify: `const client = new Client({ apiUrl }); client.threads.create()` 成功

- [ ] **T6 (P1, human: ~3h / CC: ~20min)** — 前端：AIPanel 改用 `useStream` hook
  - Files: `apps/web/src/components/workspace/ai-panel/ai-panel.tsx`
  - Verify: 发送消息 → SSE 流 → AI 回复渲染

- [ ] **T7 (P1, human: ~2h / CC: ~15min)** — 前端：ConversationList 改用 SDK `client.threads.search()`
  - Files: `apps/web/src/components/workspace/ai-panel/conversation-list.tsx`
  - Verify: thread 列表加载、新建 thread、切换 thread

- [ ] **T8 (P1, human: ~1h / CC: ~5min)** — 前端：清理 WebSocket 遗留代码
  - Files: `bootstrap.ts`, 删除 `ws-client/`, `harness/`, `use-ai-harness.ts`, `use-ai-thread.ts`, `nest-transport.ts`
  - Verify: 构建无错误，无 console 警告

- [ ] **T9 (P2, human: ~1h / CC: ~10min)** — 前端：Tool interrupt/resume UI 适配 useStream 的 `stream.interrupt` 和 `stream.respond()`
  - Files: `apps/web/src/components/workspace/ai-panel/ai-panel.tsx`
  - Verify: tool 调用中断 → 确认 → resume → 继续流

- [ ] **T10 (P2, human: ~1h / CC: ~5min)** — 前端：上下文传递适配（editorContext → `stream.submit()` 的 context 参数）
  - Files: `apps/web/src/components/workspace/ai-panel/ai-panel.tsx`
  - Verify: 带选中文本发送消息，后端收到 context

## 建议实施顺序

```
阶段 1（后端）: T1 → T2 → T3 → T4
阶段 2（前端）: T5 → T6 → T7 → T9 → T10
阶段 3（清理）: T8
```

后端和前端可以通过 worktree 并行开发，但前端需要等后端 T2 完成后才能验证。

## 验证方案

### 后端验证

```bash
# 1. 创建 thread
curl -X POST http://localhost:3000/api/threads \
  -H 'Content-Type: application/json' \
  -d '{"metadata":{"title":"Test"}}'

# 2. 搜索 threads
curl -X POST http://localhost:3000/api/threads/search \
  -H 'Content-Type: application/json' \
  -d '{"limit":10}'

# 3. Stream run
curl -X POST http://localhost:3000/api/threads/{threadId}/runs/stream \
  -H 'Content-Type: application/json' \
  -d '{"input":{"messages":[{"type":"human","content":"Hello"}]},"assistant_id":"default","stream_mode":["values","messages"]}'

# 4. 取消 run
curl -X POST http://localhost:3000/api/threads/{threadId}/runs/{runId}/cancel
```

### 前端验证

1. 打开 AIPanel → 发送消息 → AI 回复流式渲染
2. Tool 调用中断 → 确认 → Resume → 继续流
3. 切换 thread → 加载历史消息
4. 新建 thread → 发送第一条消息
5. 取消正在进行的 run
6. 网络断开重连（后续验证）

## 失败模式

| Codepath | Failure mode | Required handling |
|---|---|---|
| `runs/stream` | 后端 SSE 格式不符合 SDK 期望 | 对齐 fixture 测试 + SDK 集成测试 |
| `useStream` | `apiUrl` 配置错误 | 环境变量检查 + 连接错误 UI |
| Thread CRUD | SDK 请求格式和后端 Prisma 模型不匹配 | DTO 转换层 |
| `command.resume` | 后端不识别 resume 命令 | 在 `LangGraphController` 中正确路由 |
| 清理 WS 代码 | 其他模块引用 WSClient | 先 grep 所有引用，确保安全删除 |
| `assistantId` | 后端不支持 assistant 概念 | 硬编码 "default" + 后续扩展 |

## 完成总结

- Step 0: Scope Challenge — 范围确认（后端协议对齐 + 前端 useStream）
- Architecture Review: 3 个问题发现，2 个决策确认（路由前缀 A、去掉 v1 版本号）
- Code Quality Review: 无额外问题
- Test Review: 前端 AI 模块零测试覆盖（1 个关键缺口）
- Performance Review: 无问题（SDK 内置 TransformStream 比 hand-written buffer 更优）
- NOT in scope: 已记录（6 项延后）
- What already exists: 已记录（conversation-api.ts Thread CRUD 已部分对齐、useAIThread SSE 已能工作）
- 失败模式: 6 个场景映射
- 并行化: 后端阶段 1 + 前端阶段 2 可 worktree 并行（前端需等后端 T2 完成后验证）

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | — | — |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 4 | ISSUES_OPEN | 3 issues, 1 critical gap (zero frontend test coverage) |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | — |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

- **UNRESOLVED:** 0 — all 2 decisions confirmed (D2: route prefix, D3: remove v1)
- **VERDICT:** ENG REVIEW issues_open — 1 critical gap (zero frontend AI test coverage). All decisions confirmed. Ready to implement.
