# ⚠️ 已归档 — 请参阅最新文档

> 本文档是 2026-05-06 的 AI 后端重构设计稿，已被 [backend/ai-architecture-v2.md](./backend/ai-architecture-v2.md) 替代。
> 保留此文件仅供历史参考。

---

# AI 后端架构重构设计

> 日期: 2026-05-06
> 范围: `apps/server/src/ai/` 完整重构
> 目标: 从 MVP 单类架构拆分为生产就绪的分层架构

## 1. 现状痛点

```
当前架构 (MVP):
┌─────────────────────────────────────┐
│         AiService (343 行)          │
│  ┌───────────────────────────────┐  │
│  │ LLM Provider 管理              │  │
│  │ Tool 定义管理                  │  │
│  │ WebSocket 客户端注册/推送       │  │
│  │ 消息编排 + Tool-call 循环      │  │
│  │ Prisma 持久化                  │  │
│  │ EventEmitter 工具结果路由       │  │
│  └───────────────────────────────┘  │
│         ↑ 全部塞在一个类里            │
└─────────────────────────────────────┘
         ↑
┌────────┴────────┐
│   AiGateway      │  ← 承担连接管理、abort controller、
│   (183 行)       │     工具结果路由、历史加载
└─────────────────┘

问题:
1. 单一职责违规 — AiService 同时是 provider 管理器、消息路由器、
   持久化层、客户端注册表、tool 循环编排器
2. 无 Conversation 实体 — 对话只是 conversationId 字符串分组，
   无法存储标题、状态、用户关联、创建时间等元数据
3. 工具执行在前端 — 服务端 tools/ 目录为空，tool 定义未加载
4. 无认证 — WebSocket 连接无 token 验证
5. 全局 EventEmitter — aiToolEvent 是进程级单例，跨会话可能互相干扰
6. 单 Provider — 只实现了 Anthropic，无 provider 路由能力
7. 无速率限制 / 配额管理
```

## 2. 目标架构

```
┌──────────────────────────────────────────────────────────────┐
│                      Gateway Layer (连接层)                    │
│                                                              │
│  ┌──────────────────┐    ┌─────────────────────────────┐    │
│  │  AiWsGateway     │    │  AiRestController           │    │
│  │  - WS 连接管理    │    │  - REST fallback             │    │
│  │  - JWT 认证       │    │  - 同步请求/响应              │    │
│  │  - 生命周期       │    │  - 用于非实时场景             │    │
│  └────────┬─────────┘    └──────────────┬──────────────┘    │
│           │                             │                    │
│           └─────────────┬───────────────┘                    │
│                         ▼                                    │
│              ┌──────────────────────┐                        │
│              │  ConnectionManager   │                        │
│              │  - 客户端会话注册     │                        │
│              │  - 房间/频道管理      │                        │
│              │  - 生命周期事件       │                        │
│              └──────────┬───────────┘                        │
└─────────────────────────┼───────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────┐
│                      Dispatch Layer (分发层)                   │
│                                                              │
│              ┌──────────────────────┐                        │
│              │  RequestDispatcher   │                        │
│              │  - 消息类型路由       │                        │
│              │  - 会话查找/创建      │                        │
│              │  - 请求限流           │                        │
│              │  - 上下文组装         │                        │
│              └──────────┬───────────┘                        │
└─────────────────────────┼───────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────┐
│                      AI Core Layer (AI 核心层)                 │
│                                                              │
│  ┌──────────────────────┐    ┌──────────────────────────┐   │
│  │ ConversationService  │    │ AISessionManager         │   │
│  │ - Conversation CRUD  │    │ - 会话生命周期            │   │
│  │ - 元数据管理          │    │ - 会话状态机              │   │
│  │ - 消息列表/分页       │    │ - 并发控制 (一会话一请求)  │   │
│  │ - 标题生成            │    │ - 超时/清理               │   │
│  └──────────┬───────────┘    └────────────┬─────────────┘   │
│             │                             │                   │
│             ▼                             ▼                   │
│  ┌──────────────────────┐    ┌──────────────────────────┐   │
│  │ MessageService       │◄───│  AILoopOrchestrator      │   │
│  │ - 消息持久化          │    │ - Tool-call 循环         │   │
│  │ - 历史构建            │    │ - 流式输出编排            │   │
│  │ - 上下文窗口管理      │    │ - 中断/恢复               │   │
│  │ - 分页加载            │    │ - 错误恢复                │   │
│  └──────────────────────┘    └────────────┬─────────────┘   │
│                                           │                   │
│                          ┌────────────────┼──────────────┐   │
│                          ▼                ▼               │   │
│              ┌──────────────────┐  ┌──────────────────┐   │   │
│              │ ProviderRouter   │  │ ToolExecutor     │   │   │
│              │ - 多 provider    │  │ - 服务端工具注册  │   │   │
│              │ - 模型选择       │  │ - 工具发现/发现    │   │   │
│              │ - 降级/故障转移   │  │ - 执行沙箱        │   │   │
│              │ - Token 估算     │  │ - 超时/重试       │   │   │
│              └──────────────────┘  └──────────────────┘   │   │
└────────────────────────────────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────┐
│                    Infrastructure Layer (基础设施层)           │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ Prisma/DB    │  │ Redis Cache  │  │ Event Bus        │  │
│  │ - Message    │  │ - 会话缓存    │  │ - 工具结果事件    │  │
│  │ - Conversation│ │ - Token 计数  │  │ - 状态广播        │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
└────────────────────────────────────────────────────────────┘
```

