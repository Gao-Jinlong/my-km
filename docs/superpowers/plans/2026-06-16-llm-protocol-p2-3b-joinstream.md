# LLM 对话协议重构 P2-3b：joinStream 端点实现 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 `GET /api/threads/:tid/runs/:rid/stream?since=N` 端点（当前 `threads.controller.ts:275` 返回 501 桩），让客户端断线重连时能回放 PG 持久化事件 + 续收 EventBus 实时事件，按 seq 去重衔接，终态（end/error）关闭 SSE。这是 EventBus 的**首个消费方**（P2-3a 已铺好 owner 端 publish 链路）。

**Architecture:** 新建 `JoinStreamService.joinStream(runId, since, sink)` 承载编排逻辑（读 Run 行判状态 → terminal 纯回放 / running+interrupted 先 subscribe EventBus 再回放 PG → seq 去重 → 终态 close），返回 cleanup 函数。`RunEventSink`（spec 3.8，`push`/`close`）抽象让 service 与 SSE 解耦，service 单测用收集器 sink + InProcess EventBus。ThreadsController.joinStream 构造 SSE sink（push=writeSSE，close=res.end），调用 service，`res.on('close')` 调 cleanup 防非终态（interrupted）连接泄漏。

**关键简化**：owner publish 的 seq 单调递增（P2-3a 共享 `this.seq`），回放 PG 与续收 EventBus 的重叠区**无需 buffer** —— 维护 `lastSeq`，`event.seq <= lastSeq` 丢弃即可；同 seq 事件在 PG 和 EventBus 都存在（P2-3a 既 append 又 publish），先到的赢、后到的丢，不丢不重。

**Tech Stack:** NestJS（DI + Jest + ts-jest）、Express（`res` SSE）、复用 P2-1/P2-2/P2-3a 的 EventBus/`runChannel`/`RunStreamEvent`/`RunStateRepository.findById`/`RunEventStore.replay`。无新依赖。

**Spec:** `docs/superpowers/specs/2026-06-15-llm-conversation-protocol-design.md` 第 3.5 节（joinStream 五步：读 Run 判状态 → 先 SUBSCRIBE → PG 回放 seq>N → seq 去重衔接实时 → 终态关 SSE）、3.4 节（channel `run:{runId}`）、3.8 节（RunEventSink）、4.2 节（interrupted 不发 end，stream 在 tasks 后由 owner 关闭）。P2-3a（owner publish）已合并 main（`26543d9`）。

---

## 关键设计约束（实现时不可违背）

1. **joinStream orchestration 在 JoinStreamService，不在 controller**：controller 只构造 SSE sink + 调 service + `res.on('close')` cleanup。逻辑可测性靠 `RunEventSink` 抽象（service 写 sink，测试用收集器 sink）。
2. **先 subscribe 再回放（防漏）**（spec 3.5 Step 2-3）：running/interrupted 先 `eventBus.subscribe(runChannel(runId))` 注册回调（实时事件立即经回调处理），再 `await eventStore.replay` 回放 PG。两者间到达的实时事件不会被漏（回调已注册）。terminal（completed/failed/cancelled）无需 subscribe，纯回放。
3. **seq 单调去重，无需 buffer**：维护 `lastSeq`（初始 = since）。回放与实时回调统一规则：`event.seq <= lastSeq` 丢弃，否则 push + `lastSeq = event.seq`。因 owner seq 单调 + 同 seq 在 PG/EventBus 双写，先到的赢、后到的丢，不丢不重。**不要引入 buffer 数组**（YAGNI，会徒增复杂度）。
4. **终态关闭**（spec 3.5 Step 5）：遇到 `eventType === 'end' || 'error'` → push + close。terminal run 回放完若无终态事件（异常情况）也 close（防御）。interrupted run 无 end（spec 4.2），不自动 close —— 连接持续续实时直到 client 断（controller `res.on('close')` cleanup）。
5. **cleanup 返回契约**：`joinStream` 返回 `() => void`。terminal 返回 no-op（已 close）；running/interrupted 返回的 cleanup 调用后 unsubscribe + sink.close（幂等，重复调安全）。controller 必须在 `res.on('close')` 调 cleanup，否则 interrupted 连接的 subscription 泄漏。
6. **404 语义**：Run 行不存在 → 抛 `NotFoundException`（controller 的 NestJS 异常过滤器返回 404）。**不**在 sink 里写 error 事件（404 是 HTTP 层，早于 SSE 流）。
7. **本阶段边界**：只做 joinStream。**不**做 user 隔离（spec 6.2，P5）、**不**做 SSE 心跳（spec 3.9）、**不**做 since 上限校验（spec 6.2 安全，P5）、**不**改 owner 端 publish（P2-3a 已完成）、**不**碰 streamRun。

