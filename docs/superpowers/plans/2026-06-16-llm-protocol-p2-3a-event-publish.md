# LLM 对话协议重构 P2-3a：Run 事件发布到 EventBus 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 owner 副本执行 run 时，把产生的所有事件（状态边界 `metadata`/`values`/`tasks`/`end`/`error` + 临时 `messages` token）发布到 `EventBus`，使非 owner 副本能通过订阅 `run:{runId}` 收到实时事件流。这是 P2-3b（joinStream 续实时）的**必要前提** —— 当前 `RunRecord.emitEvent` 只写 SSE + PG，不 publish，非 owner 副本重连后收不到任何实时事件。

**Architecture:** `EventBus` 经 `RunContextFactory` 注入，随 `RunContext` 传到 `RunRecord`（`runContext.eventBus`）。`emitEvent`（状态边界）在分配 `seq` 后三路：SSE → PG append → `eventBus.publish(runChannel(runId), {seq, eventType, payload})`（publish 失败 warn 不阻塞，spec 3.3 [2]）。`emitSSEOnly`（messages token）分配 `seq` 后两路：SSE → `eventBus.publish`（fire-and-forget + catch，不落盘，spec 3.2）。所有事件统一经 `seq` 单调编号（含 messages），供 P2-3b joinStream 按 seq 去重。

**Tech Stack:** NestJS（DI + Jest + ts-jest）、TypeScript。复用 P2-1/P2-2 的 `EventBus`/`runChannel`/`RunStreamEvent`。无新依赖、无 Redis 实例化（EventBus 由 AiModule 绑定，本阶段只 publish）。

**Spec:** `docs/superpowers/specs/2026-06-15-llm-conversation-protocol-design.md` 第 3.2 节（事件分类：状态边界写 PG+广播，messages 只广播不落盘）、3.3 节（三条写入路径 [1] SSE / [2] Redis 广播 / [3] PG；本阶段加 [2]，PG 批量异步解耦留 P3）、3.4 节（message shape `{seq, eventType, payload}`）。**范围拆分**：P2-3 完整范围（发布端 + joinStream 消费端）较大，拆为 P2-3a（本 plan，发布端）+ P2-3b（下一 plan，joinStream 端点回放+续实时+去重+终态）。本 plan 完成时 EventBus 有发布者但无消费方 —— 这是 P2-3a 的设计边界，joinStream 在 P2-3b。

---

## 关键设计约束（实现时不可违背）

1. **EventBus 经 RunContext 注入，不直接 new**：`RunContextFactory` 构造注入 `EventBus`（NestJS DI），`create()` 时传入 `RunContext`，`RunRecord` 经 `runContext.eventBus` 访问。与 `eventStore`/`checkpointer` 同构（singleton infra 经 RunContext 传递）。
2. **所有事件统一 seq 编号（含 messages）**：`emitEvent` 和 `emitSSEOnly` 共享 `this.seq` 计数器，各自 `this.seq++` 分配。seq 跨事件类型单调递增（messages 也占 seq），供 P2-3b 按 seq 去重。PG 落盘的状态边界事件 seq 不连续（中间 messages seq 不落盘），回放时跳号正常。
3. **状态边界事件三路（SSE + PG + EventBus），messages 两路（SSE + EventBus，不落盘）**：`emitEvent` 落盘 + publish；`emitSSEOnly` 只 publish（spec 3.2）。这是当前两路（SSE+PG / SSE-only）的扩展，不是重写。
4. **publish 失败绝不阻塞 SSE 流**：`emitEvent` 的 publish 用 `await + try/catch warn`（与 eventStore.append 同样的容错策略）；`emitSSEOnly` 的 publish fire-and-forget `void promise.catch(warn)`（高频 token，不 await，但 rejection 必须捕获防 unhandled rejection）。SSE 实时性优先于广播可靠性。
5. **publish 载荷固定 RunStreamEvent 形状**：`{ seq, eventType, payload }`（spec 3.4）。`eventType` = 事件名（metadata/messages/values/tasks/end/error），`payload` = SSE data 原样。channel = `runChannel(this.id)` = `run:{runId}`。
6. **本阶段边界**：只加 publish 路径。**不**实现 joinStream（P2-3b）、**不**改 PG 写入方式为批量异步（spec 3.3 [3]，P3）、**不**做 seq 去重/终态检测（joinStream 层，P2-3b）、**不**引入新 EventBus 消费方。`emitEvent`/`emitSSEOnly` 的对外签名不变（只新增 publish 副作用）。

