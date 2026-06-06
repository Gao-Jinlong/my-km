# Fix: SSE 事件持久化 + 消息历史显示

> 生成日期: 2026-06-07
> 分支: main
> 状态: 已审查，待实现
> 优先级: P1 (两个用户可见的核心缺陷)

---

## 问题描述

### Bug 1: 前端只显示最近一次对话消息

用户在 AI 对话中发送消息后，前端只显示"当前 run"的一对消息（一个 human + 一个 AI 回复），之前所有的对话历史消失。

### Bug 2: SSE 事件未入库到 RunEvent 表

`executeRunProtocol` 中所有 SSE 事件通过 `writeSSE()` 直接写入 HTTP Response，完全绕过了 `RunRecord.emitEvent()`。导致 RunEvent 表始终为空，回放、断线重连、多端同步全部失效。

---

## 根因分析

### Bug 1 根因: `values` SSE 事件只包含当前 run 的消息

**文件:** `apps/server/src/ai/ai.service.ts:210-218`

```typescript
// executeRunProtocol() 中：
const accumulatedMessages = [
    { role: 'human', content },  // 只有当前 run 的 user 消息
];
if (assistantText) {
    accumulatedMessages.push({ role: 'ai', content: assistantText });
}
writeValues(res, toLangChainMessages(accumulatedMessages));
```

`writeValues` 发送的 `values` SSE 事件中的 `messages` 数组只有当前 run 的消息。
前端 `useStream` (来自 `@langchain/langgraph-sdk`) 收到 `values` 事件后**整体替换**
`stream.messages`，所以每次新 run 都会把之前消息清掉。

**修复方案:** 从 `CheckpointReaderService` 读取 thread 的完整历史消息，
与当前 run 的新消息合并后作为 `values` 事件发送。

### Bug 2 根因: `executeRunProtocol` 绕过了 `RunRecord.emitEvent()`

**文件:** `apps/server/src/ai/ai.service.ts:144-234`

```
当前数据流（SSE only，EventStore 被跳过）:

  executeRunProtocol()
    ├── writeMetadata(res, ...)  → writeSSE() → Response  ✗ EventStore
    ├── graph.stream(...)
    ├── writeValues(res, ...)    → writeSSE() → Response  ✗ EventStore
    └── writeEnd(res)           → writeSSE() → Response  ✗ EventStore

  RunRecord.emitEvent() ← 从未被调用！
    ├── sseWriter(event)        → Response  (sseWriter 未设置 = undefined)
    └── eventStore.append(...)  → DB        (从未执行)
```

两个子问题:
1. `record.setSseWriter()` 从未被调用 → `sseWriter` 始终为 `undefined`
2. `executeRunProtocol` 使用独立的 `writeSSE()` 函数 → `EventStore` 从未被写入

**修复方案:** 在 `streamRun` 中调用 `record.setSseWriter()` 桥接 `writeSSE`，
然后用 `record.emitEvent()` 替换所有直接 `writeSSE` 调用。

---

## 修复方案

### 分阶段策略

**Phase 1 (P1, 立即修复):** 后端发完整历史 + EventStore 写入
**Phase 2 (后续迭代):** 前端三源合并（RunEvent 历史 + 实时 SSE + 乐观更新）用于断线重连

### 修复后数据流

```
  executeRunProtocol()
    │
    ├── record.setSseWriter(bridge)    ← 新增：桥接 writeSSE
    │
    ├── record.emitEvent('metadata')   ← 改：从 writeMetadata → emitEvent
    │     ├── sseWriter → writeSSE → Response  ✅ SSE
    │     └── eventStore.append()              ✅ EventStore (缓冲)
    │
    ├── graph.stream(...)
    │
    ├── CheckpointReader.getMessages() ← 新增：读取完整历史
    │
    ├── record.emitEvent('values')     ← 改：包含完整历史 + 当前 run 消息
    │     ├── sseWriter → writeSSE → Response  ✅ SSE
    │     └── eventStore.append()              ✅ EventStore (缓冲)
    │
    ├── record.emitEvent('end')        ← 改：从 writeEnd → emitEvent
    │     ├── sseWriter → writeSSE → Response  ✅ SSE
    │     └── eventStore.append()              ✅ EventStore (缓冲)
    │
    └── eventStore.flush()             ← 新增：run 结束时刷缓冲
```