## 3. 核心实体设计

### 3.1 Conversation 实体

```prisma
model Conversation {
  id        String   @id @default(cuid())
  userId    String   // 关联用户
  title     String?  // 对话标题（可为 null，首次交互后由 AI 生成）
  status    String   @default("active")  // active | archived | deleted

  // 模型配置
  model     String?  // 覆盖默认模型
  provider  String?  // 覆盖默认 provider

  // 统计
  messageCount Int   @default(0)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  user      User       @relation(fields: [userId], references: [id], onDelete: Cascade)
  messages  Message[]

  @@index([userId])
  @@index([status])
  @@index([createdAt])
}
```

### 3.2 Message 实体（重构）

```prisma
model Message {
  id             String   @id @default(cuid())
  conversationId String
  role           String   // 'user' | 'assistant' | 'tool' | 'system'
  content        String?  @db.Text

  // Tool call 相关
  toolCalls      Json?    // [{ id, name, input }] — assistant 消息的工具调用
  toolResultId   String?  // role === 'tool' 时关联的 tool call id

  // Token 统计（用于用量追踪和上下文窗口管理）
  tokenCount     Int?
  finishReason   String?  // 'stop' | 'tool_calls' | 'length' | 'error'

  // 元数据
  metadata       Json?    // 扩展字段：model used, latency, etc.

  createdAt      DateTime @default(now())

  conversation   Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)

  @@index([conversationId])
  @@index([createdAt])
  @@index([role])
}
```

### 3.3 AISession 实体（内存态，不入库）

```typescript
/**
 * AI 会话 — 表示一个正在进行的 AI 请求
 * 内存态，不持久化，请求结束后销毁
 */
interface AISession {
  id: string;               // 会话 ID = `${clientId}:${conversationId}`
  conversationId: string;
  clientId: string;
  status: 'pending' | 'streaming' | 'waiting_tool' | 'completed' | 'error' | 'aborted';
  abortController: AbortController;
  startedAt: Date;
  lastActivityAt: Date;
}
```

## 4. 各层详细设计

### 4.1 Gateway Layer（连接层）

**职责**: 管理 WebSocket 连接生命周期、认证、消息收发

```
apps/server/src/ai/gateway/
├── ai-ws.gateway.ts        # WebSocket 网关
└── ws-connection.guard.ts  # WebSocket 认证守卫
```

**AiWsGateway**:
- `handleConnection(client)` → JWT 认证 → 注册到 ConnectionManager
- `handleDisconnect(client)` → 清理会话、中断进行中的请求
- `@SubscribeMessage('join')` → 加入 Socket.io 房间 → 加载历史
- `@SubscribeMessage('message')` → 转发给 RequestDispatcher
- `@SubscribeMessage('stop')` → 中断会话
- `@SubscribeMessage('tool_result')` → 转发给 ToolExecutor

