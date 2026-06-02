# AI 对话系统重构方案 — 对齐 LangGraph Platform 协议

> **目标**: 使用 LangGraph React SDK 重构前端，后端改为对接 LangGraph Platform API 协议。
> **策略**: 从底层开始完全重构，不考虑向后兼容。
> **日期**: 2026-06-02
> **状态**: 方案评审中

---

## 0. 现状与动机

### 0.1 当前架构问题

```
当前架构（Socket.io 自定义协议）

前端                           后端 (NestJS)
  │                               │
  │  Socket.io /ai                │  本地编译 LangGraph StateGraph
  │  自定义信封格式                │  本地执行 graph.stream()
  │  text_chunk / tool_call /done │  4 个 LLM Provider 直接调用
  │  手动管理消息累积              │  手动 tool loop (max 10 轮)
  │  手动状态管理 (RoomState)     │  ToolDispatcher 等待前端结果 (30s)
  │  useSyncExternalStore 桥接    │  手动 FSM 状态机
  │                               │
  └── 800+ 行自定义通信代码 ──────┘
```

问题：
1. **协议锁定**：自定义 Socket.io 协议无法迁移到其他后端
2. **功能缺失**：无 checkpoint/分支/回溯能力，无长期记忆
3. **维护成本高**：800+ 行自定义代码覆盖消息管理、状态机、事件路由、流式累积
4. **工具调用复杂**：ToolDispatcher + ToolRouter + FSM + WS 四层嵌套
5. **无 SDK 生态**：无法享受 LangGraph 官方更新和新功能

### 0.2 目标架构

```
目标架构（LangGraph Platform + @langchain/react）

前端                            后端 (NestJS)                     LangGraph Platform
  │                                │                                    │
  │  @langchain/react              │  HTTP POST /ai/chat               │  LangGraph 图执行
  │  useStream hook                │  SSE 流式返回                      │  Thread/Run 管理
  │  FetchStreamTransport          │  ToolRouter 决策                  │  Checkpoint 持久化
  │  thread.messages / .submit     │  MessageStore 同步                │  Interrupt/Resume
  │  thread.interrupt              │  Rate Limiter                     │  LLM Provider 路由
  │                                │                                    │
  └── 50 行代码 ──────────────────┘ ─── 150 行适配器代码 ──────────────┘
```

核心优势：
- 前端代码量减少 80%（~800 行 → ~150 行）
- 内置 checkpoint/分支/回溯能力
- 内置 interrupt/resume 机制（替代自定义 tool confirmation）
- 官方 SDK 维护，持续获得新功能
- 协议标准化，可迁移到其他 LangGraph 部署

---

## 1. LangGraph Platform 协议分析

### 1.1 协议核心概念

| 概念 | 含义 | 当前对应物 |
|------|------|-----------|
| **Assistant** | 一个 LangGraph 图定义的配置 | GraphRegistry 中的 ChatGraph |
| **Thread** | 对话会话，累积状态 | Room |
| **Run** | 一次图执行（turn） | RoomSession |
| **Checkpoint** | 状态快照，支持分支 | 无（纯消息流） |
| **Interrupt** | 暂停图执行，等待外部输入 | tool_call + requiresConfirmation |
| **Command** | 恢复执行，携带结果 | tool_result |
| **Store** | 跨线程的长期记忆（KV） | 无 |

### 1.2 API 端点

```
Assistants:
  POST   /assistants          创建 Assistant
  POST   /assistants/search   搜索 Assistants

Threads:
  POST   /threads             创建 Thread
  POST   /threads/search      搜索 Threads
  GET    /threads/{id}/state  获取 Thread 状态（checkpoint）

Runs:
  POST   /threads/{id}/runs/stream    创建 Run + SSE 流式返回（核心端点）
  POST   /threads/{id}/runs/{rid}/cancel  取消 Run

Streaming (SSE 事件格式):
  event: messages     → [message, metadata] 二元组（替代 text_chunk）
  event: updates      → 节点输出（替代 status）
  event: values       → 完整状态快照
  event: error        → 错误事件
```

### 1.3 Interrupt/Resume 机制

```
Server (LangGraph Platform)                    Client (@langchain/react)
  │
  │  执行图，遇到 interrupt_before 配置的工具
  │  → 暂停图执行
  │  → 触发 __interrupt__ 事件
  │
  │◄── SSE event: error (with __interrupt__) ──│
  │     { value: { tool_name, input } }         │
  │                                             │  前端执行工具
  │                                             │
  │  POST /threads/{id}/runs/stream              │
  │  { command: { resume: { result } } }        │
  │                                             │
  │  恢复图执行                                  │
  │◄── SSE event: messages ─────────────────────│  继续流式输出
  │◄── SSE event: values (final) ───────────────│  完成
```