## File Structure

**新建：**
- `apps/server/src/ai/run/run-event-sink.ts` — `RunEventSink` 接口（spec 3.8）
- `apps/server/src/ai/run/join-stream.service.ts` — `JoinStreamService`（`joinStream` 编排 + `toRunStreamEvent` 转换）
- `apps/server/src/ai/run/__tests__/join-stream.service.spec.ts` — TDD 测试（收集器 sink + InProcess EventBus + mock repos）

**修改：**
- `apps/server/src/ai/langgraph/threads.controller.ts` — `joinStream` 端点从 501 桩改为调 JoinStreamService（SSE sink 适配 + res.on('close') cleanup）
- `apps/server/src/ai/ai.module.ts` — 注册 JoinStreamService

---

## Task 1: RunEventSink 接口 + JoinStreamService（terminal 纯回放）

**Files:**
- Create: `apps/server/src/ai/run/run-event-sink.ts`
- Create: `apps/server/src/ai/run/join-stream.service.ts`
- Create: `apps/server/src/ai/run/__tests__/join-stream.service.spec.ts`

- [ ] **Step 1: 创建 RunEventSink 接口**

`apps/server/src/ai/run/run-event-sink.ts`：

```ts
import type { RunStreamEvent } from '../event/event-bus';

/**
 * RunEventSink — joinStream 的事件出口抽象（spec 3.8）。
 *
 * JoinStreamService 把回放/续实时的事件 push 到 sink，controller 负责把 sink
 * 适配到 SSE Response（push → writeSSE，close → res.end）。service 因此与
 * HTTP/SSE 解耦，可用收集器 sink 单测。
 */
export interface RunEventSink {
    /** 推送一个事件（已按 seq 去重，调用方直接渲染） */
    push(event: RunStreamEvent): void;
    /** 关闭流（终态到达或客户端断开） */
    close(): void;
}
```

- [ ] **Step 2: 写失败测试（terminal 场景）**

`apps/server/src/ai/run/__tests__/join-stream.service.spec.ts`：

