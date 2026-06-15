# 后端 LLM 对话流程 — 前端对接文档

> 基于当前后端实现（NestJS + Socket.io + LangGraph），供前端开发对接 LLM 功能参考。
> 最后更新：2026-05-20

> **状态更新（2026-06-15）**：前端消息处理已切换为 LangGraph Platform/SSE-only。
> 新前端实现见 [前端 LangGraph Chat Runtime](../frontend/langgraph-runtime.md)。
> 本文中 Socket.io / `ClientMessage` / `ServerMessage` 自建协议内容仅作为历史背景，不再作为前端对接依据。

---

## 1. 架构概览

后端 AI 模块采用 **WebSocket 为主、REST API 为辅** 的双通道架构：

- **WebSocket（Socket.io）**：实时流式通信，前端交互的主要通道
- **REST API**：房间/消息的 CRUD 管理，辅助操作

```
┌─────────────────────────────────────────────────────────────┐
│  前端 (Frontend)                                             │
│  ┌──────────────┐    REST API (CRUD)    ┌─────────────────┐ │
│  │  Room/Msg UI │◄─────────────────────►│  AiController   │ │
│  └──────┬───────┘                        └────────┬────────┘ │
│         │  Socket.io (实时流)                      │          │
│         └──────────────────────────────────────►  │          │
├─────────┼─────────────────────────────────────────┼──────────┤
│         ▼                                         ▼          │
│  后端 (Backend)                                                │
│  ┌────────────────────┐   ┌─────────────────────────────┐    │
│  │  AiMessageRouter   │   │  AiController (REST)        │    │
│  │  ├─ CreateAndSend  │   │  ├─ POST   /ai/chat         │    │
│  │  ├─ SendMessage    │   │  ├─ GET    /ai/rooms        │    │
│  │  ├─ Join           │   │  ├─ POST   /ai/rooms        │    │
│  │  ├─ Stop           │   │  ├─ GET    /ai/rooms/:id/   │    │
│  │  └─ ToolResult     │   │  │         messages         │    │
│  └─────────┬──────────┘   │  ├─ PATCH  /ai/rooms/:id    │    │
│            │              │  └─ DELETE /ai/rooms/:id     │    │
│            ▼              └──────────────┬──────────────┘    │
│  ┌────────────────────┐                  │                   │
│  │  RequestDispatcher │◄─────────────────┘                   │
│  │  ├─ Rate Limiter   │                                      │
│  │  └─ Orchestrator   │                                      │
│  └─────────┬──────────┘                                      │
│            ▼                                                 │
│  ┌────────────────────┐    ┌─────────────────────────────┐  │
│  │  Executor          │───►│  LangGraph (ChatGraph)       │  │
│  │  ├─ Build context  │    │  START → llm_call → tools   │  │
│  │  ├─ LLM call loop  │    │  → llm_call → ... → END     │  │
│  │  └─ Tool routing   │    └─────────────────────────────┘  │
│  └────────────────────┘                                     │
│         │                      ┌─────────────────────────┐  │
│         └─────────────────────►│  LLM Providers           │  │
│                                │  ├─ Anthropic (Claude)   │  │
│                                │  ├─ OpenAI (GLM)         │  │
│                                │  ├─ Zhipu (GLM-4-Flash)  │  │
│                                │  └─ DashScope (Qwen)     │  │
│                                └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. WebSocket 对接（核心）

### 2.1 连接信息

| 参数 | 值 |
|------|-----|
| 协议 | Socket.io (v4+) |
| 命名空间 | `/ai` |
| 默认端口 | 由后端配置决定（开发环境通常 `localhost:3000`） |
| CORS | `origin: process.env.FRONTEND_URL`（默认 `http://localhost:4000`） |
| 认证 | 通过 Socket.io 的 `auth` 选项或 query string 传递 token |

**前端连接示例（TypeScript）**：