---

## 2. 协议映射

### 2.1 完整映射表

| 当前后端协议 | LangGraph Platform | 前端 SDK 对应 |
|-------------|-------------------|--------------|
| `POST /ai/chat` (fire-forget) | `POST /threads/{id}/runs/stream` | `thread.submit({messages: [...]})` |
| Socket.io `text_chunk` | SSE `event: messages` | `thread.messages` (自动累积) |
| Socket.io `tool_call` (requiresConfirmation) | `__interrupt__` 事件 | `thread.interrupt` |
| Socket.io `tool_result` | `POST submit` with `command.resume` | `thread.submit(undefined, {command: {resume}})` |
| Socket.io `done` (finishReason) | SSE `event: values` (final state) | `thread.isLoading → false` |
| Socket.io `error` | SSE `event: error` | `thread.error` |
| Socket.io `created` (roomId) | Thread creation response | `threadId` from submit callback |
| Socket.io `history` | `GET /threads/{id}/state` | SDK 内部恢复 |
| Socket.io `stop` | `POST /threads/{id}/runs/{rid}/cancel` | `thread.stop()` |
| Socket.io `status` | SSE `event: updates` | `thread.isLoading` / custom events |
| `roomId` (字符串) | `threadId` (字符串) | `threadId` (useStream 参数) |
| `create_and_send` | Thread + Run 自动创建 | `submit()` 无 threadId |
| `join` (加载历史) | `GET /threads/{id}/state` | SDK 内部或自定义 fetch |

### 2.2 消息格式映射

| 当前 MessageWire | LangGraph BaseMessage |
|-----------------|----------------------|
| `role: 'user'` | `type: 'human'` |
| `role: 'assistant'` | `type: 'ai'` |
| `role: 'tool'` | `type: 'tool'` |
| `role: 'system'` | `type: 'system'` |
| `content: string` | `content: string | Array<ContentBlock>` |
| `toolCalls: [{id, name}]` | `tool_calls: [{id, name, args}]` |
| `toolCallId: string` | `tool_call_id: string` |

---

## 3. 后端重构方案

### 3.1 文件变更总览

#### 删除的文件（完整移除）

```
apps/server/src/ai/ws/                              # 整个 WebSocket 层
apps/server/src/ai/langgraph/                       # 本地 graph 定义和节点
apps/server/src/ai/workflow/                        # executor, base-executor, orchestrator
apps/server/src/ai/llm/                             # 4 个 LLM Provider + 工厂
apps/server/src/ai/session/                         # RoomSession + FSM + StateMachine
apps/server/src/ai/agents/                          # 多 Agent 编排（独立功能，后续重建）
apps/server/src/ai/tools/                           # ToolDispatcher + ToolRouter
apps/server/src/ai/ai.controller.ts                 # 重写（保留 REST 端点，改 SSE）
apps/server/src/ai/ai.types.ts                      # 重写（使用 LangGraph 原生类型）
apps/server/src/ai/dispatch/request-dispatcher.ts   # 重写（改为 SSE handler）
apps/server/src/ws/                                 # 整个目录（如果仅 AI 使用）
```

#### 保留的文件（基本不变）

```
apps/server/src/ai/conversation/                    # Room CRUD，领域概念不变
apps/server/src/ai/message/                         # 消息持久化，独立于执行层
apps/server/src/ai/dispatch/rate-limiter.guard.ts   # 速率限制，可复用
apps/server/src/ai/dto/send-message.dto.ts          # 输入验证，可复用
```

#### 新建的文件

```
apps/server/src/ai/platform/
  langgraph-platform-client.ts      # LangGraph Platform SDK 客户端
  ai-chat.controller.ts             # POST /ai/chat SSE 端点
  tool-router.service.ts            # 前端工具 vs 后端工具路由

apps/server/src/ai/graphs/
  chat-graph.ts                     # LangGraph 原生图定义
  index.ts                          # barrel export

apps/server/src/ai/types/
  ai-chat.types.ts                  # 新协议类型定义
  platform.types.ts                 # LangGraph Platform 事件类型

apps/server/src/ai/message/
  checkpoint-sync.ts                # Checkpoint → MessageStore 同步
```

### 3.2 新架构数据流

