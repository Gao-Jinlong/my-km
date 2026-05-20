# 前端对话模块重构方案 — 对齐后端 LLM 协议

> 基于 `docs/backend/llm-integration-guide.md` 的后端协议文档，对比当前前端实现，
> 制定迭代重构方案。目标：让前端完整匹配后端协议，消除协议差异，补齐缺失功能。
>
> 最后更新：2026-05-20

---

## 0. 现状评估

### 已对齐部分（不需要改动）

| 协议项 | 前端实现 | 状态 |
|--------|---------|------|
| WebSocket 信封格式 `{ type: 'message', payload: { ... } }` | `ws-client.service.ts` 正确包裹 | ✅ 已对齐 |
| `create_and_send` 客户端消息 | `sendCreateAndSend()` | ✅ 已对齐 |
| `send_message` 客户端消息 | `sendMessage()` | ✅ 已对齐 |
| `join` 客户端消息 | `joinRoom()` / `sendJoin()` | ✅ 已对齐 |
| `stop` 客户端消息 | `stopGenerating()` | ✅ 已对齐 |
| `created` 服务端事件 | Harness 订阅 + `setRoomId` | ✅ 已对齐 |
| `history` 服务端事件 | Harness 订阅 + `setHistory()` | ✅ 已对齐 |
| `text_chunk` 服务端事件 | Harness 订阅 + `appendStreamChunk()` | ✅ 已对齐 |
| REST 房间 CRUD | `conversation-api.ts` 5 个端点 | ✅ 已对齐 |
| 自动重连 / idle-disconnect | `ws-client.service.ts` 30s idle timer | ✅ 已对齐 |
| 工具注册/执行架构 | `tool-registry.ts` + 4 个内置工具 | ✅ 已对齐 |
| 流式消息累积渲染 | `useSyncExternalStore` + `onStreamChunk` | ✅ 已对齐 |

### 发现的问题（按优先级排序）

| # | 优先级 | 问题 | 影响 |
|---|--------|------|------|
| 1 | **P0** | Tool handler 忽略 `requiresConfirmation` 和 `input` | 高危工具无需确认，参数丢失 |
| 2 | **P0** | AI WS 默认端口 3001，后端实际 3000 | 无法连接 |
| 3 | **P1** | `finishReason` 类型不匹配：后端 `'stop'` vs 前端期望 `'stopped'` | 用户停止后状态异常 |
| 4 | **P1** | `MessageRecord.role` 缺少 `'tool'` | 历史加载时工具消息角色类型错误 |
| 5 | **P1** | Tool result 发送多余 `error` 字段 | 后端类型不定义此字段 |
| 6 | **P2** | `status` 事件已订阅但未用于 UI | 用户看不到 thinking/tool_executing 状态指示 |
| 7 | **P2** | `error` 事件无 UI 展示 | 错误静默失败 |
| 8 | **P2** | 未处理 `ROOM_BUSY` 错误码 | Room 繁忙时用户可重复发送 |
| 9 | **P2** | `onDone` 清理 `activeRoomId` 过早 | 对话结束后无法恢复 |
| 10 | **P3** | 消息纯文本无 Markdown 渲染 | AI 回复格式差 |
| 11 | **P3** | 无流式光标动画 | 生成体验生硬 |
| 12 | **P3** | `connect()` / `disconnect()` 是 no-op | API 设计误导 |

---

## 1. 重构架构

### 1.1 总体策略

采用**渐进式重构**（Strangler Fig），不推翻重写。每个改动独立可验证，按优先级分 3 轮迭代：

```
┌─────────────────────────────────────────────────────┐
│  Phase 1: 协议修复（P0 + P1）— 让前后端协议完全对齐    │
│  Phase 2: 用户体验（P2）— 错误处理、状态指示、BUSY     │
│  Phase 3: 体验增强（P3）— Markdown、光标动画、API 清理 │
└─────────────────────────────────────────────────────┘
```

### 1.2 改动范围概览

```
Phase 1 (协议修复)
  ├── ws-client.service.ts      — 默认端口 3000
  ├── ai-harness.service.ts     — tool handler 完整实现
  ├── conversation-state.ts     — finishReason 映射 + tool role
  ├── ai.types.ts               — ServerMessage 类型修正
  └── conversation-api.ts       — MessageRecord.role 补充 'tool'

Phase 2 (用户体验)
  ├── ai-panel.tsx              — status 指示器 + 错误展示 + BUSY 禁用
  ├── use-ai-harness.ts         — 暴露 onStatus/onError/onDone 状态
  └── ai-harness.service.ts     — done 不主动清 activeRoomId

Phase 3 (体验增强)
  ├── message-bubble.tsx        — Markdown 渲染 + 光标动画
  ├── use-ai-harness.ts         — 移除 connect/disconnect no-op
  └── ai-harness.service.ts     — 移除 connect/disconnect no-op
```