```ts
import { InProcessEventBus } from '../../event/in-process.event-bus';
import { runChannel, type RunStreamEvent } from '../../event/event-bus';
import type { RunEventStore } from '../../store/run-event-store';
import type { RunStateRepository } from '../run-state.repository';
import type { RunRow } from '../lease.types';
import { JoinStreamService } from '../join-stream.service';
import type { RunEventSink } from '../run-event-sink';

/** 收集器 sink：收集 push 的事件 + 记录 close（闭包持有状态，无 this 绑定问题） */
function collectorSink(): RunEventSink & {
    events: RunStreamEvent[];
    closed: boolean;
} {
    const events: RunStreamEvent[] = [];
    let closed = false;
    return {
        events,
        get closed() {
            return closed;
        },
        push(e: RunStreamEvent) {
            events.push(e);
        },
        close() {
            closed = true;
        },
    };
}

/** 构造 mock RunStateRepository，findById 返回指定 RunRow（或 null） */
function mockRunStateRepo(run: RunRow | null) {
    return { findById: jest.fn().mockResolvedValue(run) } as unknown as RunStateRepository;
}

/** 构造 mock RunEventStore，replay 返回指定事件列表（prisma RunEvent 形状） */
function mockEventStore(events: Array<{ seq: number; eventType: string; payload: unknown }>) {
    return {
        replay: jest.fn().mockResolvedValue(
            events.map(e => ({ runId: 'r1', threadId: 't1', ...e, eventName: '', createdAt: new Date() })),
        ),
    } as unknown as RunEventStore;
}

describe('JoinStreamService — terminal replay', () => {
    let eventBus: InProcessEventBus;

    beforeEach(() => {
        eventBus = new InProcessEventBus();
    });

    it('throws NotFoundException when the run does not exist', async () => {
        const service = new JoinStreamService(eventBus, mockRunStateRepo(null), mockEventStore([]));
        const sink = collectorSink();
        await expect(service.joinStream('nope', 0, sink)).rejects.toThrow(/not found/i);
        expect(sink.closed).toBe(false);
    });

    it('replays persisted events (seq > since) for a completed run and closes', async () => {
        const run = { id: 'r1', status: 'completed' } as RunRow;
        const events = [
            { seq: 1, eventType: 'values', payload: { n: 1 } },
            { seq: 2, eventType: 'end', payload: {} },
        ];
        const service = new JoinStreamService(eventBus, mockRunStateRepo(run), mockEventStore(events));
        const sink = collectorSink();

        const cleanup = await service.joinStream('r1', 0, sink);

        expect(sink.events).toEqual([
            { seq: 1, eventType: 'values', payload: { n: 1 } },
            { seq: 2, eventType: 'end', payload: {} },
        ]);
        expect(sink.closed).toBe(true);
        expect(typeof cleanup).toBe('function');
    });

    it('filters out events with seq <= since', async () => {
        const run = { id: 'r1', status: 'completed' } as RunRow;
        const events = [
            { seq: 1, eventType: 'values', payload: { old: true } },
            { seq: 5, eventType: 'values', payload: { n: 5 } },
            { seq: 6, eventType: 'end', payload: {} },
        ];
        const service = new JoinStreamService(eventBus, mockRunStateRepo(run), mockEventStore(events));
        const sink = collectorSink();

        await service.joinStream('r1', 4, sink);

        // seq 1 <= 4 过滤；seq 5,6 保留
        expect(sink.events).toEqual([
            { seq: 5, eventType: 'values', payload: { n: 5 } },
            { seq: 6, eventType: 'end', payload: {} },
        ]);
        expect(sink.closed).toBe(true);
    });

    it('returns a no-op cleanup for terminal runs (already closed)', async () => {
        const run = { id: 'r1', status: 'failed' } as RunRow;
        const events = [{ seq: 1, eventType: 'error', payload: { error: 'x' } }];
        const service = new JoinStreamService(eventBus, mockRunStateRepo(run), mockEventStore(events));
        const sink = collectorSink();

        const cleanup = await service.joinStream('r1', 0, sink);
        expect(sink.closed).toBe(true);
        // cleanup 幂等安全（已 close，再调不抛）
        expect(() => cleanup()).not.toThrow();
    });
});
```

- [ ] **Step 3: 运行测试，确认 FAIL**

Run:
```bash
cd apps/server && pnpm exec jest src/ai/run/__tests__/join-stream.service.spec.ts 2>&1 | tail -12
```
Expected: FAIL — `Cannot find module '../join-stream.service'`（import 解析失败）。

- [ ] **Step 4: 实现 JoinStreamService（terminal 分支）**

`apps/server/src/ai/run/join-stream.service.ts`：

