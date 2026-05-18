# Plan: WsGateway 业务逻辑完全解耦 — Envelope 消息架构

**Date**: 2026-05-18
**Branch**: main

## 问题陈述

当前的 `WsGateway` 虽然通过 MessageBus 实现了与业务模块的解耦（无业务模块导入），但仍在**传输层**订阅了 5 个具体业务消息类型：`create_and_send`、`send_message`、`join`、`stop`、`tool_result`。这意味着每次新增/删除业务消息类型都需要修改 WsGateway。

**核心问题**：WsGateway 作为纯传输层，不应该知道业务消息类型的存在。

## 提议方案：Envelope 消息结构

引入两层信封结构，将传输层协议与业务层协议分离：

```
┌─────────────────────────────────────────────┐
│ Transport Envelope (WsGateway 认识的唯一结构)  │
│ {                                           │
│   type: 'message' | 'log' | ...            │
│   payload: {                                │
│     type: 'create_and_send' | ...           │
│     payload: any                            │
│   }                                         │
│ }                                           │
└──────────────┬──────────────────────────────┘
               │ WsGateway 只认识外层 type
               ▼
┌─────────────────────────────────────────────┐
│ Business Envelope (MessageBus 处理)           │
│ { type: 'create_and_send',                  │
│   clientId: 'abc123',                       │
│   payload: { content: 'hello' } }           │
└──────────────┬──────────────────────────────┘
               │ AiModule 按内层 type 分发
               ▼
         RoomRouter / ToolDispatcher
```

## ASCII 数据流

```
Client ──socket.io──▶ WsGateway
                       │
                       │ 只订阅 @SubscribeMessage('message')
                       │ 解析外层 type, 提取内层 type + payload
                       ▼
                   MessageBus.publish({
                     type: innerType,     // 'create_and_send'
                     clientId: socket.id,
                     payload: innerPayload
                   })
                       │
              ┌────────┼────────┐
              ▼        ▼        ▼
        RoomRouter  ToolDisp  future handlers
       (subscribe    (subscribe
        5 types)     1 type)

未来扩展:
Client ──socket.io──▶ WsGateway
                       │
                       │ @SubscribeMessage('log')
                       ▼
                   LoggerService.publish(...)
```

## 接口定义

### 传输层信封 (ws 模块)

```typescript
// apps/server/src/ws/transport.types.ts

/** 传输层信封 — WsGateway 唯一认识的消息格式 */
export interface WsEnvelope<T = unknown> {
  type: string;              // 'message' | 'log' | 'heartbeat' ...
  payload: T;
}

/** 业务消息信封 — 当 type === 'message' 时 */
export interface BusinessMessage<T = unknown> {
  type: string;              // 'create_and_send' | 'send_message' | 'join' | ...
  payload: T;
}
```

### 客户端发送格式

```typescript
// 客户端发送 socket.emit('message', { type: 'create_and_send', payload: { content: 'hello' } })
```

### MessageBus 接口 (不变)

`BusMessage` 接口保持不变 — WsGateway 在 publish 时展平信封结构：

```typescript
interface BusMessage {
  type: string;        // 从信封内层提取
  clientId: string;
  payload: Record<string, unknown>;  // 从信封内层 payload 提取
}
```

## 变更影响分析

| 模块 | 变更 | 原因 |
|------|------|------|
| `ws/transport.types.ts` | **新建** — 信封接口定义 | 提供模块间解耦契约 |
| `ws/ws-gateway.ts` | **重构** — 5 个 handler → 1 个 handler | 传输层不应知道业务类型 |
| `ws/message-bus.ts` | **不变** — BusMessage 格式不变 | 展平发生在 WsGateway |
| `ws/ws.module.ts` | **不变** | 导出结构不变 |
| `ai/ai.module.ts` | **不变** — 订阅逻辑不变 | MessageBus 接口不变 |
| `ai/gateway/room-router.ts` | **不变** — 业务逻辑不变 | 从 MessageBus 收到的消息不变 |
| 前端 WS 客户端 | **修改** — 发送信封格式 | 适配新的消息结构 |

**关键设计决策**：AiModule 和 RoomRouter 的代码**不需要修改**。因为 WsGateway 在转发到 MessageBus 时会展平信封，MessageBus 的 `BusMessage` 格式不变，下游订阅者无感知。

## 实现步骤

### Step 1: 创建 `ws/transport.types.ts`

定义传输层信封接口和业务消息接口。这是各模块间的解耦契约。

### Step 2: 重构 `ws/ws-gateway.ts`

将 5 个 `@SubscribeMessage` handler 替换为 1 个：

