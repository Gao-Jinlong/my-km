# WSClientService Disposable Refactoring Plan

## Summary
将 WSClientService 的 refCount（引用计数）管理改为 Disposable 模式。WSClientService 维护一个 `DisposableStore` 追踪所有订阅，消费者只需调用 `event.on(cb)` 获取 Disposable，无需感知 `acquire()/release()`。连接生命周期与订阅数量绑定：首次订阅时自动连接，最后一个订阅 dispose 后启动 idle timer 超时断开。

## Architecture

```
重构前:                                    重构后:
  acquire() ──→ refCount++                   onXxx(cb) ──→ 内部计数++
  release() ──→ refCount--                       │
     │                                            ├─ count==1: auto _connect()
     ├─ refCount==1 → _connect()                  ├─ count==0: startIdleTimer
     └─ refCount==0 → startIdleTimer              └─ idle timeout → _disconnect()

 消费者需调用 acquire/release                 消费者只需 dispose() 订阅
```

## Design Decisions

1. **Idle timer 保留** — 所有订阅 dispose 后 30s 自动断开，新订阅到来时自动重连
2. **disconnect() 变为 no-op** — AIHarnessService.disconnect() 不再触发 WS 断开
3. **完全删除旧 API** — acquire/release/refCount/ensureConnected/startIdleTimer/stopIdleTimer 全部移除
4. **新增 `subscribe(event, cb)` 模式** — 通过改造 event accessor 实现，消费者无需改动调用方式

## Implementation Steps

### Step 1: 重构 WSClientService (ws-client.service.ts)

**1.1 移除旧公开 API：**
- 删除 `get refCount()`
- 删除 `acquire()` / `release()`
- 删除 `ensureConnected()`
- 删除 `startIdleTimer()` / `stopIdleTimer()` 公开方法
- 删除 `_refCount` 字段

**1.2 新增订阅追踪机制：**
- 新增 `_subscriptions: DisposableStore` 字段
- 新增 `_subscriptionCount: number` 字段（初始 0）
- 新增私有方法 `_ensureConnected(): Promise<void>` — 如果未连接则建立连接，已连接则清除 idle timer

**1.3 新增内部方法 `_registerSubscription(d: IDisposable): IDisposable`：**

```typescript
private _registerSubscription(d: IDisposable): IDisposable {
    this._subscriptionCount++;
    if (this._subscriptionCount === 1) {
        this._ensureConnected(); // 首次订阅自动连接
    }
    this._subscriptions.add(d);

    // 返回包装后的 Disposable
    return toDisposable(() => {
        d.dispose();
        this._subscriptionCount--;
        this.stopIdleTimer(); // 取消 idle timer
        if (this._subscriptionCount === 0) {
            this.startIdleTimer(); // 无订阅时启动 idle timer
        }
    });
}
```

**1.4 改造所有 event accessor 使用 `_registerSubscription`：**

```typescript
// 改造前:
get onStreamChunk(): Event<{ content: string }> {
    return this._onStreamChunk.event;
}

// 改造后:
get onStreamChunk(): Event<{ content: string }> {
    return (cb) => this._registerSubscription(this._onStreamChunk.event(cb));
}
```

对所有 9 个 event accessor 应用相同模式：
- onConnectionChange
- onStreamChunk
- onToolCall
- onStreamDone
- onError
- onHistory
- onToolTimeout
- onCreated
- onStatus
- onDone

**1.5 改造 sendXxx 方法自动连接：**

```typescript
sendCreateAndSend(content: string, context: unknown): void {
    if (!this._socket || !this._socket.connected) {
        throw new Error('WebSocket is not connected');
    }
    this._socket.emit('create_and_send', { type: 'create_and_send', content, context });
}
// sendXxx 方法保持不变，不自动连接（行为与现有代码一致）
```

**1.6 改造 `dispose()`：**

