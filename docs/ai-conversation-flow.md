# AI 对话流程架构图

```mermaid
sequenceDiagram
    participant C as 客户端 (Client)
    participant GW as AI Gateway<br/>(WebSocket)
    participant RD as RequestDispatcher
    participant CO as ConversationOrchestrator
    participant MS as MessageService
    participant WE as WorkflowExecutor
    participant GR as GraphRegistry
    participant LR as LLMResolver
    participant LG as LangGraph<br/>(ChatGraph)
    participant TP as ToolDispatcher
    participant PR as LLM Provider<br/>(Anthropic/OpenAI/...)
    participant DB as Database<br/>(Prisma)

    %% 连接阶段
    C->>GW: WebSocket 连接 (ai namespace)
    GW->>GW: ConnectionManager.registerClient()
    C->>GW: join { conversationId }
    GW->>GW: 加载历史消息
    GW-->>C: history [messages]

    %% 发送消息
    C->>GW: message { conversationId, content }
    GW->>RD: dispatch()
    RD->>RD: 验证 / 速率限制
    RD->>RD: 创建 AISession
    RD->>CO: dispatch()

    %% 编排处理
    CO->>MS: create(userMessage)
    MS->>DB: 持久化用户消息
    CO->>CO: 构建 WorkflowExecutionContext
    CO->>WE: execute(context)

    %% 工作流执行
    WE->>GR: 获取图定义 (默认 chat)
    WE->>LR: resolve('llm_call', configMap)
    LR-->>WE: LLMCaller 闭包
    WE->>WE: 构建 configurable { llmCaller, tools, onChunk }
    WE->>LG: stream(initialState, configurable)

    %% LLM 调用循环
    loop 工具调用外层循环 (最多10轮)
        LG->>LG: llm_call 节点
        LG->>PR: chat(messages, tools, abortSignal)
        
        loop 流式输出
            PR-->>LG: text_chunk
            LG-->>WE: text_chunk
            WE-->>GW: stream_chunk
            GW-->>C: stream_chunk (SSE)
            
            PR-->>LG: tool_call
            LG-->>WE: tool_call { name, args }
            WE-->>GW: tool_call 事件
            GW-->>C: tool_call { id, name, arguments }
            
            PR-->>LG: done
            LG-->>WE: done
        end

        alt 无工具调用
            WE-->>GW: stream_done
            GW-->>C: stream_done
            WE->>MS: create(assistantMessage)
            MS->>DB: 持久化 AI 回复
        else 有工具调用
            WE->>MS: create(含 tool_use 的助手消息)
            MS->>DB: 持久化
            
            WE->>TP: deliverResult(toolCalls)
            TP->>TP: 阻塞等待前端结果
            
            C->>GW: tool_result { toolId, content }
            GW->>TP: deliverResult(result)
            TP-->>WE: 所有工具结果到齐 → resolve
            
            WE->>WE: 追加 tool_result 到消息历史
            WE->>LG: 下一轮 LLM 调用 (继续循环)
        end
    end

    %% 状态更新
    CO->>CO: 更新会话状态: streaming → completed
    WE->>WE: 清理 AISession
```

## 流程说明

### 1. 连接阶段
- 客户端通过 WebSocket 连接到 `ai` 命名空间
- 发送 `join` 事件加入对话，服务端加载历史消息

### 2. 消息分发
- `AI Gateway` → `RequestDispatcher` (验证 + 限流 + 会话管理) → `ConversationOrchestrator`

### 3. 工作流执行
- `WorkflowExecutor` 获取图定义，解析 LLM Provider，构建 configurable 上下文
- LangGraph `ChatGraph` 执行: `__start__` → `llm_call` → 条件分支 → `tools` → `llm_call` (循环) → `__end__`

### 4. 工具调用循环
- LLM 返回工具调用 → 推送前端 → 前端执行 → 返回结果 → 追加历史 → 继续下一轮 LLM 调用
- 最多 10 轮工具调用，超时 30 秒

### 5. 三层状态管理
| 层次 | 管理者 | 状态 |
|------|--------|------|
| 会话态 | AISession | pending → streaming → waiting_tool → completed |
| 持久态 | Conversation/Message | active → archived → deleted |
| 工作流态 | LangGraph State | messages / hasToolCalls / isDone |