```typescript
import { io, Socket } from 'socket.io-client';

const socket: Socket = io('http://localhost:3000/ai', {
  transports: ['websocket'],
  auth: { token: 'your-auth-token' },  // 如需认证
});

socket.on('connect', () => {
  console.log('Connected, socket id:', socket.id);
});

socket.on('disconnect', () => {
  console.log('Disconnected');
});
```

### 2.2 消息传输格式

所有 WebSocket 消息使用**统一信封格式**（外层固定，内层可变）：

```typescript
// 客户端 → 服务端（发送消息）
{
  type: 'message',           // 固定值，WsGateway 只认这个
  payload: {                 // 内层业务消息
    type: 'create_and_send' | 'send_message' | 'join' | 'stop' | 'tool_result',
    payload: { ... }         // 具体业务数据，见下方各事件定义
  }
}

// 服务端 → 客户端（接收事件）
// 直接使用事件名 + 数据，无需外层信封
// socket.on('text_chunk', (data) => { ... })
```

> **关键理解**：前端发消息需要包一层 `{ type: 'message', payload: { ... } }`，但接收服务端事件时**直接使用事件名**，无需拆信封。

### 2.3 客户端消息（Client → Server）

#### 2.3.1 `create_and_send` — 创建新对话并发送首条消息

**场景**：用户点击"新建对话"并输入第一条消息。

```typescript
socket.emit('message', {
  type: 'create_and_send',
  payload: {
    content: '你好，请帮我总结一下今天的会议',
    context?: {              // 可选，编辑器上下文
      documentId: 'doc-123',
      documentTitle: '会议纪要',
      documentPath: '/docs/meeting.md',
      selectedText: '选中的文本...',
      fullContent: '完整文档内容...',
      cursorPosition: { line: 10, column: 5 },
      formatState: { bold: true, italic: false },
    },
  },
});
```

**服务端行为**：
1. 自动创建新 Room（title 取 content 前 20 字符）
2. 返回 `created` 事件，携带 `roomId`
3. 开始流式处理，返回 `text_chunk` / `tool_call` / `done` 事件

#### 2.3.2 `send_message` — 向已有对话发送消息

**场景**：用户在已有对话中继续追问。

```typescript
socket.emit('message', {
  type: 'send_message',
  payload: {
    roomId: 'cm1abc123...',   // 必需，已有对话 ID
    content: '能详细解释一下第二点吗？',
    context?: { ... },         // 可选，同上
  },
});
```

**服务端行为**：
1. 验证 Room 是否存在，不存在返回 `error`（`ROOM_NOT_FOUND`）
2. 创建新的 RoomSession（如果该 room 已有活跃 session，会拒绝）
3. 开始流式处理

#### 2.3.3 `join` — 加入对话，加载历史消息

**场景**：用户打开一个已有对话页面时，拉取历史记录。

```typescript
socket.emit('message', {
  type: 'join',
  payload: {
    roomId: 'cm1abc123...',
  },
});
```

**服务端响应**：
```typescript
// 收到 'history' 事件
socket.on('history', (data: {
  roomId: string;
  messages: MessageWire[];
}) => {
  // data.messages 格式：
  // [
  //   { id: 'msg-1', role: 'user', content: '你好', createdAt: '2026-05-20T...' },
  //   { id: 'msg-2', role: 'assistant', content: '你好！有什么可以帮你', createdAt: '...' },
  //   {
  //     id: 'msg-3',
  //     role: 'assistant',
  //     content: '正在处理...',
  //     toolCalls: [{ id: 'tc-1', name: 'search' }],
  //     createdAt: '...'
  //   },
  // ]
});
```

#### 2.3.4 `stop` — 停止当前对话的 LLM 生成

**场景**：用户点击"停止生成"按钮。

```typescript
socket.emit('message', {
  type: 'stop',
  payload: {
    roomId: 'cm1abc123...',
  },
});
```

**服务端行为**：
1. 调用 AbortController.abort()
2. FSM 转为 Done 状态
3. 返回 `done` 事件，`finishReason: 'stopped'`

