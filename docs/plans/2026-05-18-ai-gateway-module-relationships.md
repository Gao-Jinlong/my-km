# AI 网关模块关系图

> 描述 `RoomService`、`RoomStateMachineFactory`、`RequestDispatcher` 三个模块的职责边界和交互关系。
> 生成时间：2026-05-18

## 整体架构

```mermaid
graph TB
    Client["WS Client"] --> WsGateway["WsGateway"]
    WsGateway --> MessageBus["MessageBus"]
    MessageBus --> AiMessageRouter["AiMessageRouter"]
    AiMessageRouter --> RoomRouter["RoomRouter<br/><i>业务编排入口</i>"]

    RoomRouter --> RoomService["RoomService<br/><i>持久层</i>"]
    RoomRouter --> SMF["RoomStateMachineFactory<br/><i>协议层</i>"]
    RoomRouter --> RD["RequestDispatcher<br/><i>编排层</i>"]

    SMF --> FSM["RoomStateMachine<br/><i>FSM 实例 per-room</i>"]
    FSM -. "emit 回调" .-> WsGateway

    RD --> RoomService
    RD --> RateLimiter["AiRateLimiter<br/><i>速率限制</i>"]
    RD --> SessionMgr["AISessionManager<br/><i>并发控制</i>"]
    RD --> Orchestrator["RoomOrchestrator<br/><i>工作流编排</i>"]

    Orchestrator --> MessageService["MessageService<br/><i>消息持久化</i>"]
    Orchestrator --> SMF
    Orchestrator --> WorkflowExecutor["WorkflowExecutor<br/><i>LLM + 工具调用</i>"]
    WorkflowExecutor -. "回调桥" .-> FSM
    FSM -. "emit 回调" .-> WsGateway

    classDef persistent fill:#e1f5fe,stroke:#01579b
    classDef protocol fill:#fff3e0,stroke:#e65100
    classDef orchestration fill:#e8f5e9,stroke:#2e7d32
    classDef transport fill:#f3e5f5,stroke:#6a1b9a

    class RoomService,MessageService persistent
    class SMF,FSM protocol
    class RD,Orchestrator,WorkflowExecutor orchestration
    class Client,WsGateway,MessageBus,AiMessageRouter transport
```

## 模块职责

| 模块 | 层级 | 职责 |
|------|------|------|
| **RoomService** | 持久层 | Room 的 CRUD、元数据管理、统计查询（通过 Prisma） |
| **RoomStateMachineFactory** | 协议层 | 管理 per-room 的 FSM 实例生命周期，按 `byRoomId` 和 `byClientId` 索引 |
| **RequestDispatcher** | 编排层 | 串联：查找/创建 Room → 速率检查 → 创建 AISession → 调用 Orchestrator |

## 消息流时序

```mermaid
sequenceDiagram
    participant C as WS Client
    participant RR as RoomRouter
    participant RS as RoomService
    participant SMF as RoomStateMachineFactory
    participant RD as RequestDispatcher
    participant OC as RoomOrchestrator
    participant WE as WorkflowExecutor
    participant FSM as RoomStateMachine

    C->>RR: createAndSend(content)
    RR->>RS: create(title)
    RS-->>RR: room (id)
    RR->>SMF: create({ roomId, clientId, emit })
    SMF-->>FSM: 新建 FSM 实例 (Idle)
    RR->>RD: dispatch({ roomId, content })
    RD->>RS: findById(roomId)
    RS-->>RD: room
    RD->>RD: AiRateLimiter.check()
    RD->>RD: AISessionManager.create()
    RD->>OC: dispatch(session, content)
    OC->>OC: MessageService.create(user msg)
    OC->>SMF: create(roomId) — 确保存在
    OC->>SMF: get(roomId)
    SMF-->>OC: FSM 实例
    OC->>WE: execute(callbacks)
    Note over WE,FSM: 回调桥: onTextChunk → FSM.textChunk()
    WE-->>FSM: textChunk(chunk)
    FSM-->>C: emit text_chunk (via WS)
    WE-->>FSM: toolCall(info)
    FSM-->>C: emit tool_call (via WS)
    WE-->>FSM: llmDone()
    FSM-->>C: emit llm_done (via WS)
    WE-->>OC: execute 完成
    OC-->>RD: dispatch 返回
    RD->>RD: AISessionManager.cleanup()
    RD-->>RR: dispatch 返回
    RR-->>C: emit created (room id)
```

## 关键设计点

### 1. `byRoomId` 索引

`RoomStateMachineFactory` 使用 `Map<string, RoomStateMachine>` 按 `roomId` 索引 FSM 实例。核心方法：

- `create()` — 创建新 FSM，若同 roomId 有活跃实例则抛出异常
- `get(roomId)` — 通过 `byRoomId.get()` 取回已存在的实例
- `destroy(roomId)` — 清理 FSM 并 abort 其 abortController

### 2. `byClientId` 反向索引

使用 `Map<string, Set<string>>` 维护 clientId → roomId 集合的反向映射，用于 `onClientDisconnect` 时批量清理该客户端的所有 FSM。

### 3. 双层状态机

| 状态机 | 状态 | 职责 |
|--------|------|------|
| **AISessionManager** | pending → streaming → waiting_tool → completed/aborted/error | 会话级并发控制和生命周期 |
| **RoomStateMachine** | Idle → BuildingContext → Processing → ToolWaiting → ToolExecuting → Done | 协议级状态管理和 WS 事件发射 |

两者跟踪相似的对话生命周期，但服务于不同抽象层。

### 4. 防御性 Room 创建

`RequestDispatcher.dispatch()` 在 `findById` 失败时自动创建 room。这是对 "消息先于 join 到达" 竞态的保护，但意味着 RoomRouter 和 RequestDispatcher 都可以创建 room，边界需要文档化。

## 已知关注点

1. **双重 `smFactory.create()` 调用**：RoomRouter 创建 FSM 后，RoomOrchestrator 再次调用 `create()`。若第一次的 FSM 未到达 `Done` 状态，第二次会抛 `already active` 异常。
2. **速率限制是内存级别**：进程重启后重置，多实例部署时不共享。
3. **所有服务在同一个 `AiModule` 中注册**：紧耦合，单元测试时需要 mock 整个链路。