```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { EventBus, runChannel, type RunStreamEvent } from '../event/event-bus';
import type { RunEventStore } from '../store/run-event-store';
import type { RunEventSink } from './run-event-sink';
import type { RunStateRepository } from './run-state.repository';

/** 终态：纯回放，不续实时 */
const TERMINAL_STATUSES = ['completed', 'failed', 'cancelled'];

/** RunEvent（prisma）→ RunStreamEvent（EventBus/SSE 载荷） */
function toRunStreamEvent(e: {
    seq: number;
    eventType: string;
    payload: unknown;
}): RunStreamEvent {
    return { seq: e.seq, eventType: e.eventType, payload: e.payload };
}

/**
 * JoinStreamService — joinStream 编排（spec 3.5）。
 *
 * 读 Run 行判状态：terminal（completed/failed/cancelled）纯回放 PG；
 * running/interrupted 先 subscribe EventBus（续实时）再回放 PG，按 seq 去重衔接。
 * 终态（end/error）或客户端断开时关闭 sink。
 *
 * 返回 cleanup 函数：调用后 unsubscribe + close（幂等）。controller 必须在
 * res.on('close') 调用，否则 interrupted（无 end）连接的 subscription 泄漏。
 *
 * Task 1 只实现 terminal 分支；running/interrupted 在后续 task 实现。
 */
@Injectable()
export class JoinStreamService {
    constructor(
        private readonly eventBus: EventBus,
        private readonly runStateRepo: RunStateRepository,
        private readonly eventStore: RunEventStore,
    ) {}

    async joinStream(runId: string, since: number, sink: RunEventSink): Promise<() => void> {
        const run = await this.runStateRepo.findById(runId);
        if (!run) {
            throw new NotFoundException(`Run not found: ${runId}`);
        }

        const isTerminal = TERMINAL_STATUSES.includes(run.status);
        if (!isTerminal) {
            // running/interrupted —— Task 2 实现
            throw new Error(`joinStream for non-terminal status (${run.status}) not yet implemented`);
        }

        // terminal：纯回放 seq > since，遇终态 close
        let closed = false;
        const close = () => {
            if (!closed) {
                closed = true;
                sink.close();
            }
        };

        const events = (await this.eventStore.replay(runId)).filter(e => e.seq > since);
        for (const e of events) {
            sink.push(toRunStreamEvent(e));
            if (e.eventType === 'end' || e.eventType === 'error') {
                close();
                break;
            }
        }
        close(); // 防御：无终态事件也 close

        return () => close(); // terminal 已 close，cleanup 幂等 no-op
    }
}
```

- [ ] **Step 5: 运行测试，确认 PASS**

Run:
```bash
cd apps/server && pnpm exec jest src/ai/run/__tests__/join-stream.service.spec.ts
```
Expected: PASS — 4 个 terminal 场景测试全绿。

- [ ] **Step 6: 提交**

```bash
git add apps/server/src/ai/run/run-event-sink.ts apps/server/src/ai/run/join-stream.service.ts apps/server/src/ai/run/__tests__/join-stream.service.spec.ts
git commit -m "feat(ai): add JoinStreamService with terminal-run replay (P2-3b)"
```

---

## Task 2: 续实时（running/interrupted：subscribe + 回放 + 去重 + 终态 + cleanup）

**Files:**
- Modify: `apps/server/src/ai/run/join-stream.service.ts`
- Modify: `apps/server/src/ai/run/__tests__/join-stream.service.spec.ts`

- [ ] **Step 1: 在 spec 新增 running/interrupted 测试（先写，验证当前 FAIL —— 抛 not implemented）**

在 `apps/server/src/ai/run/__tests__/join-stream.service.spec.ts` 末尾（terminal describe 之后）加：