#### 2.3.5 `tool_result` — 提交工具执行结果

**场景**：前端收到 `tool_call` 事件且 `requiresConfirmation: true`（或 `execution: 'frontend_direct'`），执行后返回结果。

```typescript
socket.emit('message', {
  type: 'tool_result',
  payload: {
    roomId: 'cm1abc123...',
    toolCallId: 'tc-1',      // 来自 tool_call 事件的 toolCallId
    result: { ... },          // 工具执行结果，任意 JSON 结构
  },
});
```

> **注意**：`backend + low` 类型的工具由服务端自动执行，前端无需干预。只有 `frontend_direct` 或 `frontend_confirm` 类型需要前端参与。

### 2.4 服务端事件（Server → Client）

前端通过 `socket.on(eventName, callback)` 监听以下事件：

#### 2.4.1 `created` — 对话已创建

```typescript
socket.on('created', (data: { roomId: string }) => {
  // 更新 URL 路由到 /chat/{data.roomId}
  console.log('New room created:', data.roomId);
});
```

#### 2.4.2 `history` — 历史消息

见上方 `join` 的响应示例。

#### 2.4.3 `text_chunk` — 流式文本片段

```typescript
socket.on('text_chunk', (data: {
  roomId: string;
  content: string;            // 增量文本片段
}) => {
  // 追加到当前 assistant 消息的末尾
  appendToAssistantMessage(data.content);
});
```

#### 2.4.4 `tool_call` — 工具调用

```typescript
socket.on('tool_call', (data: {
  roomId: string;
  toolCallId: string;
  toolName: string;
  input: unknown;             // 工具入参
  requiresConfirmation: boolean;  // true = 需要前端确认/执行
}) => {
  if (data.requiresConfirmation) {
    // 弹出确认对话框，用户确认后执行工具，然后通过 tool_result 返回结果
    showToolConfirmation(data).then(userResult => {
      socket.emit('message', {
        type: 'tool_result',
        payload: {
          roomId: data.roomId,
          toolCallId: data.toolCallId,
          result: userResult,
        },
      });
    });
  }
});
```

#### 2.4.5 `status` — 状态变更通知

```typescript
socket.on('status', (data: {
  roomId: string;
  status: 'thinking' | 'tool_executing' | 'generating';
  message?: string;           // 可选的人类可读描述
}) => {
  // 更新 UI 状态指示器
  updateStatusIndicator(data.status);
});
```

#### 2.4.6 `done` — LLM 生成完成

```typescript
socket.on('done', (data: {
  roomId: string;
  finishReason: 'complete' | 'max_turns' | 'stopped' | 'error' | 'interrupted';
  error?: string;             // 仅当 finishReason === 'error' 时有值
}) => {
  // 标记 assistant 消息为完成状态
  markAssistantMessageDone(data);
});
```

#### 2.4.7 `error` — 错误事件

```typescript
socket.on('error', (data: {
  roomId: string;
  code: 'ROOM_NOT_FOUND' | 'LLM_UNAVAILABLE' | 'LLM_TIMEOUT' | 'TOOL_TIMEOUT' | 'TOOL_EXECUTION_ERROR' | 'ROOM_BUSY';
  message: string;            // 人类可读的错误描述
}) => {
  showErrorToast(data.message);
});
```

### 2.5 MessageWire 格式（历史消息）

```typescript
interface MessageWire {
  id: string;                           // 消息唯一 ID
  role: 'user' | 'assistant' | 'tool' | 'system';
  content: string | null;               // 文本内容
  toolCalls?: Array<{                   // assistant 角色的工具调用摘要
    id: string;
    name: string;
  }>;
  toolCallId?: string;                  // tool 角色关联的工具调用 ID
  createdAt: string;                    // ISO 8601 时间戳
}
```

---

## 3. REST API 对接（辅助）