**变化**: 不再直接调用 AiService，所有业务逻辑委托给下层的 Dispatcher。
Gateway 只负责协议层的事情。

### 4.2 Dispatch Layer（分发层）

**职责**: 消息路由、会话查找/创建、限流、上下文组装

```
apps/server/src/ai/dispatch/
├── request-dispatcher.ts    # 请求分发器
├── rate-limiter.guard.ts    # 速率限制
└── context-assembler.ts     # 上下文组装器
```

**RequestDispatcher**:
```typescript
interface DispatchContext {
  conversationId: string;
  clientId: string;
  content: string;
  context?: EditorContext;  // 编辑器上下文
  model?: string;           // 指定模型
}

class RequestDispatcher {
  // 1. 验证会话存在
  // 2. 检查并发限制（一会话同时只能一个请求）
  // 3. 检查速率限制
  // 4. 组装完整上下文（对话历史 + 编辑器上下文 + 系统提示词）
  // 5. 创建 AISession
  // 6. 调用 AILoopOrchestrator
  // 7. 清理 AISession
}
```

### 4.3 AI Core Layer（AI 核心层）

#### 4.3.1 ConversationService

```
apps/server/src/ai/conversation/
├── conversation.service.ts   # Conversation CRUD
├── conversation.types.ts     # 类型定义
└── conversation-state.ts     # 会话状态机
```

```typescript
class ConversationService {
  create(userId: string, opts?: CreateConversationOpts): Promise<Conversation>;
  findById(id: string): Promise<Conversation | null>;
  findByUserId(userId: string, opts?: ListOpts): Promise<Conversation[]>;
  updateMetadata(id: string, updates: UpdateConversationOpts): Promise<Conversation>;
  archive(id: string): Promise<void>;
  delete(id: string): Promise<void>;
  getStats(userId: string): Promise<{ total: number; active: number; tokenUsage: number }>;
}
```

#### 4.3.2 MessageService

```
apps/server/src/ai/message/
├── message.service.ts        # 消息持久化
└── message.types.ts          # 类型定义
```

```typescript
class MessageService {
  create(conversationId: string, opts: CreateMessageOpts): Promise<Message>;
  findByConversationId(conversationId: string, opts?: ListOpts): Promise<Message[]>;
  buildLLMHistory(conversationId: string, maxTokens?: number): Promise<LLMMessage[]>;
  getTokenUsage(conversationId: string): Promise<number>;
}
```

关键改进: `buildLLMHistory` 支持上下文窗口管理 — 根据 token 上限自动裁剪历史，
而不是现在的硬编码 `take: 100`。

#### 4.3.3 AISessionManager

```
apps/server/src/ai/session/
├── ai-session-manager.ts     # 会话生命周期管理
└── ai-session.types.ts       # 类型定义
```

```typescript
class AISessionManager {
  create(conversationId: string, clientId: string): AISession;
  findById(id: string): AISession | null;
  findByConversationId(conversationId: string): AISession | null;
  updateStatus(id: string, status: AISessionStatus): void;
  abort(id: string): void;
  cleanup(conversationId: string): void;
  // 心跳超时清理
  startHealthCheck(): void;
}
```

状态机:
```
pending → streaming → waiting_tool → streaming → ... → completed
  |         |             |              |
  |         └──→ aborted ←┘              └──→ error
  └──→ error
```

#### 4.3.4 AILoopOrchestrator

```
apps/server/src/ai/orchestrator/
├── ai-loop.orchestrator.ts   # Tool-call 循环编排
├── ai-loop.types.ts          # 类型定义
└── stream.handler.ts         # 流式输出处理
```

```typescript
class AILoopOrchestrator {
  constructor(
    private providerRouter: ProviderRouter,
    private toolExecutor: ToolExecutor,
    private messageService: MessageService,
    private sessionManager: AISessionManager,
  ) {}

  async execute(session: AISession, opts: LoopOpts): Promise<void>;
}
```