```ts
describe('JoinStreamService — live resume (running/interrupted)', () => {
    let eventBus: InProcessEventBus;

    beforeEach(() => {
        eventBus = new InProcessEventBus();
    });

    it('subscribes EventBus and delivers live events after replay (running run)', async () => {
        const run = { id: 'r1', status: 'running' } as RunRow;
        // PG 空（run 刚开始，无持久化）
        const service = new JoinStreamService(eventBus, mockRunStateRepo(run), mockEventStore([]));
        const sink = collectorSink();

        const cleanup = await service.joinStream('r1', 0, sink);
        // 模拟 owner 端 publish 实时事件
        await eventBus.publish(runChannel('r1'), { seq: 1, eventType: 'values', payload: { n: 1 } });
        await eventBus.publish(runChannel('r1'), { seq: 2, eventType: 'messages', payload: { chunk: 'hi' } });
        await eventBus.publish(runChannel('r1'), { seq: 3, eventType: 'end', payload: {} });

        expect(sink.events).toEqual([
            { seq: 1, eventType: 'values', payload: { n: 1 } },
            { seq: 2, eventType: 'messages', payload: { chunk: 'hi' } },
            { seq: 3, eventType: 'end', payload: {} },
        ]);
        expect(sink.closed).toBe(true); // end → close
        cleanup();
    });

    it('dedups overlapping replay + live events by seq', async () => {
        const run = { id: 'r1', status: 'running' } as RunRow;
        // PG 已持久化 seq 1（values）；since=0
        const events = [{ seq: 1, eventType: 'values', payload: { n: 1 } }];
        const service = new JoinStreamService(eventBus, mockRunStateRepo(run), mockEventStore(events));
        const sink = collectorSink();

        await service.joinStream('r1', 0, sink);
        // 模拟 owner 重新 publish seq 1（重叠，应去重）+ 新 seq 2
        await eventBus.publish(runChannel('r1'), { seq: 1, eventType: 'values', payload: { n: 1 } });
        await eventBus.publish(runChannel('r1'), { seq: 2, eventType: 'end', payload: {} });

        expect(sink.events).toEqual([
            { seq: 1, eventType: 'values', payload: { n: 1 } }, // 回放
            { seq: 2, eventType: 'end', payload: {} }, // 实时（seq 1 实时被去重）
        ]);
        expect(sink.closed).toBe(true);
    });

    it('replays persisted events then continues live for a running run', async () => {
        const run = { id: 'r1', status: 'running' } as RunRow;
        const events = [{ seq: 1, eventType: 'values', payload: { n: 1 } }];
        const service = new JoinStreamService(eventBus, mockRunStateRepo(run), mockEventStore(events));
        const sink = collectorSink();

        await service.joinStream('r1', 0, sink);
        await eventBus.publish(runChannel('r1'), { seq: 2, eventType: 'end', payload: {} });

        expect(sink.events).toEqual([
            { seq: 1, eventType: 'values', payload: { n: 1 } }, // 回放
            { seq: 2, eventType: 'end', payload: {} }, // 实时续
        ]);
        expect(sink.closed).toBe(true);
    });

    it('keeps the stream open for interrupted runs (no end event)', async () => {
        const run = { id: 'r1', status: 'interrupted' } as RunRow;
        const events = [{ seq: 1, eventType: 'tasks', payload: { interrupt: true } }];
        const service = new JoinStreamService(eventBus, mockRunStateRepo(run), mockEventStore(events));
        const sink = collectorSink();

        const cleanup = await service.joinStream('r1', 0, sink);
        // interrupted 无 end，stream 保持开
        expect(sink.closed).toBe(false);
        expect(sink.events).toEqual([{ seq: 1, eventType: 'tasks', payload: { interrupt: true } }]);

        // client 断开 → cleanup 关闭
        cleanup();
        expect(sink.closed).toBe(true);
    });

    it('cleanup stops live delivery (no further events after cleanup)', async () => {
        const run = { id: 'r1', status: 'running' } as RunRow;
        const service = new JoinStreamService(eventBus, mockRunStateRepo(run), mockEventStore([]));
        const sink = collectorSink();

        const cleanup = await service.joinStream('r1', 0, sink);
        await eventBus.publish(runChannel('r1'), { seq: 1, eventType: 'values', payload: { n: 1 } });
        expect(sink.events).toHaveLength(1);

        cleanup(); // client 断
        await eventBus.publish(runChannel('r1'), { seq: 2, eventType: 'end', payload: {} });
        // cleanup 后不再收到
        expect(sink.events).toHaveLength(1);
        expect(sink.closed).toBe(true);
    });
});
```