```typescript
override dispose(): void {
    // 清除 idle timer
    this.stopIdleTimer();
    // 清理所有订阅（触发每个 subscribe 的 dispose 回调）
    this._subscriptions.dispose();
    // 断开连接
    this._socket?.disconnect();
    this._socket = null;
    // 清理 emitters
    this._onStreamChunk.dispose();
    this._onToolCall.dispose();
    // ... 所有 emitter dispose
    super.dispose();
}
```

**1.7 将 `startIdleTimer` 和 `stopIdleTimer` 转为 private：**

```typescript
private startIdleTimer(): void { ... }
private stopIdleTimer(): void { ... }
```

### Step 2: 更新 AIHarnessService (ai-harness.service.ts)

**2.1 `connect()` 方法简化：**
```typescript
// 改造前:
async connect(_wsUrl: string): Promise<void> {
    await this._wsClient.ensureConnected();
}

// 改造后:
async connect(_wsUrl: string): Promise<void> {
    // WS 连接由订阅自动管理，无需显式连接
    // 保留此方法以保持 API 兼容
}
```

**2.2 `disconnect()` 变为 no-op：**
```typescript
// 改造前:
disconnect(): void {
    this._wsClient.release();
}

// 改造后:
disconnect(): void {
    // WS 连接由订阅自动管理
}
```

**2.3 移除 `_setupToolCallHandler()` 中的 `stopIdleTimer()` 调用：**
- 删除 [ai-harness.service.ts:200](apps/web/src/features/ai/harness/ai-harness.service.ts#L200) `this._wsClient.stopIdleTimer()`
- 删除 [ai-harness.service.ts:206](apps/web/src/features/ai/harness/ai-harness.service.ts#L206) `this._wsClient.stopIdleTimer()`

**2.4 移除 `sendMessage()` 和 `sendCreateAndSend()` 中的 `stopIdleTimer()` 调用：**
- 删除 [ai-harness.service.ts:271](apps/web/src/features/ai/harness/ai-harness.service.ts#L271) `this._wsClient.stopIdleTimer()`
- 删除 [ai-harness.service.ts:297](apps/web/src/features/ai/harness/ai-harness.service.ts#L297) `this._wsClient.stopIdleTimer()`

### Step 3: 更新 useAIHarness (use-ai-harness.ts)

**3.1 移除 `subscribe()` 中的 `acquire()` 调用：**
- 删除 [use-ai-harness.ts:117](apps/web/src/hooks/use-ai-harness.ts#L117) `harness.wsClient.acquire()`

**3.2 移除 unsubscribe 中的 `release()` 调用：**
- 删除 [use-ai-harness.ts:137](apps/web/src/hooks/use-ai-harness.ts#L137) `harness.wsClient.release()`

### Step 4: 更新测试

**4.1 现有测试 `ws-client-protocol.test.ts` 不需要改动** — 这些测试不依赖 acquire/release

**4.2 新增测试覆盖：**
- 首次订阅时自动建立连接
- 最后一个订阅 dispose 后启动 idle timer
- idle timeout 后自动断开连接
- 新订阅到来时自动重连
- dispose() 清理所有资源

## Failure Modes

| 失败场景 | 测试覆盖 | 错误处理 | 用户可见 |
|---------|---------|---------|---------|
| 首次订阅连接失败 | [GAP] | onError 事件 | 静默失败 |
| idle timer 期间新订阅 | 需要测试 | 自动重连 | 用户无感 |
| dispose 后再次订阅 | [GAP] | 需要抛出有意义的错误 | 开发时可见 |

## Test Plan

Generated by /plan-eng-review on 2026-05-14
Branch: main
Repo: ginlon/my-km

### Critical Paths
- [→INT] 组件挂载 → 创建订阅 → WS 自动连接 → 收到消息 → 组件卸载 → dispose → 30s 后 WS 断开
- [→INT] 多个组件同时订阅 → 共享一个连接 → 最后一个 dispose → 启动 idle timer
- 网络断开重连 → 订阅仍在 → 重连成功后继续工作

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | issues_open | 4 issues, 1 critical gap |

- **UNRESOLVED:** 0
- **VERDICT:** ENG issues_open — review in progress