循环流程:
```
1. 从 MessageService 构建 LLM 历史
2. 调用 ProviderRouter.chat() 获取流
3. 流式输出 → StreamHandler 推送到客户端
4. 检测 tool_call → 暂停流，调用 ToolExecutor
5. ToolExecutor 返回结果 → 构建 tool_result 消息
6. 继续下一轮 LLM 调用
7. 无 tool_call 或 done → 结束
```

#### 4.3.5 ProviderRouter

```
apps/server/src/ai/provider/
├── provider.router.ts        # 多 provider 路由
├── provider.types.ts         # 类型定义
├── anthropic.provider.ts     # (从 llm/ 迁移)
├── openai.provider.ts        # (新增)
└── provider-registry.ts      # Provider 注册表
```

```typescript
class ProviderRouter {
  private registry: Map<string, LLMProvider>;

  register(name: string, provider: LLMProvider): void;
  select(conversation?: Conversation): LLMProvider;
  // 根据 conversation 的 model/provider 配置选择
  // 如果未指定，使用默认 provider
  // 故障时支持降级到 fallback provider
}
```

#### 4.3.6 ToolExecutor（前端执行模式）

```
apps/server/src/ai/tools/
├── tool.registry.ts          # 工具注册表（schema 管理）
├── tool.types.ts             # 类型定义
└── tool-dispatcher.ts        # 工具结果分发
```

**关键决策**: 工具执行保持在前端。服务端的 Tool 层只负责：
- 管理工具定义（schema）发送给 LLM
- 接收前端返回的 tool_result 并分发到正确的等待循环
- 验证工具返回格式

```typescript
class ToolDispatcher {
  registerSchema(handler: ToolHandler): void;
  getDefinitions(): ToolDefinition[];  // 发送给 LLM 的 schema
  waitForResults(sessionId: string, toolCalls: InFlightToolCall[], timeoutMs: number): Promise<Record<string, unknown>>;
  deliverResult(sessionId: string, toolCallId: string, result: unknown): void;
}
```

工具执行流程:
1. AILoopOrchestrator 检测到 tool_call → 通知前端（通过 ConnectionManager）
2. 前端 ToolRegistry 执行工具 → 通过 WS `tool_result` 事件回传
3. 服务端 AiGateway 收到 `tool_result` → 交给 ToolDispatcher.deliverResult()
4. ToolDispatcher 通过会话级事件通知 waitForResults() 解除阻塞
5. AILoopOrchestrator 拿到结果 → 继续下一轮

相比当前实现的改进:
- 用会话级事件替代全局 EventEmitter（避免跨会话干扰）
- 工具 schema 在服务端统一管理（当前 toolDefinitions 为空）
- 超时和错误处理更完善

### 4.4 ConnectionManager

```
apps/server/src/ai/connection/
├── connection-manager.ts     # 连接管理
└── connection.types.ts       # 类型定义
```

```typescript
class ConnectionManager {
  registerClient(clientId: string, emitter: EventEmitter): void;
  unregisterClient(clientId: string): void;
  emitToConversation(conversationId: string, event: string, data: unknown): void;
  emitToClient(clientId: string, event: string, data: unknown): void;
  getConnectedClients(conversationId: string): string[];
}
```

替代现在的 `AiService.clients` Map，提供更完善的连接管理：
- 支持同一会话多客户端（多标签页）
- 事件广播和定向推送
- 断线重连支持

## 5. 文件结构（重构后）