```typescript
@SubscribeMessage('message')
async handleMessage(
  @MessageBody() data: BusinessMessage,
  @ConnectedSocket() client: Socket,
): Promise<void> {
  const { type, ...payload } = data;
  this.messageBus.publish({ type: String(type), clientId: client.id, payload });
}
```

移除所有 `@SubscribeMessage('create_and_send')` 等具体业务类型的 handler。

### Step 3: 更新前端 WS 客户端

将客户端发送的所有业务消息包装为信封格式：

```typescript
// Before:
socket.emit('create_and_send', { content: 'hello' });
// After:
socket.emit('message', { type: 'create_and_send', payload: { content: 'hello' } });
```

### Step 4: 更新测试

- 重写 `ws-gateway.spec.ts` — 测试单个 `message` handler 正确发布到 MessageBus
- 更新 `ai/gateway/__tests__/ws-gateway.spec.ts` — 集成测试使用信封格式
- 新增类型安全测试 — 验证信封格式的正确性

## 测试覆盖图

```
CODE PATHS                                          USER FLOWS
[+] ws/transport.types.ts                           [+] Message routing (envelope)
  ├── WsEnvelope interface (compile-time)             ├── [GAP] Envelope message → MessageBus publish
  └── BusinessMessage interface (compile-time)        ├── [GAP] Missing type field → error handling
                                                      └── [GAP] Unknown type → logged, no crash

[+] ws/ws-gateway.ts (refactored)                   [+] WebSocket lifecycle
  ├── handleConnection()                              ├── [GAP] Connect → registry.register
  ├── handleDisconnect()                              ├── [GAP] Disconnect → cleanup + MessageBus notify
  └── handleMessage() (single handler)                └── [GAP] Envelope message → publish to bus
      ├── [GAP] Valid envelope → publish
      ├── [GAP] Missing type → log warning
      └── [GAP] Invalid payload → log warning

COVERAGE: 0/9 paths tested (new code)  |  All paths need tests
QUALITY: No existing tests for new code paths
```

## NOT in scope

- **MessageBus 内部结构变更** — BusMessage 格式保持不变，避免级联修改
- **AiModule/RoomRouter 修改** — 展平发生在 WsGateway 层，下游无感知
- **SocketRegistry 重复实例问题** — 已在之前计划中标记，本次不修复
- **非消息类型扩展实现** — 保留 `log` 等类型扩展空间，但不实现具体 handler

## What already exists

| 现有 | 重用方式 |
|------|---------|
| `MessageBus` | 完全重用 — 接口不变 |
| `SocketRegistry` | 完全重用 |
| `AiModule.onModuleInit` 订阅 | 完全重用 — BusMessage 格式不变 |
| `RoomRouter` | 完全重用 — 无需修改 |
| `ai-ws-events.types.ts` ClientMessage | 可保留作为业务类型定义参考，客户端需要适配 |

## 失败模式分析

| 失败场景 | 测试覆盖 | 错误处理 | 用户可见性 | 严重性 |
|---------|---------|---------|-----------|-------|
| 客户端发送非信封格式 | **无** | **无** — 崩溃 | **白屏** | **CRITICAL** |
| 信封缺少 type 字段 | **无** | **无** — undefined | 静默失败 | **CRITICAL** |
| 信封 type 为空字符串 | **无** | **无** | 静默失败 (MessageBus warn) | Medium |
| 信封 payload 为 null | **无** | **无** | 可能导致下游 crash | Medium |

**关键缺口**：需要在 WsGateway 中添加输入验证，防止恶意/错误格式的客户端消息导致崩溃。

## 并行化

串行实现，所有步骤相互依赖。无并行化机会。

## 风险评估

| 风险 | 缓解措施 |
|------|---------|
| 前端未同步更新导致消息丢失 | 客户端和服务端必须同步部署，或 WsGateway 兼容两种格式 |
| 信封嵌套增加调试难度 | 清晰的类型定义 + 日志记录 |
| `_publish` 方法过于简单，缺少验证 | 添加输入验证：检查 type 存在性和非空 |

## 完成标准

1. `nest start` 运行无 DI 错误
2. 所有现有 WebSocket 消息类型端到端工作
3. WsGateway 对业务消息类型**零引用** — 不 import/不 switch/不硬编码
4. 信封类型定义在 `ws/transport.types.ts` 中
5. MessageBus 的 `BusMessage` 接口**不变**
6. 前端发送信封格式消息
7. WsGateway 测试覆盖所有新代码路径
8. 输入验证：无效信封格式不崩溃