```
前端 POST /ai/chat
    │
    ▼
AiChatController.handleChat()
    │
    ├─ 1. Rate limit check (复用 rate-limiter.guard.ts)
    │
    ├─ 2. 解析/创建 Thread
    │     - 如果有 roomId → 查询 Thread 映射
    │     - 否则 → LangGraphPlatformClient.createThread()
    │
    ├─ 3. 判断是否 resume（带 command）
    │     - 是 → submit 时包含 command.resume
    │     - 否 → 新建 run
    │
    ├─ 4. 调用 LangGraphPlatformClient.streamRun()
    │     - input: { messages: [{role: 'human', content: ...}] }
    │     - streamMode: ['messages', 'updates', 'values']
    │     - interruptBefore: 需要前端确认的工具列表
    │
    ├─ 5. SSE 事件映射
    │     - messages 事件 → text_chunk 语义 → 前端实时渲染
    │     - interrupt 事件 → tool_call 语义 → 前端确认
    │     - values 事件 → done 语义 → 标记完成
    │     - error 事件 → error 语义 → 错误展示
    │
    └─ 6. Run 完成后同步 Checkpoint → MessageStore
          - 确保 REST GET /rooms/:id/messages 返回最新数据
```

### 3.3 关键代码草图

#### LangGraphPlatformClient

```typescript
// apps/server/src/ai/platform/langgraph-platform-client.ts
import { Client } from '@langchain/langgraph-sdk';
import { Injectable } from '@nestjs/common';

@Injectable()
export class LangGraphPlatformClient {
  private client: Client;
  private threadIdMap = new Map<string, string>(); // roomId → threadId

  constructor(@Inject('LANGGRAPH_PLATFORM_URL') url: string) {
    this.client = new Client({ apiUrl: url });
  }

  async createThread(roomId?: string) {
    const thread = await this.client.threads.create({
      metadata: roomId ? { roomId } : {},
    });
    if (roomId) this.threadIdMap.set(roomId, thread.thread_id);
    return thread;
  }

  async getOrCreateThread(roomId: string) {
    let threadId = this.threadIdMap.get(roomId);
    if (!threadId) {
      const thread = await this.createThread(roomId);
      threadId = thread.thread_id;
    }
    return threadId;
  }

  streamRun(threadId: string, input: { messages: unknown[] }, options?: {
    assistantId?: string;
    streamMode?: string[];
    interruptBefore?: string[];
    command?: { resume?: unknown };
  }) {
    return this.client.runs.stream(threadId, options?.assistantId ?? 'agent', {
      input,
      streamMode: options?.streamMode ?? ['messages', 'updates', 'values'],
      interruptBefore: options?.interruptBefore,
      command: options?.command,
    });
  }

  async cancelRun(threadId: string, runId: string) {
    return this.client.runs.cancel(threadId, runId);
  }

  async getThreadState(threadId: string) {
    return this.client.threads.getState(threadId);
  }

  mapRoomIdToThreadId(roomId: string): string | undefined {
    return this.threadIdMap.get(roomId);
  }
}
```

#### AiChatController (SSE 端点)

```typescript
// apps/server/src/ai/platform/ai-chat.controller.ts
import { Controller, Post, Body, Sse, Param } from '@nestjs/common';
import { Observable } from 'rxjs';
import type { MessageEvent } from '@nestjs/common';

@Controller('ai')
export class AiChatController {
  // POST /ai/chat — 新建对话或发送消息，返回 SSE 流
  @Post('chat')
  @Sse()
  handleChat(@Body() dto: ChatRequestDto): Observable<MessageEvent> {
    // 1. Rate limit check
    // 2. Resolve/create thread
    // 3. Stream from LangGraph Platform
    // 4. Map SSE events to frontend-protocol-compatible events
    // 5. On completion: sync checkpoint to MessageStore
  }

  // POST /ai/chat/cancel — 取消生成
  @Post('chat/:threadId/cancel')
  async cancelChat(@Param('threadId') threadId: string) { ... }

  // 保留现有 Room CRUD 端点
  @Get('rooms') listRooms() { ... }
  @Post('rooms') createRoom() { ... }
  @Get('rooms/:id/messages') getMessages() { ... }
  @Patch('rooms/:id') updateRoom() { ... }
  @Delete('rooms/:id') deleteRoom() { ... }
}
```

#### ToolRouterService

```typescript
// apps/server/src/ai/platform/tool-router.service.ts
import { Injectable } from '@nestjs/common';

// 决定哪些工具需要前端确认执行（interrupt_before）
// 这个决策逻辑从旧架构的 ToolRouter 迁移而来
@Injectable()
export class ToolRouterService {
  // 需要前端确认的工具（这些工具操作编辑器，需在前端执行）
  private frontendTools = new Set([
    'get_document_content',
    'get_file_tree',
    'insert_text',
    'replace_text',
  ]);

  needsFrontendConfirm(toolName: string): boolean {
    return this.frontendTools.has(toolName);
  }

  // 返回 LangGraph interrupt_before 配置
  getInterruptBefore(definitions: ToolDefinition[]): string[] {
    return definitions
      .filter(d => this.needsFrontendConfirm(d.name))
      .map(d => d.name);
  }

  // 后端自动执行的工具（LLM 内置能力，不需前端参与）
  getBackendAutoExecuted(definitions: ToolDefinition[]): ToolDefinition[] {
    return definitions.filter(d => !this.needsFrontendConfirm(d.name));
  }
}
```