## File Structure

**修改：**
- `apps/server/src/ai/run/run-context.ts` — `RunContext` + `RunContextOpts` 加 `eventBus: EventBus` 字段
- `apps/server/src/ai/run/run-context-factory.ts` — 构造注入 `EventBus`，`create()` 传给 RunContext
- `apps/server/src/ai/run/run-record.ts` — `emitEvent` 加 publish（seq 提前分配）；`emitSSEOnly` 加 seq + publish
- `apps/server/src/ai/run/__tests__/run-context-factory.spec.ts` — 加 `mockEventBus`，新增 eventBus 注入测试
- `apps/server/src/ai/run/__tests__/run-record.spec.ts` — `createMockRunContext` 加 eventBus mock；新增 publish 测试
- `apps/server/src/ai/__tests__/ai.service.spec.ts`（及任何构造 RunContext/调 emitEvent 的 spec）— 适配 eventBus mock（全量回归时发现并修）

**不改：**
- `apps/server/src/ai/ai.module.ts` — `EventBus` 已是可注入 provider（P2-1/P2-2），`RunContextFactory` 注入它无需改 module（NestJS 自动解析）

---

## Task 1: RunContext + RunContextFactory 注入 EventBus

**Files:**
- Modify: `apps/server/src/ai/run/run-context.ts`
- Modify: `apps/server/src/ai/run/run-context-factory.ts`
- Modify: `apps/server/src/ai/run/__tests__/run-context-factory.spec.ts`

- [ ] **Step 1: RunContext 加 eventBus 字段**

`apps/server/src/ai/run/run-context.ts` —— 在 import 区加（`RunEventStore` import 附近）：

```ts
import type { EventBus } from '../event/event-bus';
```

在 `RunContextOpts` interface 加字段（`eventStore` 之后、`llmConfig` 之前）：

```ts
    /** Run 事件流存储器 */
    eventStore: RunEventStore;
    /** 跨副本事件总线（owner publish，非 owner 订阅续实时，spec 3.2/3.4） */
    eventBus: EventBus;
    /** LLM 配置快照（run 创建时冻结） */
    llmConfig: LLMConfig;
```

在 `RunContext` class 加 readonly 字段（`eventStore` 之后、`llmConfig` 之前）：

```ts
    /** Run 事件流存储器 */
    readonly eventStore: RunEventStore;
    /** 跨副本事件总线（spec 3.2/3.4） */
    readonly eventBus: EventBus;
    /** LLM 配置快照（run 创建时冻结，后续不可修改） */
    readonly llmConfig: Readonly<LLMConfig>;
```

在 constructor 赋值（`this.eventStore = opts.eventStore;` 之后）：

```ts
        this.eventStore = opts.eventStore;
        this.eventBus = opts.eventBus;
        this.llmConfig = snapshotValue(opts.llmConfig);
```

- [ ] **Step 2: RunContextFactory 注入 EventBus**

`apps/server/src/ai/run/run-context-factory.ts` —— import 区加：

```ts
import { EventBus } from '../event/event-bus';
```

constructor 加参数（`eventStore` 之后）：

```ts
    constructor(
        private readonly checkpointerProvider: CheckpointerProvider,
        private readonly eventStore: RunEventStore,
        private readonly eventBus: EventBus,
    ) {}
```

`create()` 传给 RunContext（`new RunContext({...})` 加 `eventBus`）：

```ts
        return new RunContext({
            checkpointer,
            eventStore: this.eventStore,
            eventBus: this.eventBus,
            llmConfig: opts.llmConfig,
        } satisfies RunContextOpts);
```

- [ ] **Step 3: 适配 run-context-factory.spec（加 mockEventBus + 注入测试）**

`apps/server/src/ai/run/__tests__/run-context-factory.spec.ts` —— import 区加：

```ts
import type { EventBus } from '../../event/event-bus';
```

在 `describe('RunContextFactory')` 的 `let` 声明加 `mockEventBus`，`beforeEach` 构造它并传入 factory：