---

## 2. Phase 1: 协议修复

### 2.1 修复 Tool Handler（P0）

**文件**: `ai-harness.service.ts` 行 229-249

**当前问题**:
```typescript
// 当前代码 — 忽略 requiresConfirmation 和 input
const result = await this._toolRegistry.execute(msg.name, {});
```

**后端协议**: `tool_call` 事件携带 `requiresConfirmation: boolean` 和 `input: unknown`。
- `requiresConfirmation: true` — 弹出确认框，用户确认后执行
- `requiresConfirmation: false` — 自动执行，但需传递 `input` 参数

**改动方案**:

```
收到 tool_call 事件
    │
    ├─ requiresConfirmation === true
    │   → 暂停，触发 UI 确认对话框
    │   → 用户确认 → 执行工具（传入 input）
    │   → 发送 tool_result
    │
    └─ requiresConfirmation === false
        → 直接执行工具（传入 input）
        → 发送 tool_result
```

**新增状态**: `RoomState` 需要一个 `pendingToolCall` 字段来持有待确认的工具调用信息。

**改动文件**:
1. `conversation-state.ts` — 新增 `pendingToolCall` 状态 + `setPendingToolCall()` / `clearPendingToolCall()`
2. `ai-harness.service.ts` — 重写 `_setupToolCallHandler()`，拆分 auto-execute 和 confirm-needed 两条路径
3. `ai.types.ts` — 新增 `PendingToolCall` 类型
4. `use-ai-harness.ts` — 暴露 `pendingToolCall` 和 `confirmTool()` / `rejectTool()` 方法
5. `ai-panel.tsx` — 渲染确认对话框

### 2.2 修复默认端口（P0）

**文件**: `bootstrap.ts` 行 78

**当前**:
```typescript
const wsUrl = process.env.NEXT_PUBLIC_AI_WS_URL ?? 'http://localhost:3001/ai';
const apiUrl = process.env.NEXT_PUBLIC_AI_API_URL ?? 'http://localhost:3001';
```

**改为**:
```typescript
const wsUrl = process.env.NEXT_PUBLIC_AI_WS_URL ?? 'http://localhost:3000/ai';
const apiUrl = process.env.NEXT_PUBLIC_AI_API_URL ?? 'http://localhost:3000';
```

### 2.3 修复 FinishReason 映射（P1）

**文件**: `ai.types.ts` 行 50

**后端后端协议** `FinishReason = 'complete' | 'max_turns' | 'stopped' | 'error' | 'interrupted'`

**当前前端定义**完全一致 — 类型层没问题。但 `conversation-state.ts` 的 `stopGenerating()` 不区分 finishReason，统一清理。

**改动**: `done` 事件处理中，根据 `finishReason` 做不同处理：
- `'complete'` / `'max_turns'` — 正常完成
- `'stopped'` — 用户主动停止
- `'error'` — 错误完成（展示错误信息）
- `'interrupted'` — 被中断（如断线）

### 2.4 补充 MessageRecord.role 类型（P1）

**文件**: `conversation-api.ts` 行 21

**当前**:
```typescript
role: 'user' | 'assistant' | 'system';
```

**改为**:
```typescript
role: 'user' | 'assistant' | 'tool' | 'system';
```

### 2.5 移除 Tool Result 多余 error 字段（P1）

**文件**: `ws-client.service.ts` 行 239-245 和 `ai-harness.service.ts` 行 237-246

**当前**:
```typescript
this._wsClient.sendToolResult(roomId, msg.id, null, (error as Error).message);
```

后端 `tool_result` 类型为 `{ roomId, toolCallId, result }`，无 `error` 字段。工具执行失败时，应在 `result` 中返回错误信息对象。

**改为**:
```typescript
// 工具执行失败也返回 result（结构由工具自身决定）
this._wsClient.sendToolResult(roomId, msg.id, { error: (error as Error).message });
```

同时修改 `sendToolResult` 签名，移除 `error` 参数。

---

## 3. Phase 2: 用户体验

### 3.1 Status 指示器

**文件**: `ai-panel.tsx`

**当前**: `onStatus` 事件已订阅但 UI 未使用。

**新增 UI 状态指示器**:

```
┌─────────────────────────────────────┐
│  AI Panel                           │
│  ┌─────────────────────────────┐    │
│  │ [●] Thinking...             │ ← status 事件驱动     │
│  │ [●] Executing search...     │ ← tool_executing     │
│  │ [●] Generating response...  │ ← generating          │
│  └─────────────────────────────┘    │
│                                     │
│  消息列表...                          │
└─────────────────────────────────────┘
```

**改动**:
1. `use-ai-harness.ts` — 暴露 `currentStatus: StatusType | null`
2. `ai-panel.tsx` — 在消息列表上方添加 status bar 组件

### 3.2 错误展示

**当前**: `onError` 事件已订阅，但仅 `console.error`。

**改动**:
1. `use-ai-harness.ts` — 暴露 `currentError: { message: string; code: string } | null`
2. `ai-panel.tsx` — 在输入框上方展示错误 toast，提供重试按钮

### 3.3 ROOM_BUSY 处理

**当前**: 前端没有处理 `ROOM_BUSY` 错误码。

**改动**:
1. `ai-harness.service.ts` — `error` 事件处理中，如果是 `ROOM_BUSY`，设置 `isProcessing = true` 并阻止发送
2. `ai-panel.tsx` — BUSY 时禁用输入框，显示"AI 正在处理中，请稍候..."

### 3.4 activeRoomId 清理时机

**当前**: `done` 事件触发时立即 `_clearActiveRoomId()`（`ai-harness.service.ts` 行 146）。

**问题**: 用户切换回对话时 `activeRoomId` 已被清除，无法恢复。

**改动**: `done` 不清理 `activeRoomId`，仅在 `joinRoom`（切换到新对话）时更新。

---

## 4. Phase 3: 体验增强

### 4.1 Markdown 渲染

**文件**: `message-bubble.tsx`

**当前**: 纯文本渲染。

**改动**: 引入 `react-markdown` 或 `marked` 库，assistant 消息使用 Markdown 渲染。代码块支持语法高亮（`react-syntax-highlighter`）。

### 4.2 流式光标动画

**文件**: `message-bubble.tsx` + `ai-panel.tsx`

**改动**: 在正在生成的 assistant 消息末尾添加闪烁光标动画（CSS `@keyframes blink`），生成完成后消失。

### 4.3 清理 no-op 方法

**文件**: `ai-harness.service.ts` 和 `use-ai-harness.ts`

移除 `connect()` 和 `disconnect()` 方法，WS 连接由订阅自动管理，这两个方法无实际作用且误导调用方。

---

## 5. 测试计划

### 5.1 单元测试

| 测试目标 | 文件 | 覆盖内容 |
|---------|------|---------|
| Tool handler 确认路径 | `ai-harness.service.ts` | `requiresConfirmation=true` 时不自动执行 |
| Tool handler 自动执行路径 | `ai-harness.service.ts` | `requiresConfirmation=false` 时传入 input |
| FinishReason 映射 | `conversation-state.ts` | 5 种 finishReason 各自行为 |
| RoomState 工具挂起状态 | `conversation-state.ts` | set/clear pendingToolCall |
| 端口默认值 | `bootstrap.ts` | 默认 3000 而非 3001 |

### 5.2 集成测试

| 测试场景 | 验证点 |
|---------|--------|
| 新建对话发送消息 | 流式输出完整展示，done 事件正确 |
| 工具调用需确认 | 弹出确认框，确认后结果正确返回 |
| 工具调用自动执行 | 无需确认，结果自动返回 LLM |
| 停止生成 | finishReason='stopped'，消息不丢失 |
| Room BUSY | 二次发送被拒绝，输入框禁用 |
| 断线重连 | 重新 joinRoom 后历史消息正确加载 |
| 错误处理 | LLM 超时/不可用时展示错误信息 |

---

## 6. 实施顺序和依赖

```
Phase 1 (协议修复)
  ├── Step 1: 修复默认端口 (1 file, 5 min)          ← 无依赖，立即可做
  ├── Step 2: 修复 MessageRecord.role (1 file, 2 min) ← 无依赖
  ├── Step 3: 修复 finishReason 映射 (2 files, 30 min) ← 依赖 Step 2
  ├── Step 4: 修复 tool result (2 files, 20 min)      ← 无依赖
  └── Step 5: 重写 tool handler (5 files, 2 hours)    ← 依赖 Step 4

Phase 2 (用户体验)
  ├── Step 6: activeRoomId 清理 (1 file, 10 min)     ← 无依赖
  ├── Step 7: status 指示器 (2 files, 1 hour)         ← 无依赖
  ├── Step 8: 错误展示 (2 files, 1 hour)              ← 依赖 Step 7
  └── Step 9: ROOM_BUSY (2 files, 30 min)             ← 依赖 Step 8

Phase 3 (体验增强)
  ├── Step 10: Markdown 渲染 (2 files, 2 hours)       ← 无依赖
  ├── Step 11: 光标动画 (2 files, 30 min)              ← 依赖 Step 10
  └── Step 12: 清理 no-op (2 files, 10 min)            ← 无依赖
```