#### CheckpointSync

```typescript
// apps/server/src/ai/message/checkpoint-sync.ts
// Run 完成后，将 LangGraph Platform 的 checkpoint 同步到 PostgreSQL
import type { MessageStore } from '../message/message-store.interface';

export async function syncCheckpointToMessageStore(
  threadState: ReturnType<Client['threads']['getState']>,
  roomId: string,
  messageStore: MessageStore,
): Promise<void> {
  const messages = threadState.values.messages ?? [];

  for (const msg of messages) {
    // 跳过已存在的消息（通过 message ID 判断）
    if (await messageStore.exists(roomId, msg.id)) continue;

    switch (msg.type) {
      case 'human':
        await messageStore.persistUser(roomId, extractText(msg));
        break;
      case 'ai':
        await messageStore.persistAssistant(
          roomId,
          extractText(msg),
          msg.tool_calls?.map(tc => ({ id: tc.id, name: tc.name, arguments: tc.args })),
        );
        break;
      case 'tool':
        await messageStore.persistToolResult(
          roomId,
          msg.tool_call_id,
          extractText(msg),
        );
        break;
    }
  }
}
```

### 3.4 后端新文件结构

```
apps/server/src/ai/
├── ai.module.ts                    # 重写：注册 LangGraphPlatformClient + SSE controller
├── platform/
│   ├── langgraph-platform-client.ts  # LangGraph Platform SDK 客户端
│   ├── ai-chat.controller.ts         # POST /ai/chat SSE 端点
│   └── tool-router.service.ts        # 前端 vs 后端工具路由
├── graphs/
│   ├── chat-graph.ts                 # LangGraph 原生图定义
│   └── index.ts
├── types/
│   ├── ai-chat.types.ts              # ChatRequestDto, ChatResponseEvent
│   └── platform.types.ts             # LangGraph Platform 事件类型
├── message/                          # 不变
│   ├── message-store.interface.ts
│   ├── message-store.impl.ts
│   ├── message-store.types.ts
│   └── providers/
│       ├── prisma-message-store.provider.ts
│       └── jsonl-message-store.provider.ts
├── message/checkpoint-sync.ts        # 新增：Checkpoint → MessageStore
├── conversation/                     # 不变
│   ├── room.service.ts
│   ├── room.types.ts
│   └── room-state.ts
├── dispatch/
│   └── rate-limiter.guard.ts         # 不变
├── dto/
│   └── send-message.dto.ts           # 不变
└── __tests__/
    ├── ai-chat.controller.spec.ts
    ├── langgraph-platform-client.spec.ts
    ├── tool-router.service.spec.ts
    └── checkpoint-sync.spec.ts
```

---

## 4. 前端重构方案

### 4.1 文件变更总览

#### 删除的文件

```
apps/web/src/platform/ws-client/                     # 整个 Socket.io 客户端
apps/web/src/features/ai/harness/ai-harness.service.ts   # 核心编排器
apps/web/src/features/ai/harness/conversation-state.ts   # 本地消息状态
apps/web/src/features/ai/harness/tool-registry.ts        # 工具注册表
apps/web/src/features/ai/harness/context-collector.ts    # 合并到 SDK adapter
apps/web/src/features/ai/harness/tools/index.ts          # 工具实现（保留，改接口）
apps/web/src/hooks/use-ai-harness.ts                     # 替换为 useAIThread
apps/web/src/features/ai/types/ai.types.ts               # 重写类型
```

#### 保留的文件（需修改）

```
apps/web/src/components/workspace/ai-panel/            # UI 组件，替换 hook 引用
apps/web/src/features/ai/api/conversation-api.ts       # REST 调用不变
apps/web/src/platform/bootstrap.ts                     # 移除 WSClient + AIHarness 注册
```

#### 新建的文件

```
apps/web/src/features/ai/sdk/
  nest-transport.ts                # 自定义 Transport：对接 NestJS SSE 端点
  thread-context.ts                # React Context Provider 包装 useStream
  editor-context.ts                # 编辑器上下文收集（从 context-collector 迁移）

apps/web/src/features/ai/types/
  sdk.types.ts                     # 新类型定义

apps/web/src/hooks/
  use-ai-thread.ts                 # 替代 use-ai-harness.ts
```

### 4.2 useStream 使用模式