```ts
    let factory: RunContextFactory;
    let mockCheckpointer: BaseCheckpointSaver;
    let mockCheckpointerProvider: CheckpointerProvider;
    let mockEventStore: RunEventStore;
    let mockEventBus: EventBus;

    beforeEach(() => {
        mockCheckpointer = { type: 'memory-saver' } as unknown as BaseCheckpointSaver;
        mockEventStore = { append: jest.fn() } as unknown as RunEventStore;
        mockEventBus = { publish: jest.fn().mockResolvedValue(undefined) } as unknown as EventBus;

        mockCheckpointerProvider = {
            getCheckpointer: jest.fn().mockResolvedValue(mockCheckpointer),
        } as unknown as CheckpointerProvider;

        factory = new RunContextFactory(mockCheckpointerProvider, mockEventStore, mockEventBus);
    });
```

在 `describe('create')` 末尾（最后一个 `it` 之后）加 eventBus 注入测试：

```ts
        it('should return a RunContext with the singleton eventBus', async () => {
            const ctx = await factory.create({ llmConfig: { provider: 'zhipu', model: 'glm-5' } });
            expect(ctx.eventBus).toBe(mockEventBus);
        });

        it('should share eventBus reference across contexts', async () => {
            const ctx1 = await factory.create({ llmConfig: { provider: 'zhipu', model: 'glm-5' } });
            const ctx2 = await factory.create({
                llmConfig: { provider: 'openai', model: 'gpt-4' },
            });
            expect(ctx1.eventBus).toBe(ctx2.eventBus);
        });
```

- [ ] **Step 4: 运行测试，确认通过**

Run:
```bash
cd apps/server && pnpm exec jest src/ai/run/__tests__/run-context-factory.spec.ts
```
Expected: PASS —— 原有 8 个测试 + 新增 2 个 = 10 个全绿。

- [ ] **Step 5: 提交**

```bash
git add apps/server/src/ai/run/run-context.ts apps/server/src/ai/run/run-context-factory.ts apps/server/src/ai/run/__tests__/run-context-factory.spec.ts
git commit -m "feat(ai): inject EventBus into RunContext via RunContextFactory (P2-3a)"
```

---

## Task 2: emitEvent / emitSSEOnly 接入 EventBus publish（TDD）

**Files:**
- Modify: `apps/server/src/ai/run/run-record.ts`
- Modify: `apps/server/src/ai/run/__tests__/run-record.spec.ts`

- [ ] **Step 1: 先适配 run-record.spec 的 createMockRunContext 加 eventBus mock**

`apps/server/src/ai/run/__tests__/run-record.spec.ts` —— import 区加：

```ts
import type { EventBus } from '../../event/event-bus';
```

改 `createMockRunContext`，参数加 `eventBus?`，返回对象加 `eventBus`：

```ts
function createMockRunContext(overrides?: {
    eventStore?: { append: jest.Mock };
    checkpointer?: { type: string };
    eventBus?: { publish: jest.Mock };
}): RunContext {
    const mockES = overrides?.eventStore ?? { append: jest.fn().mockResolvedValue({}) };
    const mockCP = overrides?.checkpointer ?? { type: 'memory' };
    const mockEB = overrides?.eventBus ?? { publish: jest.fn().mockResolvedValue(undefined) };

    return {
        checkpointer: mockCP as unknown as BaseCheckpointSaver,
        eventStore: mockES as unknown as RunEventStore,
        eventBus: mockEB as unknown as EventBus,
        llmConfig: { provider: 'zhipu', model: 'glm-5' },
    } as RunContext;
}
```

- [ ] **Step 2: 在 run-record.spec 新增 publish 测试（先写，验证当前 FAIL —— publish 未接入）**

在 `describe('emitEvent')` 块末尾（`should write to both sseWriter and eventStore` 测试之后）加：