```
apps/server/src/ai/
├── ai.module.ts              # 模块入口（重构）
├── ai.types.ts               # 共享类型（精简）
├── ai-events.ts              # 事件总线（保留，缩小职责）
│
├── gateway/
│   ├── ai-ws.gateway.ts      # WebSocket 网关
│   └── ws-connection.guard.ts # JWT 认证守卫
│
├── dispatch/
│   ├── request-dispatcher.ts  # 请求分发
│   ├── rate-limiter.guard.ts  # 速率限制
│   └── context-assembler.ts   # 上下文组装
│
├── conversation/
│   ├── conversation.service.ts
│   ├── conversation.types.ts
│   └── conversation-state.ts
│
├── message/
│   ├── message.service.ts
│   └── message.types.ts
│
├── session/
│   ├── ai-session-manager.ts
│   └── ai-session.types.ts
│
├── orchestrator/
│   ├── ai-loop.orchestrator.ts
│   └── stream.handler.ts
│
├── provider/
│   ├── provider.router.ts
│   ├── provider-registry.ts
│   ├── provider.types.ts
│   ├── anthropic.provider.ts
│   └── openai.provider.ts          # 新增
│
├── tools/
│   ├── tool.registry.ts      # 工具 schema 注册
│   ├── tool.types.ts         # 类型定义
│   └── tool.dispatcher.ts    # 工具结果分发
│
├── connection/
│   ├── connection-manager.ts
│   └── connection.types.ts
│
├── ai.controller.ts          # REST（保留，简化）
└── dto/
    └── send-message.dto.ts   # DTO（保留）
```

## 6. 数据流

### 6.1 用户发送消息的完整流程

```
Client                    Server
  │                        │
  │─── connect(WS + JWT) ──▶│
  │                        │─── JWT Guard 验证
  │                        │─── ConnectionManager.register()
  │                        │
  │─── 'join' {convId} ────▶│
  │                        │─── ConversationService.findById()
  │                        │─── client.join(room)
  │◀─── 'history' ──────────│─── MessageService.findByConversationId()
  │                        │
  │─── 'message' {content}─▶│
  │                        │─── RequestDispatcher.dispatch()
  │                        │    ├── AISessionManager.create()
  │                        │    ├── RateLimiter.check()
  │                        │    └── ContextAssembler.assemble()
  │                        │
  │                        │─── AILoopOrchestrator.execute()
  │                        │    ├── MessageService.buildLLLMHistory()
  │                        │    ├── ProviderRouter.select().chat()
  │                        │    │
  │◀─── 'stream_chunk' ────│──── 流式输出推送
  │                        │    │
  │                        │    ├── ToolExecutor.execute()
  │                        │    │   └── 服务端执行工具
  │◀─── 'tool_call' ───────│──── (可选，通知前端 UI 展示)
  │                        │    │
  │                        │    └── 继续 LLM 循环
  │                        │
  │◀─── 'stream_done' ─────│──── 完成
  │                        │─── AISessionManager.cleanup()
```

### 6.2 关键改进点

| 方面 | 当前 (MVP) | 重构后 |
|------|-----------|--------|
| 连接认证 | 无 | JWT Guard |
| 消息路由 | Gateway 直接调 Service | Dispatcher 分发 |
| 客户端管理 | Map<conversationId, WSClient> | ConnectionManager (支持多客户端) |
| 工具执行 | 前端执行，WS 回传结果 | 前端执行，但会话级事件替代全局 EventEmitter |
| 会话管理 | 无，inline 状态 | AISessionManager（内存态 Map） |
| 对话管理 | 无 Conversation 实体 | ConversationService CRUD |
| 消息历史 | 硬编码 take: 100 | 上下文窗口管理 (token 上限) |
| Provider | 单 provider | ProviderRouter (多 provider + 降级) |
| 限流 | 无 | RateLimiter |
| 错误恢复 | 简单 catch | Orchestrator 级错误处理 |

## 7. 实施计划

### Phase 1: 基础设施（不改变现有行为）
1. 新增 Prisma Conversation 模型，跑 migration
2. 新增 MessageService（从 AiService 拆分出来）
3. 新增 ConversationService
4. 新增 AISessionManager
5. 新增 ConnectionManager

### Phase 2: 核心编排
6. 新增 ProviderRouter（迁移现有 AnthropicProvider）
7. 新增 AILoopOrchestrator（从 AiService 拆分 tool-call 循环）
8. 新增 RequestDispatcher
9. 重构 AiGateway → 委托给 Dispatcher
10. 重构 AiService → 协调各新模块

### Phase 3: 工具层
11. 新增 ToolRegistry + ToolDispatcher
12. 迁移工具定义到服务端（schema 注册）
13. 替换全局 EventEmitter 为会话级事件
14. 前端 harness 适配（工具执行逻辑不变，只调整事件协议）

