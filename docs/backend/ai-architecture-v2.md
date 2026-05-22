# AI 后端架构 — 多 LLM + LangGraph 工作流

> 日期: 2026-05-11
> 版本: v2.1
> 范围: `apps/server/src/ai/`
> 状态: 已实现并运行
>
> **变更记录 (v2.1)**:
> - LangGraph 工作流从 `packages/langgraph-workflows/` 合并到 `apps/server/src/ai/langgraph/`
> - 新增 DashScope Provider (通义千问)
> - 新增 LLM 默认配置链 (`llm-default-config.ts`)，环境变量驱动，支持 provider 级 fallback
> - 移除独立的 `connection/` 模块（功能合并到 `ws/socket-registry`）
> - `workflow-runtime/` 重命名为 `workflow/`
> - `conversation/conversation.service.ts` 重命名为 `conversation/room.service.ts`
> - `session/` 从 `ai-session-manager` 改为 `room-session` 体系

## 1. 架构概述

本方案实现了一个三层 AI 后端架构，核心特点是：

- **LLM 与对话完全解耦** — LLM 是执行资源，不是对话属性
- **节点级路由** — 工作流中每个节点可独立指定 LLM
- **运行时动态实例化** — 收到用户消息时根据配置获取/创建 LLM 实例
- **LangGraph 隔离** — 图定义在 `packages/langgraph-workflows/` 中，纯函数式无 NestJS 依赖

### 核心设计原则

1. LLM 是执行资源，通过 `LLMConfig` 按需实例化
2. 工作流图定义与运行时完全分离
3. 前端可在发送消息时指定 `llmConfigMap` 和 `graphName`
4. 同一对话中可使用不同 LLM 协作

## 2. 整体架构图

```
┌──────────────────────────────────────────────────────────────┐
│                     对话层 (Conversation Layer)               │
│                                                              │
│  AiGateway (WS) ─▶ RequestDispatcher ─▶ ConversationOrchestrator
│                                      │                       │
│                                      ▼                       │
│                          WorkflowExecutor.execute()          │
│                          (传入 llmConfigMap + 上下文)          │
└──────────────────────────────────────────────────────────────┘
                              │ dispatch
                              ▼
┌──────────────────────────────────────────────────────────────┐
│                    工作流层 (Workflow Layer)                   │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │              WorkflowEngine (LangGraph)                 │  │
│  │                                                        │  │
│  │  ┌──────┐   ┌──────┐                                  │  │
│  │  │Entry │──▶│llm   │──┐                               │  │
│  │  │      │   │_call │  │ hasToolCalls?                  │  │
│  │  └──────┘   └──┬───┘  ├─ yes ─▶ ┌──────┐              │  │
│  │                │        │         │tools │             │  │
│  │                │        └─ no ─▶  └──────┘             │  │
│  │                │           │                           │  │
│  │                │           └─────▶ __end__             │  │
│  │                                                        │  │
│  └────────────────────┬───────────────────────────────────┘  │
│                       │                                      │
│  ┌────────────────────▼───────────────────────────────────┐  │
│  │                   LLMResolver                           │  │
│  │  • 读取节点的 llmConfig (运行时配置 or 图默认值)         │  │
│  │  • 调用 LLMFactory.getOrCreate(config)                  │  │
│  │  • 注入 LLMProvider 到节点执行上下文                     │  │
│  └────────────────────┬───────────────────────────────────┘  │
└───────────────────────┼──────────────────────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────────────────────┐
│                  LLM 抽象层 (Provider Layer)                   │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐     │
│  │  LLMFactory                                          │     │
│  │  • 缓存 key = hash(provider + model + JSON(params)) │     │
│  │  • 相同配置复用实例，不同配置自动创建                  │     │
│  │  • 支持运行时动态注册新 provider                      │     │
│  └──────────────────────┬──────────────────────────────┘     │
│                         │                                    │
│         ┌───────────────┼───────────────┐                    │
│         ▼               ▼               ▼                    │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐            │
│  │Anthropic    │ │ OpenAI      │ │ Zhipu       │  (可扩展)   │
│  │Provider     │ │ Provider    │ │ Provider    │            │
│  └─────────────┘ └─────────────┘ └─────────────┘            │
│                                                              │
│  LLMProvider 接口:                                          │
│    chat(messages, tools?, abortSignal?):                    │
│      AsyncIterable<LLMOutput>                                │
└──────────────────────────────────────────────────────────────┘
```

## 3. 文件结构