```ts
        it('should publish state-boundary events to eventBus with seq + eventType + payload', async () => {
            const eventBus = { publish: jest.fn().mockResolvedValue(undefined) };
            const rec = new RunRecord({
                id: 'r1',
                threadId: 't1',
                runContext: createMockRunContext({ eventBus }),
                snapshot: { content: '' },
                lastSeq: 10,
            });

            await rec.emitEvent({ event: 'values', data: { messages: [] } });

            expect(eventBus.publish).toHaveBeenCalledWith('run:r1', {
                seq: 10,
                eventType: 'values',
                payload: { messages: [] },
            });
        });

        it('should not block SSE/PG when eventBus.publish rejects', async () => {
            const eventStore = { append: jest.fn().mockResolvedValue({}) };
            const eventBus = { publish: jest.fn().mockRejectedValue(new Error('bus down')) };
            const captured: Array<{ event: string; data: unknown }> = [];
            const rec = new RunRecord({
                id: 'r1',
                threadId: 't1',
                runContext: createMockRunContext({ eventStore, eventBus }),
                snapshot: { content: '' },
            });
            rec.setSseWriter(e => captured.push(e));

            await expect(rec.emitEvent({ event: 'end', data: {} })).resolves.toBeUndefined();
            // SSE 仍写
            expect(captured).toHaveLength(1);
            // PG 仍写
            expect(eventStore.append).toHaveBeenCalled();
        });
```

在文件末尾 `describe('lastSeq anchoring')` 之后新增 `describe('emitSSEOnly')` 块：

```ts
    describe('emitSSEOnly', () => {
        it('should publish messages events with seq (no PG persist)', async () => {
            const eventStore = { append: jest.fn().mockResolvedValue({}) };
            const eventBus = { publish: jest.fn().mockResolvedValue(undefined) };
            const rec = new RunRecord({
                id: 'r1',
                threadId: 't1',
                runContext: createMockRunContext({ eventStore, eventBus }),
                snapshot: { content: '' },
                lastSeq: 5,
            });

            rec.emitSSEOnly({ event: 'messages', data: { chunk: 'hi' } });

            expect(eventBus.publish).toHaveBeenCalledWith('run:r1', {
                seq: 5,
                eventType: 'messages',
                payload: { chunk: 'hi' },
            });
            // messages 不落盘
            expect(eventStore.append).not.toHaveBeenCalled();
            // seq 已分配（currentSeq 推进）
            expect(rec.currentSeq).toBe(6);
        });

        it('should write to sseWriter when set', () => {
            const captured: Array<{ event: string; data: unknown }> = [];
            const rec = new RunRecord({
                id: 'r1',
                threadId: 't1',
                runContext: createMockRunContext(),
                snapshot: { content: '' },
            });
            rec.setSseWriter(e => captured.push(e));

            rec.emitSSEOnly({ event: 'messages', data: { chunk: 'x' } });

            expect(captured).toHaveLength(1);
            expect(captured[0].event).toBe('messages');
        });
    });
```

- [ ] **Step 3: 运行测试，确认新增的 publish 测试 FAIL（publish 未接入）**

Run:
```bash
cd apps/server && pnpm exec jest src/ai/run/__tests__/run-record.spec.ts 2>&1 | tail -20
```
Expected: 新增的 publish 测试 FAIL（`eventBus.publish` 未被调用 / `emitSSEOnly` 不分配 seq）。原有 emitEvent/seq 测试仍 PASS（createMockRunContext 已加默认 eventBus mock，现有断言不受影响）。

- [ ] **Step 4: 实现 emitEvent / emitSSEOnly 接入 publish**

`apps/server/src/ai/run/run-record.ts` —— import 区加（`RunContext` import 附近）：

```ts
import { runChannel, type RunStreamEvent } from '../event/event-bus';
```

（RunRecord 经 `runContext.eventBus` 访问 EventBus，不直接引用 `EventBus` 类型，故只 import `runChannel`（构造 channel）与 `RunStreamEvent`（publish 载荷类型）。）

替换 `emitEvent` 方法为（seq 提前分配，三路 SSE+PG+EventBus）：