---

## Implementation Tasks

### T1 (P1) — Bridge writeSSE into RunRecord via setSseWriter

**改动文件:**
- `apps/server/src/ai/langgraph/threads.controller.ts`
- `apps/server/src/ai/run/run-record.ts`

**具体改动:**

在 `streamRun` 方法中，调用 `executeRunProtocol` 之前，设置 sseWriter：

```typescript
// threads.controller.ts streamRun() 中
record.setSseWriter((event) => {
    writeSSE(res, event.event, event.data);
});
```

**验证:** 单元测试 — setSseWriter 桥接后 emitEvent 正确调用 writeSSE

---

### T2 (P1) — Replace direct writeSSE calls with record.emitEvent

**改动文件:**
- `apps/server/src/ai/ai.service.ts`
- `apps/server/src/ai/langgraph/langgraph-protocol.ts`

**具体改动:**

在 `executeRunProtocol` 中，将所有直接 `writeMetadata/writeValues/writeEnd/writeError` 调用替换为 `record.emitEvent()`:

```typescript
// 之前:
writeMetadata(res, record.id, record.threadId);
writeValues(res, toLangChainMessages(accumulatedMessages));
writeEnd(res);
writeError(res, 'execution_error', ...);

// 之后:
await record.emitEvent({ event: 'metadata', data: { run_id: record.id, thread_id: record.threadId } });
await record.emitEvent({ event: 'values', data: { messages: toLangChainMessages(allMessages) } });
await record.emitEvent({ event: 'end', data: {} });
await record.emitEvent({ event: 'error', data: { error: 'execution_error', message: ... } });
```

`writeMetadata`/`writeValues`/`writeEnd`/`writeError` 可以保留作为工具函数（向后兼容），但 `executeRunProtocol` 不再直接调用它们。

**验证:** 单元测试 — 每个 SSE 事件类型都通过 emitEvent 发送；EventStore 收到所有事件

---

### T3 (P1) — Include full thread history in values SSE event

**改动文件:**
- `apps/server/src/ai/ai.service.ts`
- `apps/server/src/ai/checkpointer/checkpoint-reader.service.ts`

**具体改动:**

在 `executeRunProtocol` 中，graph 执行完成后，从 checkpoint 读取完整历史：

```typescript
// graph 执行完成后...
// 读取 checkpoint 中的完整历史消息
const checkpointMessages = await this.checkpointReader.getMessages(record.threadId);

// 合并当前 run 的消息（checkpoint 可能已包含，需去重或直接使用 checkpoint 版本）
const allMessages = checkpointMessages.length > 0
    ? checkpointMessages
    : accumulatedMessages; // fallback

await record.emitEvent({ event: 'values', data: { messages: toLangChainMessages(allMessages) } });
```

**关键注意:** LangGraph 的 `graph.stream()` 带 `thread_id` 和 `checkpointer` 时，graph 内部会自动将新消息追加到 checkpoint 中。所以 `graph.stream()` 执行完毕后，checkpoint 已经包含了完整历史。直接从 checkpoint 读取即可。

**验证:** 单元测试 — values 事件包含所有历史消息（多个 run 的消息都在）

---

### T4 (P2) — Add buffer+flush to RunEventStore

**改动文件:**
- `apps/server/src/ai/store/run-event-store.ts`

**具体改动:**

添加内存缓冲区，达到阈值或显式 flush 时批量写入：

```typescript
class RunEventStore {
    private buffer = new Map<string, { runId: string; threadId: string; events: BatchEventOpts[] }>();
    private readonly FLUSH_THRESHOLD = 10;

    async append(runId: string, threadId: string, event: AppendEventOpts) {
        // 缓冲而非直接写入
        const key = runId;
        if (!this.buffer.has(key)) {
            this.buffer.set(key, { runId, threadId, events: [] });
        }
        this.buffer.get(key)!.events.push(event);

        // 阈值触发
        if (this.buffer.get(key)!.events.length >= this.FLUSH_THRESHOLD) {
            await this.flushRun(runId);
        }
    }

    async flushRun(runId: string) {
        const entry = this.buffer.get(runId);
        if (!entry || entry.events.length === 0) return;
        await this.appendBatch(entry.runId, entry.threadId, entry.events);
        this.buffer.delete(runId);
    }

    async flushAll() {
        for (const runId of this.buffer.keys()) {
            await this.flushRun(runId);
        }
    }
}
```

