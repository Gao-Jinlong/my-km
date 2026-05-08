# AI 对话流程重构设计 — 多对话 + 数据流修复

> 日期: 2026-05-08
> 范围: 前端 AI 对话流程 + 后端 WebSocket 消息协议
> 触发: 生产环境 `MISSING_PARAMS: conversationId and content are required` 错误

## 1. 问题根因

### 1.1 核心 Bug

前端 `ws-client.ts` 的 3 个发送方法均未携带 `conversationId`，导致后端 `ai-ws.gateway.ts:123` 校验失败：

```typescript
// ws-client.ts:119 — 缺少 conversationId
this._socket?.emit('message', { type: 'message', content, context });
//                                              ^^^^^^^^^^^^^^^ 缺失

// ws-client.ts:124 — 缺少 conversationId
this._socket?.emit('tool_result', { type: 'tool_result', toolCallId, result, error });
//                                                        ^^^^^^^^^^^^^^^ 缺失

// ws-client.ts:129 — 缺少 conversationId
this._socket?.emit('stop', { type: 'stop' });
//                                    ^^^^^^^^^^^^^^^ 缺失
```

后端校验（`ai-ws.gateway.ts:123-129`）：
```typescript
if (!data.conversationId || !data.content) {
    client.emit('error', {
        message: 'conversationId and content are required',
        code: 'MISSING_PARAMS',
    });
    return;
}
```

### 1.2 调用链断裂

```
ai-harness.service.ts:sendMessage()
  └── _wsClient.sendMessage(content, ctx)          ← 未传 conversationId
        └── emit('message', { content, context })   ← 缺少 conversationId
              └── AiGateway.handleMessage()
                    └── ❌ 校验失败
```

## 2. 架构调整

### 2.1 conversationId 策略变更

| 变更前 | 变更后 |
|--------|--------|
| `doc-{documentId}` — 与文档绑定 | 前端用 `nanoid` 生成，如 `conv-aB3xK9` |
| 一个文档一个对话 | 对话与文档解耦，支持多对话隔离工作上下文 |
| 对话标题固定 | 自动生成（首条消息前 20 字符）→ 结束后 LLM 总结更新 |

### 2.2 对话与文档的关系

```
┌─────────────────────────────────────────────────┐
│  对话 (Conversation) — 独立的工作上下文          │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐   │
│  │ conv-abc  │  │ conv-def  │  │ conv-ghi  │   │
│  │ 工作A     │  │ 工作B     │  │ 工作C     │   │
│  │ 消息历史   │  │ 消息历史   │  │ 消息历史   │   │
│  └─────┬─────┘  └─────┬─────┘  └─────┬─────┘   │
│        │              │              │          │
│        └──────────────┼──────────────┘          │
│                       ▼                         │
│         当前活跃编辑器 (可切换)                    │
│         sendMessage 时取其上下文                   │
└─────────────────────────────────────────────────┘
```

### 2.3 完整数据流时序图（修复后）