### Phase 4: 增强
15. 新增 JWT WebSocket 认证
16. 新增 RateLimiter
17. 新增 OpenAI Provider
18. 新增上下文窗口管理
19. 删除旧的 REST fallback endpoint（或改为 Conversation 管理 API）

## 7.1 每个 Phase 的详细文件清单

### Phase 1 文件（5 个新文件 + 2 个修改）
| 文件 | 操作 | 说明 |
|------|------|------|
| `prisma/schema.prisma` | 修改 | 新增 Conversation 模型，修改 Message 关联 |
| `ai/conversation/conversation.service.ts` | 新增 | Conversation CRUD |
| `ai/conversation/conversation.types.ts` | 新增 | 类型定义 |
| `ai/conversation/conversation-state.ts` | 新增 | 状态枚举 |
| `ai/message/message.service.ts` | 新增 | 从 AiService 拆分 |
| `ai/message/message.types.ts` | 新增 | 类型定义 |
| `ai/session/ai-session-manager.ts` | 新增 | 会话生命周期 |
| `ai/session/ai-session.types.ts` | 新增 | 类型定义 |
| `ai/connection/connection-manager.ts` | 新增 | 连接管理 |
| `ai/connection/connection.types.ts` | 新增 | 类型定义 |
| `ai/ai.service.ts` | 修改 | 注入新服务，委托调用 |

### Phase 2 文件（4 个新文件 + 2 个修改 + 1 个迁移）
| 文件 | 操作 | 说明 |
|------|------|------|
| `ai/provider/provider.router.ts` | 新增 | 多 provider 路由 |
| `ai/provider/provider-registry.ts` | 新增 | Provider 注册表 |
| `ai/provider/provider.types.ts` | 新增 | 类型定义 |
| `ai/provider/anthropic.provider.ts` | 迁移 | 从 `llm/` 迁移 |
| `ai/provider/openai.provider.ts` | 新增 | 骨架实现 |
| `ai/orchestrator/ai-loop.orchestrator.ts` | 新增 | Tool-call 循环 |
| `ai/orchestrator/stream.handler.ts` | 新增 | 流式输出处理 |
| `ai/dispatch/request-dispatcher.ts` | 新增 | 请求分发 |
| `ai/dispatch/rate-limiter.guard.ts` | 新增 | 速率限制（骨架） |
| `ai/dispatch/context-assembler.ts` | 新增 | 上下文组装 |
| `ai/gateway/ai-ws.gateway.ts` | 新增 | 从 `ai.gateway.ts` 重构 |
| `ai/gateway/ws-connection.guard.ts` | 新增 | JWT 认证（骨架） |
| `ai/ai.gateway.ts` | 删除 | 被新 gateway 替代 |
| `ai/llm/` | 删除 | 迁移到 provider/ |

### Phase 3 文件（3 个新文件 + 2 个修改）
| 文件 | 操作 | 说明 |
|------|------|------|
| `ai/tools/tool.registry.ts` | 新增 | 工具 schema 注册 |
| `ai/tools/tool.types.ts` | 新增 | 类型定义 |
| `ai/tools/tool.dispatcher.ts` | 新增 | 工具结果分发 |
| `ai/ai-events.ts` | 修改 | 缩小职责或移除 |
| `ai/ai.service.ts` | 修改 | 使用新 ToolDispatcher |

### Phase 4 文件（3 个新文件 + 2 个修改）
| 文件 | 操作 | 说明 |
|------|------|------|
| `ai/gateway/ws-connection.guard.ts` | 新增 | JWT 认证守卫，支持 query/auth 多种 token 传递方式 |
| `ai/dispatch/rate-limiter.guard.ts` | 新增 | 内存滑动窗口限流，会话 20req/min，用户 40req/min |
| `ai/provider/openai.provider.ts` | 新增 | OpenAI SDK 流式输出 + tool call 完整实现 |
| `ai/ai.module.ts` | 修改 | 注册 AiRateLimiter，支持 AI_PROVIDER=openai |
| `ai/dispatch/request-dispatcher.ts` | 修改 | 集成 RateLimiter 检查 |