```
apps/server/src/ai/
├── ai.module.ts                      # 模块入口，注册所有 provider 和图定义
├── ai.types.ts                       # 共享类型 (LLMMessage, LLMOutput, ToolDefinition)
├── ai.controller.ts                  # REST API (房间管理 + 向后兼容)
│
├── dto/
│   └── send-message.dto.ts            # 请求 DTO
│
├── conversation/                     # Room 管理
│   ├── room.service.ts               #   Room CRUD + 列表查询
│   └── room-state.ts                 #   状态常量
│
├── dispatch/                         # 请求分发
│   ├── request-dispatcher.ts          # 请求分发 (验证 + 限流 + 会话管理)
│   └── rate-limiter.guard.ts          # 速率限制
│
├── langgraph/                        # LangGraph 工作流 (已从独立包合并)
│   ├── index.ts                       # 模块入口 (导出 GraphRegistry, ChatGraph)
│   ├── graphs/
│   │   ├── base-graph.ts              # 图定义接口
│   │   └── chat-graph.ts              # 标准对话工作流
│   ├── nodes/
│   │   ├── llm-node.ts                # LLM 调用节点 (从 configurable 获取 llmCaller)
│   │   ├── tool-node.ts               # 工具执行节点
│   │   └── router-node.ts             # 条件路由节点
│   └── types/
│       └── workflow.types.ts          # 工作流状态 + 节点配置类型
│
├── llm/                              # LLM 抽象层
│   ├── provider.types.ts              # LLMProvider 接口 + LLMConfig + NodeLLMConfigMap
│   ├── provider-registry.ts           # Provider 注册表 (运行时注册)
│   ├── llm-factory.ts                 # LLM 工厂 (按需实例化 + 缓存)
│   ├── llm-default-config.ts          # 环境变量默认配置 + 多级 fallback
│   ├── anthropic.provider.ts          # Anthropic Claude 实现
│   ├── openai.provider.ts             # OpenAI GPT 实现
│   ├── zhipu.provider.ts              # 智谱 AI GLM 实现 (OpenAI 兼容)
│   └── dashscope.provider.ts          # DashScope 通义千问 (新增)
│
├── workflow/                         # 工作流运行时 (NestJS 侧)
│   ├── orchestrator.ts                # 房间编排 (消息持久化 + 历史构建 + 触发工作流)
│   ├── executor.ts                    # 工作流执行 (LangGraph 实例化 + 工具循环)
│   ├── executor.types.ts              # 执行运行时类型定义
│   ├── graph-registry.ts              # 图注册与查找
│   ├── llm-resolver.ts                # 节点级 LLM 解析
│   └── __tests__/llm-resolver.spec.ts # LLM 解析单元测试
│
├── session/                          # 会话管理
│   ├── room-session.ts                # 房间会话 (FSM 状态机)
│   ├── room-session.types.ts          # 会话类型
│   └── room-session-registry.ts       # 会话注册表
│
├── message/
│   └── message.service.ts             # 消息持久化 + 历史构建 + token 裁剪
│
├── tools/                            # 工具管理
│   ├── tool.dispatcher.ts             # 工具结果分发 (会话级事件)
│   ├── tool-router.ts                 # 工具路由 (execution/danger 决策)
│   └── tool.types.ts                  # 工具类型
│
└── ws/                               # AI WebSocket 路由
    ├── ai-message-router.ts           # 自订阅 AI 消息路由器
    └── ai-ws-events.types.ts          # WS 事件类型定义
```

~~`packages/langgraph-workflows/`~~ — **已删除**，LangGraph 工作流已合并到 `apps/server/src/ai/langgraph/`。

## 4. 核心设计详解

### 4.1 LLM 抽象层

#### LLMProvider 接口

```typescript
interface LLMProvider {
    readonly name: string;    // 'anthropic' | 'openai' | 'zhipu'
    readonly model: string;
    chat(
        messages: LLMMessage[],
        tools?: ToolDefinition[],
        abortSignal?: AbortSignal,
    ): AsyncIterable<LLMOutput>;
}
```

所有 Provider 实现该接口，统一输出 `AsyncIterable<LLMOutput>` 流：
- `text_chunk` — 文本流式片段
- `tool_call` — 工具调用事件
- `done` — 流结束标记

#### LLMConfig

```typescript
interface LLMConfig {
    provider: string;        // 'anthropic' | 'openai' | 'zhipu'
    model: string;           // 'claude-sonnet-4-20250514' | 'gpt-4o' | 'glm-4-flash'
    temperature?: number;
    maxTokens?: number;
    apiKey?: string;
    [key: string]: unknown;  // provider 特定参数
}
```

#### ProviderRegistry

维护 `providerName -> LLMProviderFactory` 映射，支持运行时注册新 provider。

#### LLMFactory

```typescript
class LLMFactory {
    getOrCreate(config: LLMConfig): LLMProvider;
}
```