```typescript
// apps/web/src/hooks/use-ai-thread.ts
import { useStream } from '@langchain/react';
import { NestSSETransport } from '@/features/ai/sdk/nest-transport';
import { collectEditorContext } from '@/features/ai/sdk/editor-context';
import { useCallback, useMemo } from 'react';

const API_URL = process.env.NEXT_PUBLIC_AI_API_URL ?? 'http://localhost:3001';
const transport = new NestSSETransport(API_URL);

export function useAIThread() {
  const thread = useStream({
    transport,
    assistantId: 'chat-agent',
  });

  // 发送消息
  const sendMessage = useCallback(
    async (content: string) => {
      const context = collectEditorContext();
      await thread.submit(
        { messages: [{ type: 'human', content }] },
        {
          optimisticValues: (prev) => ({
            ...prev,
            messages: [...(prev.messages ?? []), { type: 'human', content }],
          }),
          metadata: { context },
        },
      );
    },
    [thread],
  );

  // 工具恢复（interrupt resume）
  const resumeWithToolResult = useCallback(
    async (result: unknown) => {
      await thread.submit(undefined, {
        command: { resume: result },
      });
    },
    [thread],
  );

  // 停止生成
  const stop = useCallback(() => {
    thread.stop();
  }, [thread]);

  return useMemo(
    () => ({
      // 状态
      messages: thread.messages,
      isStreaming: thread.isLoading,
      error: thread.error,
      interrupt: thread.interrupt,
      threadId: thread.threadId,

      // 操作
      sendMessage,
      resumeWithToolResult,
      stop,
    }),
    [thread.messages, thread.isLoading, thread.error, thread.interrupt, thread.threadId, ...],
  );
}
```

### 4.3 ai-panel.tsx 修改草图

```diff
// apps/web/src/components/workspace/ai-panel/ai-panel.tsx

- import { useAIHarness } from '@/hooks/use-ai-harness';
+ import { useAIThread } from '@/hooks/use-ai-thread';
- import { useEffect, useState, useRef, useCallback } from 'react';
+ import { useState, useRef, useCallback, useEffect } from 'react';

  const {
-   messages,
-   isGenerating,
-   isProcessing,
-   isConnected,
-   selectedText,
-   documentTitle,
-   error,
-   sendMessage,
-   stopGenerating,
-   registerTools,
+   messages,
+   isStreaming,
+   error,
+   interrupt,
+   sendMessage,
+   resumeWithToolResult,
+   stop,
  } = useAIThread();

  // 移除: WS 连接状态指示器 (isConnected)
  // 移除: isGenerating + isProcessing → 合并为 isStreaming
  // 新增: interrupt 处理（替代 tool confirmation 流程）
  // 移除: registerTools useEffect（工具通过 thread.submit config 传递）

  // 工具确认 UI（替代原来的 ToolDispatcher 等待逻辑）
+ {interrupt && (
+   <ToolConfirmation
+     toolName={interrupt.value.tool_name}
+     input={interrupt.value.input}
+     onConfirm={(result) => resumeWithToolResult(result)}
+   />
+ )}

  // 输入禁用状态
  <textarea
-   disabled={isGenerating || isProcessing}
+   disabled={isStreaming || !!interrupt}
  />

  // 停止按钮
- {isGenerating && <Button onClick={stopGenerating}>Stop</Button>}
+ {isStreaming && <Button onClick={stop}>Stop</Button>}
```

### 4.4 自定义 Transport

```typescript
// apps/web/src/features/ai/sdk/nest-transport.ts
// 自定义 Transport：将 LangGraph SDK 的请求映射到我们的 NestJS SSE 端点

export class NestSSETransport {
  constructor(private baseUrl: string) {}

  // useStream 内部调用的核心方法
  async send(
    threadId: string | null,
    input: { messages: unknown[] },
    options?: { command?: { resume?: unknown }; metadata?: Record<string, unknown> },
  ): Promise<AsyncIterable<{ event: string; data: unknown }>> {
    const response = await fetch(`${this.baseUrl}/ai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        roomId: threadId,
        messages: input.messages,
        context: options?.metadata?.context,
        command: options?.command,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    // 解析 SSE 流，yield LangGraph SDK 格式的事件
    return this.parseSSE(response.body);
  }

  private async *parseSSE(
    body: ReadableStream<Uint8Array> | null,
  ): AsyncIterable<{ event: string; data: unknown }> {
    // SSE parser: 解析 text/event-stream 格式
    // event: messages  → { event: 'messages', data: [...] }
    // event: error     → { event: 'error', data: { message, code } }
    // event: values    → { event: 'values', data: { messages: [...] } }
    // event: interrupt → { event: 'error', data: { __interrupt__: [...] } }
    ...
  }
}
```

### 4.5 前端新文件结构

```
apps/web/src/features/ai/
├── api/
│   └── conversation-api.ts              # 不变 — REST Room CRUD
├── sdk/
│   ├── nest-transport.ts                # 自定义 Transport
│   ├── editor-context.ts                # 编辑器上下文收集
│   └── thread-context.tsx               # ThreadProvider (可选)
├── types/
│   └── sdk.types.ts                     # 新类型
├── tools/
│   └── index.ts                         # 保留 — 工具实现不变
└── __tests__/
    ├── nest-transport.spec.ts
    ├── use-ai-thread.spec.ts
    └── editor-context.spec.ts