```
Frontend                              WebSocket Channel                          Backend
========                           =====================                        =======

[1] 初始化
harness.connect(url)
  ─── Socket.IO connect ──────────────────────────────────────────────▶ AiGateway.handleConnection()
                                                                            │
                                                                        connectionManager.registerClient(clientId, socket, userId)
                                                                        ◀── connected

[2] 创建对话（前端生成 ID）
conversationId = nanoid()
harness.createConversation(conversationId, title?)
  └── wsClient.send({ type:'create_conversation', conversationId, title })
      ────────────────────────────────────────────────────────────────▶ AiGateway.handleCreateConversation()
                                                                            │
                                                                        ConversationService.create({ id: conversationId, userId, title })
                                                                        ◀── emit('conversation_created', { conversationId })

[3] 加入对话
harness.joinConversation(conversationId)
  ├── conversationManager.setCurrent(conversationId)
  └── wsClient.joinConversation(conversationId)
      ─── emit('join', {type:'join', conversationId}) ────────────────▶ AiGateway.handleJoin()
                                                                            │
                                                                        client.join(room: conversationId)
                                                                        connectionManager.joinConversation(clientId, conversationId)
                                                                        history = messageService.findByConversationId(conversationId)
                                                                        ◀── emit('joined', {conversationId})
                                                                        ◀── emit('history', {messages})

      on('history') → conversationManager.loadHistory(conversationId, messages)

[4] 用户发消息
harness.sendMessage('你好')
  ├── conversationManager.appendMessage(conversationId, userMsg)
  ├── conversationManager.startGenerating(conversationId)
  ├── activeDocId = contextCollector.getActiveDocumentId()
  ├── context = contextCollector.getContext(activeDocId)  ← 取当前活跃编辑器
  └── wsClient.sendMessage(content, context, conversationId)
      ── emit('message', { ─────────────────────────────────────────▶ AiGateway.handleMessage()
            type: 'message',
            conversationId,               ✅ 修复
            content,
            context
          })
                                                                            │
                                                                        RequestDispatcher.dispatch({ conversationId, clientId, content, context })
                                                                          ├── rateLimiter.check()
                                                                          ├── session = sessionManager.create({ conversationId, clientId })
                                                                          └── loopOrchestrator.execute(session, content)
                                                                              ├── messageService.create({ conversationId, role:'user', content })
                                                                              ├── history = messageService.buildLLMHistory(conversationId)
                                                                              └── for await (output of provider.chat(history, tools))
                                                                                    │
                                                                                    ├── text_chunk ── emit('stream_chunk') ────────────▶ wsClient.onStreamChunk
                                                                                    │                                                         │
                                                                                    │                                                     conversationManager.appendChunk(conversationId, text)
                                                                                    │                                                         │
                                                                                    │                                                     UI 实时渲染
                                                                                    │
                                                                                    └── tool_call ── emit('tool_call', {id, name, args}) ─▶ wsClient.onToolCall
                                                                                                                                              │
                                                                                                                                        harness._setupToolCallHandler
                                                                                                                                          ├── toolRegistry.execute(name, args)
                                                                                                                                          │   └── [前端工具: 操作 Lexical 编辑器]
                                                                                                                                          │
                                                                                                                                          └── wsClient.sendToolResult(id, result, error, conversationId)
                                                                                                                                              ── emit('tool_result', { ──────▶ AiGateway.handleToolResult()
                                                                                                                                                    type:'tool_result',
                                                                                                                                                    conversationId,      ✅ 修复
                                                                                                                                                    toolCallId: id,
                                                                                                                                                    result
                                                                                                                                                  })
                                                                                                                                                                │
                                                                                                                                                            ToolDispatcher.deliverResult(conversationId, toolCallId, result, sessionId)
                                                                                                                                                                │
                                                                                                                                                            唤醒 waitForResults()
                                                                                                                                                                │
                                                                                                                                                            loopOrchestrator 继续循环
                                                                                                                                                                │
                                                                                                                                                            直到无 tool_call
                                                                                                                                                                │
                                                                            ◀── emit('stream_done')
      on('stream_done') → conversationManager.stopGenerating(conversationId)

[5] 对话结束后 — LLM 总结标题
  └── 后端: AiLoopOrchestrator.execute() 完成后
        └── 调用 LLM: "请用一句话总结以下对话内容作为标题（不超过 20 字符）"
            └── ConversationService.updateMetadata(conversationId, { title: llmSummary })
```

## 3. 修复清单

### 3.1 前端改动

| 文件 | 改动 | 优先级 |
|------|------|--------|
| `features/ai/types/ai.types.ts` | ClientMessage 类型: message/tool_result/stop 分支补上 conversationId | P0 |
| `features/ai/harness/ws-client.ts` | sendMessage 签名加 conversationId 参数 | P0 |
| `features/ai/harness/ws-client.ts` | sendToolResult 签名加 conversationId 参数 | P0 |
| `features/ai/harness/ws-client.ts` | stopGenerating 签名加 conversationId 参数 | P0 |
| `features/ai/harness/ai-harness.service.ts` | sendMessage 传 conversationId 给 wsClient | P0 |
| `features/ai/harness/ai-harness.service.ts` | sendToolResult / stopGenerating 传 conversationId | P0 |
| `features/ai/harness/conversation-state.ts` | 从单例改为 Map<conversationId, ConversationState> | P1 |
| `hooks/use-ai-harness.ts` | 新增 createConversation / switchConversation / deleteConversation | P1 |
| `components/workspace/ai-panel/` | 新增对话列表组件 + 对话切换 UI | P1 |

### 3.2 后端改动

| 文件 | 改动 | 优先级 |
|------|------|--------|
| `ai-ws.gateway.ts` | handleJoin 新增对话不存在时自动创建逻辑 | P0 |
| `ai-ws.gateway.ts` | handleToolResult 接收 conversationId 参数 | P0 |
| `ai-ws.gateway.ts` | handleConnection 从 JWT 提取 userId | P1 |
| `dispatch/request-dispatcher.ts` | 移除对话创建兜底逻辑 | P0 |
| `dispatch/request-dispatcher.ts` | 从 ConnectionManager 获取 userId | P1 |
| `connection/connection-manager.ts` | registerClient 新增 userId 参数 | P1 |
| `orchestrator/ai-loop.orchestrator.ts` | 执行完成后调用 incrementMessageCount | P1 |
| `ai.controller.ts` | 新增 GET /api/conversations 返回用户对话列表 | P1 |
| `ai.controller.ts` | 新增 POST /api/conversations 创建对话 | P1 |
| `ai.controller.ts` | 新增 POST /api/conversations/:id/title 由 LLM 更新标题 | P2 |