### 并行化分析

Phase 1 内部存在依赖链，基本串行执行。Phase 2 和 Phase 3 可在 Phase 1 完成后并行推进（不同文件），但建议按顺序验证。

```
Lane A (核心协议): Step 1 → Step 2 → Step 3 → Step 4 → Step 5
Lane B (体验):                                  Step 6 → Step 7 → Step 8 → Step 9
Lane C (UI):                                                        Step 10 → Step 11
Lane D (清理):                                                        Step 12
```

---

## 7. 风险点

| 风险 | 缓解措施 |
|------|---------|
| Tool handler 改动影响现有工具调用 | 保留现有 auto-execute 路径作为 fallback，先兼容再拆分 |
| Markdown 渲染引入 XSS | 使用 `sanitize` 选项，过滤 script/onclick 等危险属性 |
| FinishReason 映射遗漏边缘场景 | 单元测试覆盖 5 种 finishReason 各 1 个用例 |
| activeRoomId 变更影响恢复逻辑 | 测试断线重连 + 手动切换对话两个场景 |

---

## 8. NOT in scope

以下内容纳入 TODO 或明确排除：

| 项目 | 原因 |
|------|------|
| SSE 支持 | 后端不使用 SSE，全部 WebSocket |
| 多模型/Provider 切换 UI | 后端支持但前端无需求，暂不实现 |
| 消息持久化优化 | 当前 localStorage 方案够用 |
| 对话搜索/过滤 | ConversationList 已有基础搜索，不需要大改 |
| 消息编辑/重发 | 后端不支持消息编辑，非当前需求 |
| 多端同步 | 单端应用，不需要跨端状态同步 |

---

## 9. 已有代码复用分析

| 已有实现 | 是否复用 | 说明 |
|---------|---------|------|
| WSClientService 信封格式 | ✅ 复用 | 正确包裹 `{ type: 'message', payload }` |
| AIHarnessService 事件代理 | ✅ 复用 | `_setupEventProxy` 模式保持不变 |
| RoomState 消息累积 | ✅ 复用 | `appendStreamChunk` 逻辑正确 |
| ToolRegistry | ✅ 复用 | 注册/执行框架复用 |
| ContextCollector | ✅ 复用 | 编辑器上下文收集复用 |
| Conversation API | ✅ 复用 | REST 端点调用复用，仅补充 role 类型 |
| useAIHarness hook | ✅ 复用 | `useSyncExternalStore` 模式复用 |

---

## 10. 完成标准

- [ ] Phase 1 全部 5 步完成 + 单元测试通过
- [ ] Phase 2 全部 4 步完成 + 手动验证所有状态指示
- [ ] Phase 3 全部 3 步完成 + Markdown 渲染验证
- [ ] 集成测试全部通过（参照第 5.2 节）
- [ ] 无 P0/P1 级别协议差异遗留
- [ ] `ai-conversation-flow.md` 文档更新，反映新架构

---

## 11. 关键文件 ASCII 架构图

```
apps/web/src/features/ai/
├── types/
│   └── ai.types.ts              ← 协议类型定义（ClientMessage, ServerMessage）
├── api/
│   └── conversation-api.ts      ← REST API 客户端
├── harness/
│   ├── ai-harness.service.ts    ← 核心编排器（4 子模块 + 事件代理）
│   ├── conversation-state.ts    ← 本地消息状态（流式累积 + FSM）
│   ├── context-collector.ts     ← 编辑器上下文收集
│   ├── tool-registry.ts         ← 工具注册/执行
│   └── tools/
│       └── index.ts             ← 4 个内置工具实现
└── __tests__/
    └── integration.test.ts      ← 集成测试

apps/web/src/platform/ws-client/
└── ws-client.service.ts         ← Socket.io 连接管理

apps/web/src/hooks/
└── use-ai-harness.ts            ← React hook（useSyncExternalStore）

apps/web/src/components/workspace/ai-panel/
├── ai-panel.tsx                 ← 主面板（消息列表 + 输入框）
├── message-bubble.tsx           ← 消息渲染
├── conversation-list.tsx        ← 对话列表
└── ...
```