apps/web/src/hooks/
└── use-ai-thread.ts                     # 替代 use-ai-harness.ts
```

---

## 5. 实施阶段

### Phase 1: 基础设施搭建 (3-5 天)

**目标**: LangGraph Platform 运行起来，图定义正确，SSE 端点可工作

1. 部署 LangGraph Platform（Docker Compose 或 Cloud）
2. 安装依赖: `@langchain/langgraph`, `@langchain/langgraph-sdk`, `@langchain/react`, `@langchain/core`
3. 创建 `LangGraphPlatformClient` 客户端类
4. 使用 LangGraph 原生 Annotation 重写 `chat-graph.ts`
5. 创建 `ToolRouterService`
6. 验证: `curl` 测试 graph 在 Platform 上能正常执行

**验收标准**:
- [ ] LangGraph Platform 启动成功
- [ ] ChatGraph 在 Platform 上编译成功
- [ ] 发送消息后收到 SSE 流式响应

### Phase 2: 后端 SSE 端点 (3-5 天)

**目标**: `POST /ai/chat` 返回正确的 SSE 流

1. 创建 `AiChatController` 实现 `@Sse()` 端点
2. 实现 Thread 创建/映射逻辑
3. 实现 SSE 事件映射（LangGraph events → 前端兼容格式）
4. 实现 interrupt/resume 支持
5. 集成 rate limiter
6. 保留 Room CRUD 端点
7. 创建 `checkpoint-sync.ts` 同步逻辑

**验收标准**:
- [ ] `curl -N -X POST /ai/chat` 返回流式 SSE
- [ ] 中断/恢复流程正常工作
- [ ] 取消生成正常工作
- [ ] 消息同步到 PostgreSQL

### Phase 3: 前端 SDK 集成 (3-5 天)

**目标**: AIPanel 使用 `useStream` 正常工作

1. 创建 `NestSSETransport` 自定义 Transport
2. 创建 `useAIThread` hook
3. 迁移 `ContextCollector` 逻辑到 `editor-context.ts`
4. 修改 `ai-panel.tsx` 使用新 hook
5. 移除 `WSClientService`、`AIHarnessService`、`RoomState`
6. 清理 `bootstrap.ts` 中的服务注册
7. 更新 `ai/types/sdk.types.ts`

**验收标准**:
- [ ] AIPanel 可以新建对话并发送消息
- [ ] 流式文本正确显示
- [ ] 无编译错误或运行时错误

### Phase 4: 工具 Interrupt/Resume (3-5 天)

**目标**: 前端工具通过 interrupt 机制正常工作

1. 配置 `interrupt_before` 为前端工具列表
2. 前端处理 `interrupt` 事件
3. 构建 ToolConfirmation UI 组件
4. 实现 `resumeWithToolResult` 流程
5. 4 个前端工具测试通过

**验收标准**:
- [ ] get_document_content 工具正常工作
- [ ] get_file_tree 工具正常工作
- [ ] insert_text 工具正常工作
- [ ] replace_text 工具正常工作
- [ ] 工具确认后 LLM 继续生成

### Phase 5: 清理与测试 (3-5 天)

**目标**: 删除旧代码，所有测试通过

1. 删除所有标记为删除的文件
2. 移除 `socket.io` 相关依赖
3. 重写所有单元测试
4. 编写 Playwright E2E 测试
5. 全量回归测试

**验收标准**:
- [ ] 无旧代码残留
- [ ] 所有单元测试通过
- [ ] E2E 测试通过
- [ ] 无 TypeScript 编译错误
- [ ] Lint 检查通过

---

## 6. 风险评估

| 风险 | 可能性 | 影响 | 缓解措施 |
|------|--------|------|---------|
| LangGraph Platform SSE 事件格式与 SDK 期望不匹配 | 中 | 高 | 在 NestSSETransport 中做明确事件映射；写单元测试覆盖每种事件 |
| @langchain/react SDK API 不稳定（仍在快速迭代） | 中 | 中 | 锁定精确版本号；Transport 层抽象隔离变化 |
| 多个 interrupt 的时序问题（LangGraph 已知 bug） | 中 | 高 | 先用单 interrupt 流程测试；关注 github.com/langchain-ai/langgraph/issues |
| Checkpoint 同步到 MessageStore 的竞态条件 | 低 | 中 | 仅在 Run 完成后同步；SSE 做乐观 UI，DB 做确认 |
| NestJS `@Sse()` 装饰器与 LangGraph stream 兼容性 | 低 | 中 | 先用原始 `Observable<MessageEvent>` 测试，再上装饰器 |
| HTTP+SSE 相比 WebSocket 性能回退 | 低 | 低 | SSE 单向但高效；对比 p95 延迟 |
| LLM Provider 配置迁移中断 | 低 | 高 | Phase 1 验证全部 4 个 provider 在新图上工作正常 |

---

## 7. 测试策略

### 7.1 单元测试

| 测试目标 | 文件 | 覆盖内容 |
|---------|------|---------|
| LangGraph Platform 客户端 | `langgraph-platform-client.spec.ts` | Thread 创建/映射、stream 调用、cancel |
| Tool Router | `tool-router.service.spec.ts` | interrupt_before 列表生成 |
| SSE Controller | `ai-chat.controller.spec.ts` | SSE 事件发射、interrupt 处理 |
| Nest Transport | `nest-transport.spec.ts` | SSE 解析、错误处理 |
| useAIThread Hook | `use-ai-thread.spec.ts` | submit/resume/stop 回调 |
| Checkpoint Sync | `checkpoint-sync.spec.ts` | 消息类型映射、幂等写入 |

### 7.2 集成测试

| 场景 | 验证点 |
|------|--------|
| 新建对话发送消息 | 流式输出完整展示，消息正确持久化 |
| 工具调用需确认 | interrupt 触发 → 前端确认 → resume → LLM 继续 |
| 工具自动执行 | 后端工具自动完成，结果返回 LLM |
| 停止生成 | 取消 Run 后 stream 终止，状态正确 |
| 断线重连 | 页面刷新后加载历史消息正确 |
| 错误处理 | LLM 不可用时展示错误信息 |

### 7.3 E2E 测试 (Playwright)

| 测试用例 | 步骤 | 预期 |
|---------|------|------|
| 新建对话 | 输入消息 → 发送 | 看到流式响应 |
| 已有对话 | 打开对话 → 历史加载 → 发送追问 | 历史正确展示，追问正常响应 |
| 工具确认 | 发送触发前端工具的消息 | 弹出确认框 → 确认 → 看到结果 |
| 停止生成 | 开始长响应 → 点击 Stop | 生成停止，输入框恢复 |
| 错误展示 | 模拟 LLM 不可用 | 错误 toast 正确展示 |

---

## 8. NOT in scope

以下内容明确排除在本次重构之外：

| 项目 | 原因 |
|------|------|
| 多 Agent 编排 (`agents/`) | 独立功能，后续在 LangGraph Platform 上重建 |
| LangGraph Store (长期记忆) | 当前无此需求 |
| 消息编辑/重发 | 后端不支持，非需求 |
| 多模型/Provider 切换 UI | 后端支持但前端无需求 |
| SSE 以外的传输协议 | LangGraph Platform 也支持 WS，但我们只用 SSE |
| 对话搜索/过滤 UI 大改 | ConversationList 已有基础搜索 |

---

## 9. 已有代码复用分析

| 已有实现 | 是否复用 | 说明 |
|---------|---------|------|
| RoomService (Prisma CRUD) | ✅ 复用 | 领域概念不变，独立于执行层 |
| MessageStore + 所有 Provider | ✅ 复用 | 持久化层不变，仅新增 checkpoint-sync |
| RateLimiterGuard | ✅ 复用 | 独立于传输层 |
| 4 个前端工具实现 (`tools/index.ts`) | ✅ 复用 | 执行逻辑不变，仅调用方式改变 |
| Tool Schemas (`@workspace/shared/ai`) | ✅ 复用 | 工具 schema 定义不变 |
| UI 组件 (ai-panel, message-bubble, etc.) | ✅ 复用 | 仅替换 hook 引用 |
| Conversation API (REST) | ✅ 复用 | Room CRUD 不变 |
| ChatGraph 状态图结构 | ✅ 复用 | 逻辑不变，改用 LangGraph Annotation |
| DocumentMeta / EditorContext | ✅ 复用 | 概念不变，迁移到新文件 |

---

## 10. 依赖变更

### 后端 (apps/server/package.json)

```diff
# 移除
- "@langchain/langgraph": "^0.3.0"
- "@langchain/core": "^0.3.0"
- "@anthropic-ai/sdk": "^0.91.1"
- "openai": "^6.36.0"
- "@nestjs/websockets": "^11.1.19"
- "@nestjs/platform-socket.io": "^11.1.19"
- "socket.io": "^4.8.3"