### 3.3 前端工具 Schema

| 文件 | 改动 | 优先级 |
|------|------|--------|
| `features/ai/types/ai.types.ts` | ClientMessage 类型对齐协议 | P0 |
| `features/ai/harness/tools/*` | 工具注册时 name 与后端 toolDefinition.name 对齐 | P1 |

## 4. 新增前端模块

### 4.1 ConversationManager

替换现有单例 ConversationState，支持多对话：

```typescript
interface ConversationManager {
    // 对话管理
    createConversation(id: string, title?: string): void;
    deleteConversation(id: string): void;
    switchConversation(id: string): void;

    // 状态访问
    get currentConversationId(): string | null;
    get conversations(): ReadonlyArray<{ id: string; title: string; lastActive: string }>;

    // 消息操作（按对话隔离）
    get messages(): ReadonlyArray<MessageWire>;          // 当前对话的消息
    appendMessage(conversationId: string, msg: MessageWire): void;
    appendChunk(conversationId: string, text: string): void;
    startGenerating(conversationId: string): void;
    stopGenerating(conversationId: string): void;
    setHistory(conversationId: string, messages: MessageWire[]): void;
}
```

### 4.2 AIPanel 组件结构

```
apps/web/src/components/workspace/ai-panel/
├── ai-panel.tsx             # 主面板容器
├── ai-header.tsx            # 面板头部（已有）
├── conversation-list.tsx    # 新增：对话列表
├── conversation-item.tsx    # 新增：单条对话项
├── chat-area.tsx            # 消息列表（已有，需适配多对话）
├── message-bubble.tsx       # 消息气泡（已有）
├── input-area.tsx           # 输入区（已有）
├── context-badge.tsx        # 上下文指示（已有）
└── tool-setup.ts            # 工具注册（已有）
```

## 5. 决策记录

| # | 决策 | 选择 | 理由 |
|---|------|------|------|
| D2 | conversationId 修复范围 | 4 处全部修复 | 一致性，避免后续遗漏 |
| D3 | conversationId 创建时机 | handleJoin 中自动创建 | 前端不需要关心创建逻辑 |
| D4 | 前端工具执行交互 | 后端调 LLM → tool_call 转发前端 | 安全性，API Key 不暴露 |
| D6 | ClientMessage 类型 | 统一补上 conversationId | 类型安全 |
| D7 | 对话与文档关系 | 解耦，对话独立于文档 | 支持多对话隔离工作上下文 |
| D8 | userId 来源 | 从 JWT 提取 | 对话关联到真实用户 |
| D9 | 编辑器注册 | 监听文档变化自动注册 | 自动化，减少手动调用遗漏 |
| D10 | 消息计数 | 补上 incrementMessageCount | 对话列表功能需要 |
| D11 | 创建逻辑统一 | 统一在 handleJoin 中创建 | 避免重复，userId 处理一致 |
| D12 | 多对话 UI | MVP 就支持对话列表 | 用户明确要求 |
| D13 | context 收集 | 取当前活跃编辑器 | conversation 和文档解耦 |
| Q1 | conversationId 生成 | 前端 nanoid | 简单，无需后端往返 |
| Q2 | 对话列表数据源 | 后端 REST API | 持久化，刷新不丢失 |
| Q3 | 对话标题 | 自动生成 + LLM 总结更新 | 无需用户手动输入 |

## 6. NOT in scope

| 项目 | 理由 |
|------|------|
| 对话内支持多模型切换 | MVP 只用 Anthropic，post-MVP 扩展 |
| 对话导出/导入 | 非核心功能 |
| 对话分享/协作 | 多用户功能，超出 MVP |
| 对话级权限控制 | 当前为单用户应用 |
| 流式 tool_call 参数组装（OpenAI） | MVP 只用 Anthropic |

## 7. 风险与缓解

| 风险 | 影响 | 缓解 |
|------|------|------|
| ConversationState 改为 Map 后事件系统复杂度增加 | 中 | 每个对话独立 Emitter，不共享状态 |
| 前端 nanoid 生成的 ID 与后端冲突 | 低 | nanoid 碰撞概率极低（2^126） |
| LLM 总结标题失败 | 低 | 回退到首条消息前 20 字符 |
| 对话列表 REST API 响应慢 | 低 | 分页 + 缓存，MVP 限制 50 条 |
