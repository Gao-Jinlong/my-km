# LLM 对话协议重构 P3：跨副本 cancel/interrupt + SSE 解耦 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成多副本部署的最后拼图：非 owner 副本收到 `POST /cancel` / `POST /interrupt` 请求时，通过 RedisEventBus 将信号转发给 owner 副本；owner abort 正在执行的 run → 写入 `end{finish_reason:'cancelled'}` 终态；所有 joinStream 的前端订阅方通过 SSE 统一收到终态并关闭。同时将 SSE 写入从 `emitEvent` 解耦为 `RunEventSink` 订阅模式（与 PG/EventBus 并列三路），消除 P1/P2 遗留的代码耦合。

**Architecture:**
1. **信号渠道**：复用已实现的 `EventBus`（默认 `InProcessEventBus`，配置 `AI_EVENT_BUS=redis` 时切 `RedisEventBus`），新增 `control` channel `run:{runId}:control`（与事件流的 `run:{runId}` channel 区分），payload 含 `kind: 'cancel'|'interrupt'` + `sourceReplicaId`（排重用）。
2. **跨副本 cancel**：`ThreadsController.cancelRun` 先查 PG `Run` 表判断是否为本副本 owner；本副本 owner → 走现有 `runManager.getActiveRunByThread(thread.id).abort()`；非 owner → 先检查 run 是否 `status∈{running,interrupted}`（否则 `400 / 404`）→ `EventBus.publish('run:{runId}:control', {kind:'cancel', sourceReplicaId: REPLICA_ID})` + `202 Accepted`。
3. **owner receive signal**：`StartRun` 时 subscribe `run:{runId}:control` channel，若收到 `cancel` → `RunRecord.abort()` 触发 SSE `end{cancelled}`；收到 `interrupt` → `RunRecord.abort()` 触发 interrupt 分支（待后续 `interrupted` 状态逻辑）。
4. **跨副本 interrupt**：`startRun` 的并发控制路径中，`multitask_strategy='interrupt'` 且 active run owner≠本副本时，先 publish control signal + `202 Accepted`（不再像 P1 那样 reject+warn）。
5. **SSE 解耦**：`RunRecord.emitEvent` / `emitSSEOnly` 不再直接调用 `sseWriter` 回调；改为 `RunRecord` 内部维护 `Set<RunEventSink>`（当前只有 SSE 一个 sink，但架构支持多 sink），通过 `registerSink(sink): () => void` 注册；`threads.controller.ts` 的 `setSseWriter` 改为注册 `RunEventSink` 而非写回调。解耦后三路（PG/EventBus/SSE）对称。

**Tech Stack:** NestJS + Jest（`apps/server`，`pnpm exec jest`）、Prisma 7（`@my-km/prisma`）、Redis（`docker-compose` 已就绪，本地开发 `InProcessEventBus` 无需 Redis）。无新依赖。

**Spec:** `docs/superpowers/specs/2026-06-15-llm-conversation-protocol-design.md` 第 3.7 节（stop/cancel 统一语义）、第 4.2-4.4 节（interrupted 稳态与并发 resume）、第 6.3 节（EventBus 拓扑 + 迁移策略）。

---

## 关键设计约束（实现时不可违背）