- [ ] **Step 2: 运行测试，确认新测试 FAIL（running/interrupted 抛 not implemented）**

Run:
```bash
cd apps/server && pnpm exec jest src/ai/run/__tests__/join-stream.service.spec.ts 2>&1 | tail -16
```
Expected: FAIL — 新的 running/interrupted 测试失败（`not yet implemented` 抛错）。原有 4 个 terminal 测试仍 PASS。

- [ ] **Step 3: 实现 running/interrupted 分支（替换 not-implemented throw）**

`apps/server/src/ai/run/join-stream.service.ts` —— import 区加 `EventBusSubscription`：

```ts
import { EventBus, runChannel, type EventBusSubscription, type RunStreamEvent } from '../event/event-bus';
```

替换整个 `joinStream` 方法为（terminal 纯回放 + running/interrupted 续实时）：

```ts
    async joinStream(runId: string, since: number, sink: RunStreamSink): Promise<() => void> {
        const run = await this.runStateRepo.findById(runId);
        if (!run) {
            throw new NotFoundException(`Run not found: ${runId}`);
        }

        const isTerminal = TERMINAL_STATUSES.includes(run.status);

        // seq 去重游标：回放与实时回调共用，event.seq <= lastSeq 丢弃（spec 3.5）
        let lastSeq = since;
        let closed = false;
        let subscription: EventBusSubscription | null = null;

        const close = () => {
            if (closed) return;
            closed = true;
            subscription?.unsubscribe();
            sink.close();
        };

        // running/interrupted：先 subscribe（防漏），回调按 seq 去重 + push + 终态 close
        if (!isTerminal) {
            subscription = this.eventBus.subscribe(runChannel(runId), event => {
                if (closed || event.seq <= lastSeq) return;
                lastSeq = event.seq;
                sink.push(event);
                if (event.eventType === 'end' || event.eventType === 'error') {
                    close();
                }
            });
        }

        // 回放 PG（先 subscribe 再回放，spec 3.5 Step 3）：seq > since 且 seq > lastSeq（实时可能已 push）
        const events = (await this.eventStore.replay(runId)).filter(e => e.seq > since);
        for (const e of events) {
            if (closed) break;
            if (e.seq <= lastSeq) continue; // 实时回调已 push
            lastSeq = e.seq;
            sink.push(toRunStreamEvent(e));
            if (e.eventType === 'end' || e.eventType === 'error') {
                close();
                break;
            }
        }

        // terminal：回放完必 close（无续实时）；running/interrupted：若回放含终态已 close，否则持续续实时
        if (isTerminal) {
            close();
        }

        return close; // cleanup（幂等）
    }
```

（方法签名 `sink: RunEventSink` —— Task 1 已从 `./run-event-sink` import，Task 2 复用同一 import；新增的 `EventBusSubscription` 是 P2-1 已导出的类型。）

- [ ] **Step 4: 运行测试，确认全部通过**

Run:
```bash
cd apps/server && pnpm exec jest src/ai/run/__tests__/join-stream.service.spec.ts
```
Expected: PASS — 4 terminal + 5 running/interrupted = 9 测试全绿。

- [ ] **Step 5: 提交**

```bash
git add apps/server/src/ai/run/join-stream.service.ts apps/server/src/ai/run/__tests__/join-stream.service.spec.ts
git commit -m "feat(ai): joinStream live resume with seq dedup (running/interrupted) (P2-3b)"
```

---

## Task 3: ThreadsController 接入 + AiModule 注册 + 回归