所有 REST 接口位于 `/ai` 前缀下。

### 3.1 发送消息（REST 方式）

```
POST /ai/chat
Content-Type: application/json

{
  "roomId": "cm1abc123...",  // 可选，不传则自动创建
  "content": "你好",
  "context": { ... }         // 可选
}

// 响应
{
  "success": true,
  "roomId": "cm1abc123..."
}
```

> **注意**：REST 方式不返回流式内容，只返回 roomId。流式响应通过 WebSocket 推送。如果前端仅使用 REST，无法获得 LLM 的实时流式输出。

### 3.2 获取对话列表

```
GET /ai/rooms?limit=50&offset=0&status=active

// 响应
{
  "rooms": [
    {
      "id": "cm1abc123...",
      "userId": null,
      "title": "会议总结",
      "status": "active",
      "model": null,
      "provider": null,
      "messageCount": 5,
      "createdAt": "2026-05-20T10:00:00.000Z",
      "updatedAt": "2026-05-20T10:05:00.000Z"
    }
  ],
  "limit": 50,
  "offset": 0
}
```

### 3.3 创建对话

```
POST /ai/rooms
Content-Type: application/json

{
  "id": "custom-id",      // 可选，自定义 ID
  "title": "新对话标题"
}

// 响应
{ "room": { ... } }
```

### 3.4 获取消息历史

```
GET /ai/rooms/:id/messages?limit=100&offset=0

// 响应
{
  "messages": [
    {
      "id": "msg-1",
      "roomId": "cm1abc123...",
      "role": "user",
      "content": "你好",
      "toolCalls": null,
      "toolResultId": null,
      "tokenCount": 2,
      "finishReason": null,
      "metadata": null,
      "createdAt": "2026-05-20T10:00:00.000Z"
    }
  ],
  "limit": 100,
  "offset": 0
}
```

### 3.5 更新对话元数据

```
PATCH /ai/rooms/:id
Content-Type: application/json

{
  "title": "新的对话标题"
}

// 响应
{ "room": { ... } }
```

### 3.6 删除对话（软删除）

```
DELETE /ai/rooms/:id

// 响应
{ "success": true }
```

---

## 4. 完整交互流程

### 4.1 新建对话并发送消息

```
前端                                    后端
 │                                       │
 │  连接 Socket.io /ai 命名空间            │
 ├──────────────────────────────────────►│
 │                                       │
 │  message {                            │
 │    type: 'create_and_send'             │
 │    payload: { content: '你好' }        │
 │  }                                    │
 ├──────────────────────────────────────►│
 │                                       │ 自动创建 Room
 │  ◄─ created { roomId: 'cm1...' }      │
 │                                       │ 开始处理
 │  ◄─ status { status: 'thinking' }     │
 │  ◄─ text_chunk { content: '你' }      │
 │  ◄─ text_chunk { content: '好' }      │  流式输出
 │  ◄─ text_chunk { content: '！' }      │
 │  ◄─ done { finishReason: 'complete' } │
 │                                       │
 │  （用户继续追问）                        │
 │  message {                            │
 │    type: 'send_message'               │
 │    payload: { roomId, content: '...' } │
 │  }                                    │
 ├──────────────────────────────────────►│
 │                                       │
 │  ◄─ status { status: 'thinking' }     │
 │  ◄─ text_chunk { content: '...' }     │
 │  ◄─ done { finishReason: 'complete' } │
 │                                       │
```

### 4.2 工具调用流程（前端参与型）