1. **PG Run.status 是 cancel/interrupt 合法性的唯一依据**：非 owner 副本收到 cancel/interrupt 前，先查 PG `Run` 表的 `status` 与 `ownerId`；只有 `status∈{running,interrupted}` 才允许发控制信号；terminal status（completed/failed/cancelled）返回 `400`；run 不存在返回 `404`。
2. **控制信号与事件流分 channel**：事件流 channel `run:{runId}`，控制 channel `run:{runId}:control`。不要把 control event 混入事件流；SSE 端的 `RunEventSink` 只消费事件流 channel，不消费 control channel。
3. **sourceReplicaId 排重**：控制信号 payload 带 `sourceReplicaId`；owner 收到信号后，若 `sourceReplicaId === REPLICA_ID`（自己发的）跳过；避免 cancel 端（碰巧就是 owner 自己）先 abort 后 publish 造成重复。
4. **cancel 终态唯一写入源 = owner RunRecord.abort()**：非 owner 只发信号，不直接写 PG Run.status；收到信号后由 owner 的 `RunRecord.abort()` 执行 abort → `executeRunProtocol` catch/finally 写 `RunEvent end{cancelled}` 并更新 PG Run.status。
5. **RunEventSink 是 SSE 唯一入口**：`threads.controller.ts` 的 `setSseWriter(event => writeSSE(...))` 改为 `record.registerSink(sink)`，其中 `sink.push(event)` 就是原来的 `writeSSE(...)`。解耦后，`RunRecord.emitEvent` 只有 PG append + EventBus publish + sink.push；不再有硬编码 sseWriter callback if。
6. **interrupt 跨副本语义**：P3 先实现框架——active run owner≠本副本且 `multitask_strategy='interrupt'` 时 publish control signal + `202 Accepted`，不再 reject+warn。graph 的 checkpoint interrupt/rollback 逻辑保持不变，P4 再细化 checkpoint 回滚边界。
7. **本阶段边界**：仅后端改动；前端 `chat-runtime.ts` 零改动（stop 统一已经在 P2-4 完成；前端不感知跨副本 cancel/interrupt）。**不**做：checkpoint rollback 语义、resume 工具权限 / 冲突解决、前端控制 UI。
8. **向后兼容**：`AI_EVENT_BUS=in-process` 本地开发场景下，控制信号通过 `InProcessEventBus` 的 `Emitter.fire` 同步传递，功能完整无需 Redis。

---

## File Structure

**新建：**
- `apps/server/src/ai/run/run-event-sink.ts` — 从 join-stream.service.ts 移过来重命名为可注册接口（本阶段统一）
- `apps/server/src/ai/run/__tests__/run-record-sink.spec.ts` — RunEventSink 注册/注销/去重测试

**修改：**
- `apps/server/src/ai/run/run-record.ts` — `registerSink(sink): () => void` + `Set<RunEventSink>`；`emitEvent`/`emitSSEOnly` 移除 sseWriter 回调，改为对每个 sink 调用 `push({eventType, payload, seq})`
- `apps/server/src/ai/run/run-manager.ts` — `createRun`/`startRun` 时可选注册默认 sink
- `apps/server/src/ai/langgraph/threads.controller.ts` — `setSseWriter(event => writeSSE(...))` → `record.registerSink(sink)`（sink 是 `{push: e => writeSSE(res, e.eventType, e.payload, e.seq), close: () => {..}}`）；`cancelRun` 查 PG owner 分支发信号；`streamRun` 路径 subscribe control channel
- `apps/server/src/ai/ai.service.ts` — 注入 EventBus + REPLICA_ID；`executeRunProtocol` subscribe control channel；finally 段 unsubscribe
- `apps/server/src/ai/langgraph/__tests__/threads.controller.spec.ts` — 加非 owner cancel 返回 202 / owner cancel 返回 204 测试
- `apps/server/src/ai/__tests__/ai.service.spec.ts` — 加跨副本 control signal 接收并 abort 测试

---

## Task 1: 后端 SSE 解耦为 RunEventSink 注册模式

**Goal:** 移除 `run-record.ts` 中硬编码的 `sseWriter` callback，改为 `registerSink` 注册制（PG append / EventBus publish / SSE push 三路对称）。

**Files:**
- Modify: `apps/server/src/ai/run/run-record.ts`
- Modify: `apps/server/src/ai/langgraph/threads.controller.ts`
- Create: `apps/server/src/ai/run/run-event-sink.ts`（从 join-stream.service.ts 移入统一接口）
- Create: `apps/server/src/ai/run/__tests__/run-record-sink.spec.ts`

- [ ] **Step 1: 统一 RunEventSink 接口**

确认或新建 `apps/server/src/ai/run/run-event-sink.ts`（与 join-stream.service.ts 一致，统一全模块用）：

```ts
/**
 * Run 事件流 sink（SSE 推送 / 回放推等）。spec 3.8。
 * close() 幂等。
 */
export interface RunEventSink {
    push(event: { seq: number; eventType: string; payload: unknown }): void;
    close(): void;
}
```