**Files:**
- Modify: `apps/server/src/ai/langgraph/threads.controller.ts`（构造注入 + joinStream 端点替换 501 桩，约 line 113-117 构造、275-281 joinStream）
- Modify: `apps/server/src/ai/ai.module.ts`（providers 加 JoinStreamService）
- Modify: `apps/server/src/ai/__tests__/ai.module.bootstrap.spec.ts`（验证 JoinStreamService DI wiring）

- [ ] **Step 1: ai.module.ts 注册 JoinStreamService**

在 `apps/server/src/ai/ai.module.ts` import 区加（`RunEventStore` import 附近）：

```ts
import { JoinStreamService } from './run/join-stream.service';
```

在 providers 数组（Run 层区块，`RunContextFactory` 附近）加：

```ts
        RunManager,
        RunContextFactory,
        JoinStreamService,
```

- [ ] **Step 2: threads.controller.ts 构造注入 JoinStreamService**

在 `apps/server/src/ai/langgraph/threads.controller.ts` import 区：

(a) `@nestjs/common` import 块（line 23-34）当前为 `Body, Controller, Delete, Get, Logger, NotFoundException, Param, Patch, Post, Res`，**缺 `Query`**。加 `Query`（字母序，插在 `Post` 与 `Res` 之间）：

```ts
    Post,
    Query,
    Res,
```

(b) `Response`（express，line 35）、`NotFoundException`、`writeSSE` **均已 import**，不要重复。新增 3 个 import（与现有 `../run/run-record` 等 import 并列）：

```ts
import { JoinStreamService } from '../run/join-stream.service';
import type { RunEventSink } from '../run/run-event-sink';
import type { RunStreamEvent } from '../event/event-bus';
```

constructor 加 `JoinStreamService` 参数：

```ts
    constructor(
        private readonly aiService: AiChatService,
        private readonly threadService: ThreadService,
        private readonly checkpointReader: CheckpointReaderService,
        private readonly joinStreamService: JoinStreamService,
    ) {}
```

- [ ] **Step 3: 实现 joinStream 端点（替换 501 桩）**

替换 `apps/server/src/ai/langgraph/threads.controller.ts` 的 `joinStream` 方法（当前 line 275-281 返回 501）为：

```ts
    /**
     * GET /api/threads/:threadId/runs/:runId/stream — 重新加入正在进行的 run（spec 3.5）
     *
     * 回放 PG 持久化事件（seq > since）+ 续收 EventBus 实时事件，按 seq 去重衔接，
     * 终态（end/error）关闭 SSE。since=0 从头回放。
     */
    @Get(':threadId/runs/:runId/stream')
    async joinStream(
        @Param('threadId') _threadId: string,
        @Param('runId') runId: string,
        @Query('since') sinceParam: string | undefined,
        @Res() res: Response,
    ): Promise<void> {
        const since = Number.parseInt(sinceParam ?? '0', 10);
        const safeSince = Number.isFinite(since) && since >= 0 ? since : 0;

        this.setSseHeaders(res);

        const sink: RunEventSink = {
            push: (event: RunStreamEvent) => {
                writeSSE(res, event.eventType, event.payload);
            },
            close: () => {
                if (!res.writableEnded) {
                    res.end();
                }
            },
        };

        let cleanup: () => void = () => {};
        // 客户端断开时清理（防 interrupted 连接 subscription 泄漏）
        res.on('close', () => cleanup());

        try {
            cleanup = await this.joinStreamService.joinStream(runId, safeSince, sink);
        } catch (error) {
            if (!res.writableEnded) {
                // NotFoundException → 404；其他 → SSE error 事件
                if (error instanceof NotFoundException) {
                    res.status(404).json({ error: 'not_found', message: (error as Error).message });
                } else {
                    this.logger.error(`joinStream failed: ${(error as Error).message}`);
                    this.sendProtocolError(res, 'execution_error', (error as Error).message);
                }
            }
        }
    }
```