```ts
    /**
     * 发射状态边界事件：SSE 即时推 + EventStore 落盘 + EventBus 广播（spec 3.2/3.3）。
     * seq 在入口分配，供三路共用（PG append 与 EventBus publish 同一 seq）。
     * publish 失败不阻塞 SSE/PG（降级 warn，spec 3.3 [2]）。
     */
    async emitEvent(event: { event: string; data: unknown }) {
        const seq = this.seq++;
        const streamEvent: RunStreamEvent = {
            seq,
            eventType: event.event,
            payload: event.data,
        };

        // [1] SSE 即时推
        if (this.sseWriter) {
            this.sseWriter(event);
        }

        // [3] PG 落盘（状态边界）
        try {
            await this.runContext.eventStore.append(this.id, this.threadId, {
                seq,
                eventType: event.event,
                // biome-ignore lint/suspicious/noExplicitAny: LangGraph stream event data is untyped
                eventName: (event.data as any)?.event ?? '',
                payload: event.data as Record<string, unknown>,
            });
        } catch (err) {
            this.logger.warn(`EventStore append failed: ${(err as Error).message}`);
        }

        // [2] EventBus 广播（非 owner 副本续实时，spec 3.3）
        try {
            await this.runContext.eventBus.publish(runChannel(this.id), streamEvent);
        } catch (err) {
            this.logger.warn(`EventBus publish failed: ${(err as Error).message}`);
        }
    }
```

替换 `emitSSEOnly` 方法为（seq 分配 + SSE + EventBus fire-and-forget，不落盘）：

```ts
    /**
     * 发射临时事件（messages token）：SSE 即时推 + EventBus 广播，不落盘（spec 3.2）。
     * 仍分配 seq（供续实时去重）。publish fire-and-forget（高频，不 await），
     * 但 rejection 必须 catch 防 unhandled rejection。
     */
    emitSSEOnly(event: { event: string; data: unknown }) {
        const seq = this.seq++;
        const streamEvent: RunStreamEvent = {
            seq,
            eventType: event.event,
            payload: event.data,
        };

        // [1] SSE 即时推
        if (this.sseWriter) {
            this.sseWriter(event);
        }

        // [2] EventBus 广播（不落盘 [3]）
        void this.runContext.eventBus
            .publish(runChannel(this.id), streamEvent)
            .catch(err => {
                this.logger.warn(`EventBus publish failed: ${(err as Error).message}`);
            });
    }
```

- [ ] **Step 5: 运行测试，确认全部通过**

Run:
```bash
cd apps/server && pnpm exec jest src/ai/run/__tests__/run-record.spec.ts
```
Expected: PASS —— 原有测试 + 新增 publish/emitSSEOnly 测试全绿。

- [ ] **Step 6: 提交**

```bash
git add apps/server/src/ai/run/run-record.ts apps/server/src/ai/run/__tests__/run-record.spec.ts
git commit -m "feat(ai): publish run events to EventBus in emitEvent/emitSSEOnly (P2-3a)"
```

---

## Task 3: 全量回归 + 适配受影响测试 + 构建

**Files:**
- Modify: `apps/server/src/ai/__tests__/ai.service.spec.ts` — `mockRunContextFactoryInstance.create` 返回的 mock RunContext 加 eventBus mock
- Modify: `apps/server/src/ai/run/__tests__/run-manager.spec.ts` — `createMockRunContext` 加 eventBus mock

- [ ] **Step 1: 全量跑 AI 测试，发现受影响 spec**

Run:
```bash
cd apps/server && pnpm exec jest src/ai --runInBand 2>&1 | tail -40
```
Expected: 可能有 spec 因 `runContext.eventBus` 为 undefined（emitEvent 访问 undefined.publish）或构造 RunContext 缺 eventBus 参数而 FAIL。**记录所有失败**。

- [ ] **Step 2: 适配 ai.service.spec 与 run-manager.spec（补 eventBus mock）**

**(a) `apps/server/src/ai/__tests__/ai.service.spec.ts`** —— import 区加（`RunContext` import 附近）：

```ts
import type { EventBus } from '../event/event-bus';
```

在 `mockRunContextFactoryInstance.create` 返回的 mock RunContext 对象（约 line 99-106，`eventStore` 之后、`llmConfig` 之前）加 `eventBus`：

```ts
                    eventStore: {
                        append: jest.fn().mockResolvedValue({}),
                        flushRun: jest.fn().mockResolvedValue(undefined),
                    } as unknown as RunEventStore,
                    eventBus: {
                        publish: jest.fn().mockResolvedValue(undefined),
                    } as unknown as EventBus,
                    llmConfig: { ...opts.llmConfig },
```