- [ ] **Step 2: RunRecord.registerSink**

在 `RunRecord` 类中（private 成员段顶部，`sseWriter` 之前）加：

```ts
private readonly sinks = new Set<RunEventSink>();

/**
 * 注册事件 sink（如 SSE Response 推送），返回注销函数。
 * close() 会从 sinks Set 中自动移除吗？注销函数会从 Set 移除。
 */
registerSink(sink: RunEventSink): () => void {
    this.sinks.add(sink);
    return () => {
        sink.close();
        this.sinks.delete(sink);
    };
}
```

- [ ] **Step 3: emitEvent 与 emitSSEOnly 遍历 sinks 推送**

替换 `emitEvent` 中旧 `if (this.sseWriter) { this.sseWriter(event); }` 为：

```ts
// [1] Sink push（如 SSE）
for (const sink of this.sinks) {
    sink.push({ seq, eventType: event.event, payload: event.data });
}
```

替换 `emitSSEOnly` 中旧 `if (this.sseWriter) { this.sseWriter(event); }` 为同样的 sinks 遍历。

删除私有字段 `sseWriter?: ...`，删除 `setSseWriter` 方法。

- [ ] **Step 4: threads.controller.ts 适配**

`streamRun` 中 `record.setSseWriter(...)` 替换为：

```ts
const unregister = record.registerSink({
    push(e) {
        writeSSE(res, e.eventType, e.payload, e.seq);
    },
    close() {
        if (!res.writableEnded) {
            res.end();
        }
    },
});
```

在 try/finally 中调用 unregister：

```ts
try {
    await this.aiService.executeRunProtocol(record);
} finally {
    unregister();
}
```

- [ ] **Step 5: 写失败测试**

在 `apps/server/src/ai/run/__tests__/run-record-sink.spec.ts` 中：

- registerSink 返回注销函数；调用注销后 sink 不再收到 push
- 注册多个 sink，每个都收到 emitEvent

- [ ] **Step 6: 运行测试确认 PASS**
- [ ] **Step 7: 提交**

---

## Task 2: 跨副本 cancel 终态

**Files:**
- Modify: `apps/server/src/ai/run/run-record.ts`（加 control 订阅/接收 abort）
- Modify: `apps/server/src/ai/langgraph/threads.controller.ts`（cancel 分 owner/非 owner 分支）
- Modify: `apps/server/src/ai/ai.service.ts`（注入 EventBus/REPLICA_ID；executeRunProtocol 期间订阅 control channel）
- Modify: `apps/server/src/ai/run/__tests__/run-record-sink.spec.ts`（加 control signal abort 测试）
- Modify: `apps/server/src/ai/langgraph/__tests__/threads.controller.spec.ts`（加非 owner cancel 202 / owner cancel 204 测试）

- [ ] **Step 1: RunRecord 加 control 订阅**

在 `RunRecord` 加方法（放在 registerSink 之后）：

```ts
/**
 * 订阅 run 的控制 channel（cancel/interrupt 等），返回 unsubscribe。
 * 收到 cancel → this.abort()。收到 interrupt → this.abort()（graph rollback 路径）。
 */
subscribeControlChannel(eventBus: EventBus, replicaId: string): () => void {
    const channel = `run:${this.id}:control`;
    return eventBus.subscribe(channel, (event: { kind: string; sourceReplicaId: string }) => {
        if (event.sourceReplicaId === replicaId) return; // 排重：自己发的跳过
        if (event.kind === 'cancel' || event.kind === 'interrupt') {
            this.abort();
        }
    });
}
```

- [ ] **Step 2: ai.service.ts 注册 control channel**

在 `executeRunProtocol` 开头（try 块之前）注册 control channel（用 record.subscribeControlChannel），finally 中调用 unsubscribe。注入 `EventBus` + `REPLICA_ID` token。

- [ ] **Step 3: threads.controller.ts cancelRun 分支**