## 8. 内联 ASCII 图建议

以下文件在实现时应包含内联 ASCII 图注释:

- `ai-loop.orchestrator.ts` — tool-call 循环状态机
- `ai-session-manager.ts` — 会话状态转换图
- `message.service.ts` — buildLLMHistory 的上下文裁剪流程
- `provider.router.ts` — provider 选择和降级流程
- `request-dispatcher.ts` — 请求分发流程

## 9. 失败模式分析

| 失败场景 | 当前处理 | 重构后处理 |
|---------|---------|-----------|
| LLM API 超时 | AbortSignal 中断 | Orchestrator 级超时 + 降级 provider |
| 工具执行异常 | 前端返回 error 对象 | ToolExecutor 捕获 → 告知 LLM → 重试或报错 |
| 客户端断连 | 清理 abort controller | ConnectionManager 清理 + Session 超时 |
| 并发请求同一会话 | 未处理（可能混乱） | AISessionManager 拒绝并发请求 |
| 消息历史过长 | 硬编码 100 条 | Token 上限裁剪 |
| Tool 循环超 10 轮 | 记录 warn，结束 | Orchestrator 记录错误 + 通知客户端 |
| EventEmitter 跨会话干扰 | 可能（全局单例） | 会话级事件过滤 |

## 10. 向后兼容

- WebSocket 协议保持兼容: `join`, `message`, `stop`, `tool_result` 事件名不变
- 前端无需改动（Phase 1-3 保持兼容）
- Phase 3 时前端需要适配：工具执行从前端移到后端，前端只需展示 tool_call UI

## 11. 实现状态

| Phase | 状态 | 文件 |
|-------|------|------|
| Phase 1: 基础设施 | ✅ 完成 | Conversation/MessageService, AISessionManager, ConnectionManager |
| Phase 2: 核心编排 | ✅ 完成 | ProviderRouter, AILoopOrchestrator, RequestDispatcher, 新 Gateway |
| Phase 3: 工具层 | ✅ 完成 | ToolRegistry, ToolDispatcher, 会话级事件 |
| Phase 4: 增强 | ✅ 完成 | JWT 认证, RateLimiter, OpenAI Provider, 上下文窗口管理 |

### 已完成的具体工作

1. **Prisma Schema**: Conversation 模型已添加，Message 模型已扩展（tokenCount, finishReason, metadata）
2. **ConversationService**: CRUD 操作、列表查询、统计、消息计数
3. **MessageService**: 消息创建、历史查询、LLM 格式构建、token 裁剪
4. **AISessionManager**: 内存态会话管理、状态机、并发控制、心跳超时
5. **ConnectionManager**: 多客户端支持、事件广播、连接生命周期
6. **ProviderRouter**: 多 provider 注册和选择、故障降级
7. **AILoopOrchestrator**: Tool-call 循环、流式输出编排、错误恢复
8. **StreamHandler**: 流式输出片段处理和文本累积
9. **RequestDispatcher**: 请求分发、会话创建/查找、并发控制
10. **ToolDispatcher**: 会话级工具结果分发（替代全局 EventEmitter）
11. **ToolRegistry**: 工具 schema 注册
12. **AiGateway (重构)**: 精简为连接层，委托业务逻辑给下层
13. **AiService (重构)**: 注入新服务，所有推送改用 ConnectionManager
14. **WsConnectionGuard**: WebSocket JWT 认证守卫，支持多种 token 传递方式
15. **AiRateLimiter**: 内存滑动窗口限流，按会话/用户分级限制
16. **OpenAIProvider**: 基于 OpenAI SDK 的完整实现，支持流式输出和 tool call
17. **Provider 多后端支持**: ai.module.ts 根据 AI_PROVIDER 环境变量自动选择 Anthropic/OpenAI

### Phase 4 待完成

- **JWT Guard 接入 Gateway**: `WsConnectionGuard` 已实现但未在 `ai-ws.gateway.ts` 的 `@UseGuards()` 中启用，需要在连接生命周期生效
- **AiController 改造**: 当前仍为旧版 REST endpoint，建议改为 Conversation 管理 API