- 缓存 key = `hash(provider + model + JSON.stringify(params))`
- 相同配置复用实例，不同配置自动创建
- 排除 `apiKey` 从缓存 key 中（安全考虑）

### 4.2 LangGraph 工作流层

#### 图结构 (ChatGraph)

```
__start__ → llm_call → [hasToolCalls?]
                         ├─ yes → tools → llm_call (loop)
                         └─ no  → __end__
```

#### 节点实现

**llm_call 节点** (`createLLMNode`):
- 从 LangGraph `configurable` 上下文获取 `llmCaller` 函数
- 调用 LLM 并处理流式输出
- 收集文本片段和工具调用
- 支持 abortSignal 中断
- 返回新的工作流状态

**tools 节点** (`createToolNode`):
- 处理工具结果
- 清空 `pendingToolCalls`
- 为下一轮 LLM 调用准备状态

#### 关键设计：LLMCaller 注入

LangGraph 节点本身不直接调用 LLM，而是通过 `configurable` 上下文注入 `llmCaller` 函数：

```typescript
interface GraphConfig {
    llmCaller: LLMCaller;     // server 侧创建的闭包
    tools?: ToolDefinition[];
    abortSignal?: AbortSignal;
    onChunk?: (content: string) => void;  // 流式输出回调
}
```

这样实现了纯函数式图定义与具体 LLM 实现的完全解耦。

### 4.3 工作流运行时 (NestJS 侧)

#### ConversationOrchestrator

```
用户消息
  ↓
1. 保存消息 (MessageService.create)
  ↓
2. 构建历史 (MessageService.buildLLMHistory)
  ↓
3. 构建 WorkflowExecutionContext
  ↓
4. WorkflowExecutor.execute()
  ↓
5. 更新会话状态
```

#### WorkflowExecutor

核心执行流程：

```
1. 获取图定义 (GraphRegistry.get)
2. 创建 LLMCaller 闭包 (通过 LLMResolver 解析 provider)
3. 构建初始状态 (messages, conversationId, ...)
4. 工具调用外层循环 (最多 10 轮):
   a. LangGraph 图执行 (graph.stream(initialState, { configurable }))
   b. 检查是否有工具调用
   c. 有 → 保存消息 + 推送前端 + 等待工具结果 → 继续循环
   d. 无 → 结束
5. 推送 stream_done 事件
```

#### 工具调用等待

通过 `ToolDispatcher.waitForResultsByConversation()` 实现：
- 创建会话级等待会话
- 前端返回 `tool_result` 时通过 `deliverResult()` 解除阻塞
- 超时 30 秒自动返回 null

### 4.4 数据流完整示例

```
1. 前端发送消息:
   WS 'message' { conversationId: "abc", content: "你好", llmConfigMap: { "summarize": { provider: "anthropic", model: "claude-haiku" } } }

2. AiGateway 收到消息 → RequestDispatcher.dispatch()

3. RequestDispatcher:
   - 验证会话存在
   - 创建 AISession
   - 调用 ConversationOrchestrator.dispatch()

4. ConversationOrchestrator:
   - 保存用户消息
   - 构建对话历史
   - 构建 WorkflowExecutionContext (包含 llmConfigMap)
   - 调用 WorkflowExecutor.execute()

5. WorkflowExecutor:
   - 从 GraphRegistry 获取 ChatGraph
   - 创建 LLMCaller 闭包 (通过 LLMResolver 解析 'llm_call' 节点配置)
   - 执行 LangGraph 图
   - llm_call 节点调用 LLM，流式输出通过 onChunk 推送到前端
   - 如果有工具调用 → 外层循环等待前端结果 → 继续下一轮

6. 前端收到:
   - 'stream_chunk' × N (文本流式输出)
   - 'tool_call' (如有工具调用)
   - 'stream_done' (完成)
```

## 5. LLM 配置数据结构

```typescript
// 节点级 LLM 配置映射（运行时注入）
type NodeLLMConfigMap = Record<string, LLMConfig>;

// 示例:
const llmConfigMap: NodeLLMConfigMap = {
    'main_llm': { provider: 'anthropic', model: 'claude-opus', temperature: 0.7 },
    'summarize': { provider: 'anthropic', model: 'claude-haiku', temperature: 0.3 },
};

// 对话级默认配置
interface ConversationLLMConfig {
    default: LLMConfig;
    nodeOverrides?: NodeLLMConfigMap;  // 可选的节点级覆盖
}
```