修改 `POST /:threadId/runs/:runId/cancel`：
1. 查 PG `Run` 表 `prisma.run.findUnique({where:{id:runId}, select: { ownerId: true, status: true, threadId: true } })`
2. 若不存在 → 404
3. 若 `status ∈ {completed, failed, cancelled}` → 400（已有终态）
4. 若 `ownerId === REPLICA_ID`（本副本是 owner）：`runRecord.abort()` → `204 No Content`
5. 否则：`eventBus.publish('run:{runId}:control', {kind:'cancel', sourceReplicaId: REPLICA_ID})` → `202 Accepted`

- [ ] **Step 4: 写 controller 级测试**

- [ ] **Step 5: 写 ai.service.spec 级 end-to-end 测试（跨副本 signal 收到 abort）**

- [ ] **Step 6: 运行测试确认 PASS**
- [ ] **Step 7: 提交**

---

## Task 3: 跨副本 interrupt 信号（multitask_strategy='interrupt'）

**Files:**
- Modify: `apps/server/src/ai/ai.service.ts`（startRun 并发 check 分支：active run owner≠本副本时发 interrupt signal + 202 Accept）
- Modify: `apps/server/src/ai/__tests__/ai.service.spec.ts`（加跨副本 interrupt 202 测试）

- [ ] **Step 1: startRun 并发检查改 reject+warn 为 publish+202**

找到 `handleConcurrency` 函数 / startRun 的并发判断逻辑（P1 加的，原逻辑：跨副本无法 abort，退化为 reject + warn）。将 `multitask_strategy === 'interrupt'` 分支改为：

- 若 `active.ownerId === REPLICA_ID` → 同副本，直接 abort（原逻辑）
- 否则 → `eventBus.publish('run:{active.id}:control', {kind:'interrupt', sourceReplicaId: REPLICA_ID})` → `return {accepted: true, runId: active.id}`（202）

- [ ] **Step 2: 加测试覆盖**

- [ ] **Step 3: 运行测试确认 PASS**
- [ ] **Step 4: 提交**

---

## Task 4: 回归 + 配置说明 + 迁移文档

**Files:**
- Modify: `docs/superpowers/specs/2026-06-15-llm-conversation-protocol-design.md`（spec 6.3 P3 scope 标注 completed）
- Modify: `AGENTS.md` / `README.md`（如有的话，部署配置说明 `AI_EVENT_BUS=redis` 才能多副本 cancel/interrupt）
- Verify: `pnpm exec jest src/ai src/config --runInBand`

- [ ] **Step 1: 后端全量回归**
- [ ] **Step 2: 验证文档更新**
- [ ] **Step 3: 提交**

---

## 验收标准

- [ ] 非 owner cancel → 返回 `202 Accepted`；owner cancel → 返回 `204`；terminal run cancel → `400`
- [ ] 非 owner cancel 后，owner 副本 run 被 abort，SSE 流收到 `end{cancelled}` 终态并关闭
- [ ] `multitask_strategy='interrupt'` 跨副本 → 返回 `202`，owner 收到 signal 后 abort
- [ ] control channel 事件不会混入 SSE 事件流
- [ ] registerSink 注册多个 sink 都能收到事件；注销后不再收到
- [ ] `AI_EVENT_BUS=in-process` 全功能可用；无需 Redis
- [ ] 后端 `src/ai src/config` jest 全绿
- [ ] 无破坏性改动：前端代码零改动；单副本部署行为不变

---

## 本阶段不做（留给后续）

- checkpoint rollback 语义细化
- resume 工具权限 / 冲突解决
- 前端控制 UI
- 工具卡片视觉（P4）
- 6-atom 快照拆分（P4）
- 编辑器上下文事件驱动（P4）
- `joinStream` / interrupt 端到端视觉反馈（P4）

---

## 如何验证端到端（部署级，非 CI）

1. 启动两个后端实例，同 PG / Redis，`AI_EVENT_BUS=redis`。
2. Instance A 发起 `POST /threads/{tid}/runs/stream`（让 run 进入 streaming）。
3. 在 Instance B 调 `POST /threads/{tid}/runs/{rid}/cancel`，应返回 `202 Accepted`。
4. Instance A 的 SSE 流应收到 `end{finish_reason:'cancelled'}` 并关闭。
5. 切换到 `AI_EVENT_BUS=in-process`（单副本），步骤 2-4 同样成功。