```
前端                                    后端
 │                                       │
 │  message { type: 'send_message', ... } │
 ├──────────────────────────────────────►│
 │                                       │
 │  ◄─ status { status: 'thinking' }     │
 │  ◄─ text_chunk { content: '我正在' }  │
 │  ◄─ text_chunk { content: '搜索...' } │
 │                                       │
 │  ◄─ status { status: 'tool_executing' }│
 │  ◄─ tool_call {                       │
 │       toolName: 'search',             │
 │       input: { query: '...' },        │
 │       requiresConfirmation: true      │
 │     }                                 │
 │                                       │
 │  （前端展示确认弹窗，用户确认）            │
 │  message {                            │
 │    type: 'tool_result',               │
 │    payload: {                         │
 │      roomId, toolCallId,              │
 │      result: { results: [...] }       │
 │    }                                  │
 │  }                                    │
 ├──────────────────────────────────────►│
 │                                       │
 │  ◄─ status { status: 'generating' }   │
 │  ◄─ text_chunk { content: '根据搜索' } │
 │  ◄─ text_chunk { content: '结果...' } │
 │  ◄─ done { finishReason: 'complete' } │
 │                                       │
```

### 4.3 停止生成流程

```
前端                                    后端
 │                                       │
 │  （LLM 正在流式输出中...）              │
 │                                       │
 │  message {                            │
 │    type: 'stop',                      │
 │    payload: { roomId }                │
 │  }                                    │
 ├──────────────────────────────────────►│
 │                                       │ AbortController.abort()
 │  ◄─ done { finishReason: 'stopped' }  │
 │                                       │
```

### 4.4 断线重连流程

```
前端                                    后端
 │                                       │
 │  （Socket 连接断开）                   │
 │                                       │ 自动清理该 client 的所有 session
 │                                       │
 │  （重新连接）                          │
 ├──────────────────────────────────────►│
 │                                       │
 │  message {                            │
 │    type: 'join',                      │
 │    payload: { roomId }                │
 │  }                                    │
 ├──────────────────────────────────────►│
 │                                       │
 │  ◄─ history { messages: [...] }       │ 返回持久化的历史消息
 │                                       │
```

---

## 5. 状态机（FSM）

后端为每个 Room 维护一个状态机，前端可通过 `status` 事件感知当前状态：

```
Idle ──receiveMessage──► BuildingContext ──► Processing
                                                         │
                        ┌────────────────────────────────┤
                        ▼                                ▼
                   ToolWaiting ◄──tool call─── ToolExecuting
                        │                                │
                        └────wait for result─────────────┘
                                                         │
                        ┌────────────────────────────────┤
                        ▼                                ▼
                      Done ◄────error/stop/complete──────┘
```

| 状态 | 含义 | 前端表现 |
|------|------|---------|
| `Idle` | 空闲，无活跃 session | 输入框可用 |
| `BuildingContext` | 正在构建上下文 | 显示加载中 |
| `Processing` | LLM 正在生成回复 | 流式接收文本 |
| `ToolWaiting` | 等待前端返回工具结果 | 展示工具确认 UI |
| `ToolExecuting` | 工具正在执行 | 显示"正在执行操作..." |
| `Done` | 本次请求结束 | 输入框恢复可用 |

**并发约束**：每个 Room 同一时间只能有一个活跃 Session。如果前端对一个正在处理中的 Room 再次发送 `send_message`，后端会返回 `error`（`ROOM_BUSY`）。

---

## 6. 错误码参考

| 错误码 | 触发场景 | 前端处理建议 |
|--------|---------|-------------|
| `ROOM_NOT_FOUND` | 向不存在的 roomId 发消息 | 提示用户对话已删除，返回列表 |
| `LLM_UNAVAILABLE` | 所有 LLM Provider 未配置/未启动 | 提示服务不可用 |
| `LLM_TIMEOUT` | LLM API 响应超时 | 提示超时，允许重试 |
| `TOOL_TIMEOUT` | 工具执行超时（默认 30s） | 提示操作超时 |
| `TOOL_EXECUTION_ERROR` | 工具执行出错 | 展示错误信息 |
| `ROOM_BUSY` | Room 已有活跃 Session | 禁用输入框，等待完成 |

---

## 7. 速率限制

- **会话级**：每 60 秒最多 20 条消息
- **用户级**：每 60 秒最多 40 条消息（跨会话聚合）
- 超限后请求被拒绝，前端应展示"操作过于频繁，请稍后重试"提示