## 6. 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `ANTHROPIC_API_KEY` | Anthropic API Key | - |
| `OPENAI_API_KEY` | OpenAI API Key | - |
| `ZHIPUAI_API_KEY` | 智谱 AI API Key | - |
| `DASHSCOPE_API_KEY` | DashScope API Key | - |
| `ANTHROPIC_MODEL` | Anthropic 默认模型 | `claude-sonnet-4-20250514` |
| `OPENAI_MODEL` | OpenAI 默认模型 | `gpt-4o` |
| `AI_DEFAULT_PROVIDER` | 默认 provider | `anthropic` |

启动时通过 `buildDefaultLlmConfig()` 从环境变量构建默认配置，并注册所有配置了 API Key 的 provider 到 `ProviderRegistry`。

### LLM 默认配置链

新增 `llm-default-config.ts`，提供三级 fallback 机制：

1. **环境变量直接配置**: 读取 `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, 等
2. **Provider 级 fallback**: 如果首选 provider 无 API Key，自动降级到下一个可用 provider
3. **运行时注入**: 在 REST/WS 入口解析 `llmConfig`，合并默认配置后传递给执行层

```typescript
// buildDefaultLlmConfig() 返回值
interface DefaultLlmConfig {
  provider: string;    // 首选可用 provider
  model: string;       // 对应默认模型
  // ... 其他参数
}
```

此设计确保即使只配置了单一 provider 的 API Key，系统也能正常启动并工作。

## 7. 已删除的遗留文件

以下文件已被清理（被新架构替代）：

| 文件 | 被替代为 |
|------|----------|
| `orchestrator/ai-loop.orchestrator.ts` | `workflow-runtime/conversation-orchestrator.ts` + `workflow-executor.ts` |
| `orchestrator/ai-loop.types.ts` | `workflow-runtime/workflow.types.ts` |
| `orchestrator/stream.handler.ts` | LangGraph 节点内置流式处理 |
| `provider/provider.router.ts` | `provider/provider-registry.ts` + `workflow-runtime/llm-resolver.ts` |
| `ai.gateway.ts` | `gateway/ai-ws.gateway.ts` |

## 8. 暂时保留的文件

| 文件 | 原因 |
|------|------|
| `ai.service.ts` | `AiController` 的 REST `/ai/chat` 端点仍依赖 `handleUserMessage`，标记为废弃 |
| `ai.controller.ts` | 提供对话管理的 REST API |

## 9. 编译与运行

### langgraph-workflows 包

必须预编译为 JavaScript（Node.js 无法直接解析 TypeScript `export type` 语法）：

```bash
pnpm --filter @my-km/langgraph-workflows build
```

输出目录：`packages/langgraph-workflows/dist/`

### Server 端

```bash
pnpm --filter @my-km/server build        # 编译
pnpm --filter @my-km/server start:dev    # 开发模式
```

### 验证

启动后应看到以下日志：
- `AiModule dependencies initialized`
- `Graph registered: chat — 标准对话工作流，支持工具调用循环`
- `AiGateway subscribed to the "join", "message", "stop", "tool_result" messages`

## 10. 架构对比

| 方面 | 旧架构 (v1) | 新架构 (v2) |
|------|-------------|-------------|
| LLM 选择 | 启动时固定单一 provider | 节点级路由，运行时动态指定 |
| 工作流 | 硬编码 tool-call 循环 | LangGraph StateGraph，可扩展 |
| LLM 实例化 | 启动时创建单例 | 按需实例化 + 缓存 |
| 多 LLM 协作 | 不支持 | 支持 (通过 NodeLLMConfigMap) |
| 图定义 | 耦合在 NestJS 中 | 独立 packages/，纯函数式 |
| Provider 扩展 | 代码改动 | 运行时注册新 provider |
| 前端控制 | 无法选择 LLM | 可指定 llmConfigMap 和 graphName |

## 11. 扩展指南

### 添加新 LLM Provider

1. 在 `apps/server/src/ai/provider/` 创建 `xxx.provider.ts`
2. 实现 `LLMProvider` 接口
3. 在 `ai.module.ts` 的 `onModuleInit` 中注册
4. 在 `env.validation.ts` 添加 API Key 验证

### 添加新工作流图

1. 在 `packages/langgraph-workflows/src/graphs/` 创建 `xxx-graph.ts`
2. 实现 `BaseGraph` 接口
3. 在 `ai.module.ts` 的 `onModuleInit` 中注册到 `GraphRegistry`
4. 前端通过 `graphName` 参数指定使用

### 自定义节点

1. 在 `packages/langgraph-workflows/src/nodes/` 创建节点函数
2. 节点函数签名: `(state: WorkflowState, context?: { configurable?: GraphConfig }) => Promise<Partial<WorkflowState>>`
3. 在图定义的 `createGraph()` 中使用 `addNode()` 注册