在 `executeRunProtocol` 的 finally 块中调用 `eventStore.flushRun(record.id)`。

**验证:** 单元测试 — buffer 累积、阈值 flush、显式 flushRun

---

### T5 (P2) — Fix message ID generation

**改动文件:**
- `apps/server/src/ai/langgraph/langgraph-protocol.ts`

**具体改动:**

`toLangChainMessages` 中，如果消息已有 `id`（来自 checkpoint），保留它；否则生成 `crypto.randomUUID()`:

```typescript
export function toLangChainMessages(
    internalMessages: Array<{ role: string; content: string; id?: string }>,
): Array<Record<string, unknown>> {
    return internalMessages.map((msg) => ({
        type: msg.role === 'user' || msg.role === 'human' ? 'human' : 'ai',
        content: msg.content,
        id: msg.id ?? crypto.randomUUID(),
    }));
}
```

**验证:** 同一消息多次序列化 ID 不变

---

### T6 (P1) — Add regression tests

**改动文件:**
- `apps/server/src/ai/__tests__/ai.service.spec.ts`
- `apps/server/src/ai/store/__tests__/run-event-store.spec.ts`

**需要的测试:**

1. **emitEvent → EventStore 写入验证**: executeRunProtocol 调用后，验证 `eventStore.append` 被调用了正确的次数（至少 3 次: metadata + values + end）
2. **values 事件包含完整历史**: 使用 mock checkpointReader 返回多条历史消息，验证 values 事件包含所有历史
3. **setSseWriter 桥接**: 验证 setSseWriter 后 emitEvent 正确调用 sseWriter callback
4. **RunEventStore buffer + flush**: 缓冲累积、阈值触发、显式 flushRun
5. **消息 ID 稳定性**: 同一消息多次序列化 ID 不变

---

## NOT in scope

| Item | Rationale |
|------|-----------|
| 流式 chunk 事件 (messages/partial) | 当前阶段用户可见的 bug 是消息丢失，不是流式体验。作为后续优化 |
| SSE 断线重连端点 | 需要 RunEvent 数据先入库 (T2/T4)，重连端点依赖于此 |
| 前端三源合并 | Phase 2: 后端先发完整历史 (T3)，前端后续迭代加载+合并 |
| stream_mode 参数处理 | 当前 SDK 默认 values 模式，兼容性足够 |

---

## Execution Order

```
Phase 1 (P1 blockers):

  并行 Lane A (不冲突的文件):
    T1: setSseWriter bridge     → threads.controller.ts + run-record.ts
    T5: Fix message IDs         → langgraph-protocol.ts

  Sequential (同文件 ai.service.ts):
    T3: Full history in values   ← 依赖 CheckpointReader
    T2: Replace writeSSE         ← 依赖 T1 (sseWriter 已设置)
    T4: Buffer+flush             ← 依赖 T2 (emitEvent 是写入路径)
    T6: Tests                    ← 所有改动完成后

  推荐执行顺序: T1 + T5 (并行) → T3 → T2 → T4 → T6
```

---

## Review Readiness Dashboard

```
+====================================================================+
|                    REVIEW READINESS DASHBOARD                       |
+====================================================================+
| Review          | Runs | Last Run            | Status    | Required |
|-----------------|------|---------------------|-----------|----------|
| Eng Review      |  7   | 2026-06-07 01:18    | ISSUES    | YES      |
| CEO Review      |  0   | —                   | —         | no       |
| Design Review   |  0   | —                   | —         | no       |
| Outside Voice   |  2   | 2026-06-07 01:15    | FOUND     | no       |
+--------------------------------------------------------------------+
| VERDICT: ISSUES OPEN — Eng Review found 9 issues, 2 critical gaps  |
+====================================================================+
```