# 新增
+ "@langchain/langgraph-sdk": "^1.x.x"
# LangGraph Platform 不需要额外 SDK，@langchain/langgraph-sdk 即可

# 保留
  "@nestjs/common", "@nestjs/core", "@nestjs/config"  # NestJS 框架
  "@my-km/prisma"                                      # Prisma ORM
```

### 前端 (apps/web/package.json)

```diff
# 移除
- "socket.io-client": "^4.8.3"

# 新增
+ "@langchain/react": "^0.x.x"
+ "@langchain/langgraph-sdk": "^1.x.x"
+ "@langchain/core": "^1.x.x"

# 保留
  "shared": "workspace:*"        # 工具 schema
  "lexical", "zustand", ...      # 其他依赖
```

---

## 11. 关键文件 ASCII 架构对比

### 当前架构

```
┌─────────────────────────────────────────────────────┐
│  UI Components (ai-panel, message-bubble, etc.)      │
│         ↑                                            │
│         │ useSyncExternalStore                       │
│  useAIHarness (226 行自定义 hook)                     │
│         ↑                                            │
│         │ DI container                               │
│  AIHarnessService (480 行编排器)                      │
│    ├── ContextCollector                               │
│    ├── ToolRegistry                                   │
│    ├── RoomState (消息累积/流式状态)                   │
│    └── WSClientService (socket.io-client)             │
│                    ↑                                  │
│              Socket.io WebSocket                      │
│                    ↑                                  │
│  ┌─────────────────────────────────────────────┐    │
│  │  NestJS Server                              │    │
│  │  WsGateway → MessageBus → AiMessageRouter   │    │
│  │  → RequestDispatcher → RoomOrchestrator      │    │
│  │  → Executor → BaseExecutor                   │    │
│  │    → graph.stream() (in-process)             │    │
│  │    → LLMProvider.chat() (AsyncIterable)      │    │
│  │    → ToolDispatcher.waitForResults (30s)     │    │
│  │    → MessageStore (PostgreSQL)               │    │
│  └─────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────┘