---

## 8. 工具路由决策矩阵

后端根据工具的 `execution` 和 `danger` 属性决定前端参与程度：

| execution | danger | mode | 前端行为 |
|-----------|--------|------|---------|
| `backend` | `low` | `auto_execute` | 无感知，服务端自动执行 |
| `backend` | `high` | `frontend_confirm` | 弹出确认框，用户确认后执行 |
| `frontend` | 任意 | `frontend_direct` | 前端直接执行，返回结果 |

---

## 9. 前端对接清单

### 9.1 必须实现

- [ ] Socket.io 连接到 `/ai` 命名空间
- [ ] 发送 `create_and_send` 创建新对话
- [ ] 发送 `send_message` 向已有对话发消息
- [ ] 监听 `text_chunk` 实现流式渲染
- [ ] 监听 `done` 标记消息完成
- [ ] 监听 `error` 展示错误提示
- [ ] 发送 `stop` 停止生成
- [ ] 发送 `join` 加载历史消息
- [ ] 处理 `tool_call`（`requiresConfirmation: true` 时弹出确认框）
- [ ] 发送 `tool_result` 返回工具结果

### 9.2 建议实现

- [ ] 监听 `status` 展示状态指示器
- [ ] 监听 `created` 自动跳转路由
- [ ] Socket 断线重连机制
- [ ] 重连后自动 `join` 当前 Room 恢复历史
- [ ] `ROOM_BUSY` 时禁用输入框
- [ ] 速率限制超限提示

### 9.3 REST 接口使用

- [ ] `GET /ai/rooms` — 对话列表页
- [ ] `GET /ai/rooms/:id/messages` — 对话详情页初始化（或优先用 `join`）
- [ ] `PATCH /ai/rooms/:id` — 修改对话标题
- [ ] `DELETE /ai/rooms/:id` — 删除对话

---

## 10. 关键约束

1. **一个 Room 同时只能一个活跃 Session**：发送消息前需确保该 Room 当前没有正在进行的 LLM 调用
2. **Session 在第一条消息时创建，非连接时**：不需要预先 `create` Room，直接 `create_and_send` 即可
3. **流式内容只通过 WebSocket**：REST 的 `/ai/chat` 不返回流式内容，流式文本全部通过 `text_chunk` 事件推送
4. **工具结果超时 30 秒**：如果前端 30 秒内未返回 `tool_result`，后端会超时并可能终止对话
5. **EditorContext 是可选的**：如果前端不是编辑器类应用，可以省略 `context` 字段
6. **断开连接自动清理**：Socket 断开时，后端自动销毁该 client 关联的所有 Room Session

---

## 11. 数据模型

### Room

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string (cuid) | 唯一标识 |
| `userId` | string \| null | 关联用户（可选） |
| `title` | string \| null | 标题（自动取首条消息前 20 字符） |
| `status` | string | `active` \| `archived` \| `deleted` |
| `model` | string \| null | 覆盖默认模型 |
| `provider` | string \| null | 覆盖默认 Provider |
| `messageCount` | number | 消息数量 |
| `createdAt` | datetime | 创建时间 |
| `updatedAt` | datetime | 更新时间 |

### Message

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string (cuid) | 唯一标识 |
| `roomId` | string | 所属对话 |
| `role` | string | `user` \| `assistant` \| `tool` \| `system` |
| `content` | string \| null | 文本内容 |
| `toolCalls` | JSON \| null | `[{ id, name }]` 工具调用摘要 |
| `toolResultId` | string \| null | tool 消息关联的 tool call id |
| `tokenCount` | number \| null | Token 数 |
| `finishReason` | string \| null | `stop` \| `tool_calls` \| `length` \| `error` |
| `metadata` | JSON \| null | 扩展字段（模型、延迟等） |
| `createdAt` | datetime | 创建时间 |