（确保 `NotFoundException` 已从 `@nestjs/common` import —— getThread/deleteThread 用了它，应已 import。`writeSSE` 已 import。）

- [ ] **Step 4: bootstrap spec 验证 JoinStreamService DI wiring**

在 `apps/server/src/ai/__tests__/ai.module.bootstrap.spec.ts` import 区加（`RunStateRepository` import 附近）：

```ts
import { JoinStreamService } from '../run/join-stream.service';
```

在 `describe('AiModule bootstrap')` 末尾（最后 `it` 之后、闭合 `})` 之前）加：

```ts
    it('wires JoinStreamService through Nest DI', async () => {
        const module = await compileAiModuleForDi();
        expect(module.get(JoinStreamService)).toBeInstanceOf(JoinStreamService);
        await module.close();
    });
```

- [ ] **Step 5: 运行 bootstrap spec，确认新测试通过**

Run:
```bash
cd apps/server && pnpm exec jest src/ai/__tests__/ai.module.bootstrap.spec.ts
```
Expected: PASS — 原 11 + 新 1 = 12 测试全绿。

- [ ] **Step 6: 全量回归 + 构建**

Run:
```bash
cd apps/server && pnpm exec jest src/ai src/config --runInBand && pnpm run build
```
Expected: jest 全绿（P2-3a 基线 17 suites / 223 passed / 1 skipped + join-stream.service.spec 1 suite / 9 tests + bootstrap +1 = 约 18 suites / ~233 passed / 1 skipped）；`pnpm run build` 通过（忽略预存 `tool-node.span.spec.ts` 无关错误）。

- [ ] **Step 7: 提交**

```bash
git add apps/server/src/ai/ai.module.ts apps/server/src/ai/langgraph/threads.controller.ts apps/server/src/ai/__tests__/ai.module.bootstrap.spec.ts
git commit -m "feat(ai): wire joinStream endpoint to JoinStreamService (P2-3b)"
```

---

## 验收标准（本阶段）

- [ ] `RunEventSink` 接口（push/close）抽象 SSE 出口
- [ ] `JoinStreamService.joinStream(runId, since, sink)` 返回 cleanup：terminal 纯回放 + close；running/interrupted 先 subscribe 再回放 + seq 去重 + 终态 close；返回幂等 cleanup
- [ ] 404（Run 不存在）经 `NotFoundException`；since 参数解析（默认 0，非数字降级 0）
- [ ] `threads.controller.ts` joinStream 端点替换 501 桩：SSE sink 适配 + `res.on('close')` cleanup
- [ ] `AiModule` 注册 JoinStreamService；bootstrap 验证 wiring
- [ ] 全量 `jest src/ai src/config` + `build` 通过；9 个 joinStream service 单测覆盖 terminal/续实时/去重/interrupted/cleanup

## 本阶段不做（留给后续）

- user 隔离（spec 6.2，P5）—— joinStream 当前任何客户端可 join 任何 run
- SSE 心跳（spec 3.9，每 15s `: heartbeat`）
- since 上限校验（spec 6.2 安全，防恶意超大回放）
- 端到端集成测试（真实 Redis + 多副本 + SSE 客户端，需部署环境）
- owner 端 SSE 订阅者复用（spec 3.8 RunSession.sseSubscribers，发起者与重连者一视同仁）—— 当前 streamRun（发起者）与 joinStream（重连者）是独立路径

## 如何验证 joinStream 端到端（部署级，非 CI）

单测覆盖编排逻辑（收集器 sink + InProcess EventBus + mock repos）。端到端验证需真实环境：
1. 启动后端，发起一个 run（POST /runs/stream）。
2. 用第二个连接 GET /runs/:rid/stream?since=0 → 应收到回放事件 + 续实时 token。
3. 断开第二个连接 → cleanup 触发，无 subscription 泄漏。
此验证依赖部署（AI_EVENT_BUS=redis 多副本时验证跨副本），不在单测范围。