代码量: 前端 ~800 行 | 后端 ~3000 行
```

### 目标架构

```
┌─────────────────────────────────────────────────────┐
│  UI Components (ai-panel, message-bubble, etc.)      │
│         ↑                                            │
│         │ 状态来自 thread.messages / thread.isLoading │
│  useAIThread (50 行 wrapper)                          │
│    ↑                                                 │
│  @langchain/react (useStream hook)                   │
│    ↑                                                 │
│  NestSSETransport (100 行适配器)                      │
│    ↑                                                 │
│  HTTP POST + SSE                                     │
│    ↑                                                 │
│  ┌─────────────────────────────────────────────┐    │
│  │  NestJS Server                              │    │
│  │  AiChatController (@Sse())                   │    │
│  │  ├── LangGraphPlatformClient (SDK client)    │    │
│  │  ├── ToolRouterService (interrupt 决策)       │    │
│  │  └── CheckpointSync (→ MessageStore)          │    │
│  │                    ↑                         │    │
│  │              LangGraph Platform API           │    │
│  │  (图执行 / Thread管理 / Checkpoint / LLM路由)   │    │
│  └─────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────┘

代码量: 前端 ~150 行 | 后端 ~400 行
```

---

## 12. 验证清单

### Phase 1 验证
- [ ] LangGraph Platform Docker 容器启动成功
- [ ] `POST /assistants` 创建 assistant 成功
- [ ] `POST /threads` 创建 thread 成功
- [ ] `POST /threads/{id}/runs/stream` 返回 SSE 流
- [ ] 流式文本在 curl 中正确展示

### Phase 2 验证
- [ ] `POST /ai/chat` 返回 SSE 流
- [ ] SSE 事件格式正确（event: + data:）
- [ ] Interrupt 事件正确触发
- [ ] Resume 请求正确恢复执行
- [ ] Cancel 请求正确终止运行
- [ ] Rate limit 正常工作

### Phase 3 验证
- [ ] AIPanel 使用 `useAIThread` 编译通过
- [ ] 新建对话 + 发送消息 → 流式展示
- [ ] 已有对话 → 历史加载
- [ ] 停止生成按钮工作
- [ ] 错误 toast 正确展示
- [ ] 无 WSClient / AIHarness 引用残留

### Phase 4 验证
- [ ] get_document_content → interrupt → confirm → resume
- [ ] get_file_tree → interrupt → confirm → resume
- [ ] insert_text → interrupt → confirm → resume
- [ ] replace_text → interrupt → confirm → resume
- [ ] 工具结果正确返回 LLM 并继续生成

### Phase 5 验证
- [ ] 所有旧文件已删除
- [ ] `socket.io` 依赖已移除
- [ ] 所有单元测试通过
- [ ] Playwright E2E 测试通过
- [ ] `pnpm build` 成功
- [ ] `pnpm lint` 通过
- [ ] 手动端到端验证完整对话流程