**(b) `apps/server/src/ai/run/__tests__/run-manager.spec.ts`** —— import 区加：

```ts
import type { EventBus } from '../../event/event-bus';
```

改 `createMockRunContext`（line 9-20）加 `eventBus` override + 返回对象：

```ts
function createMockRunContext(overrides?: {
    eventStore?: { append: jest.Mock };
    checkpointer?: { type: string };
    eventBus?: { publish: jest.Mock };
}): RunContext {
    const mockES = overrides?.eventStore ?? { append: jest.fn().mockResolvedValue({}) };
    const mockCP = overrides?.checkpointer ?? { type: 'memory' };
    const mockEB = overrides?.eventBus ?? { publish: jest.fn().mockResolvedValue(undefined) };
    return {
        checkpointer: mockCP as unknown as BaseCheckpointSaver,
        eventStore: mockES as unknown as RunEventStore,
        eventBus: mockEB as unknown as EventBus,
        llmConfig: { provider: 'zhipu', model: 'glm-5' },
    } as RunContext;
}
```

**不改产品代码逻辑，只补 eventBus mock。不为过测试削弱现有断言。** 若 Step 1 还发现其他 spec 失败，按同样模式（mock RunContext 加 `eventBus: { publish: jest.fn().mockResolvedValue(undefined) }`）补。

- [ ] **Step 3: 确认全量测试通过**

Run:
```bash
cd apps/server && pnpm exec jest src/ai src/config --runInBand 2>&1 | tail -6
```
Expected: PASS —— P2-2 基线 17 suites / 215 passed / 1 skipped；Task 1+2 加了 run-context-factory.spec 2 测 + run-record.spec 4 测 = 约 17 suites / 221 passed / 1 skipped（具体数取决于 ai.service.spec 是否新增/调整测试）。

- [ ] **Step 4: 构建**

Run:
```bash
cd apps/server && pnpm run build
```
Expected: `pnpm run build` 通过（tsc 无错；忽略预存的 `tool-node.span.spec.ts` 无关错误）。

- [ ] **Step 5: 提交**

```bash
git add apps/server/src/ai/__tests__/ai.service.spec.ts apps/server/src/ai/run/__tests__/run-manager.spec.ts
git commit -m "test(ai): adapt specs for EventBus publish wiring (P2-3a)"
```

---

## 验收标准（本阶段）

- [ ] `RunContext` + `RunContextOpts` 含 `eventBus: EventBus` 字段；`RunContextFactory` 注入 EventBus 并传入 RunContext
- [ ] `RunRecord.emitEvent` 三路（SSE + PG + EventBus publish），seq 入口分配；publish 失败 warn 不阻塞 SSE/PG
- [ ] `RunRecord.emitSSEOnly` 两路（SSE + EventBus publish），分配 seq，不落盘；publish fire-and-forget + catch
- [ ] publish 载荷为 `RunStreamEvent { seq, eventType, payload }`，channel = `runChannel(runId)`
- [ ] run-record.spec / run-context-factory.spec 新增 publish 注入/发布测试；ai.service.spec 等受影响 spec 已适配
- [ ] 全量 `jest src/ai src/config` + `build` 通过

## 本阶段不做（留给后续）

- **P2-3b：joinStream 端点** —— `GET /api/threads/:tid/runs/:rid/stream?since=N`：状态判断 + PG 回放(seq>N) + EventBus 订阅续实时 + seq 去重 + 终态关闭。这是 EventBus 的首个消费方，本阶段 publish 的事件由它消费。
- PG 写入批量异步解耦（spec 3.3 [3]，P3）
- SSE 心跳（spec 3.9）
- user 隔离（spec 6.2，P5）
- emitEvent/emitSSEOnly 三路解耦的**性能优化**（如 publish 并行化）—— P2-3a 保持同步 await，性能留 P3

## 如何验证 publish 真的生效（P2-3a 完成后，无需真实 Redis）

P2-3a 完成后，EventBus 有发布者但无消费方（joinStream 在 P2-3b）。验证 publish 正确性的方式是**单元测试**（run-record.spec 的 publish 断言）。端到端"非 owner 收到事件"需 P2-3b 的 joinStream + 真实 Redis（AI_EVENT_BUS=redis 多副本），不在本阶段范围。
