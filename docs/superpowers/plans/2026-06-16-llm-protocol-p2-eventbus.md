# LLM 对话协议重构 P2-1：EventBus 抽象 + InProcess 实现 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立 `EventBus` 跨副本实时事件分发抽象与其单进程降级实现 `InProcessEventBus`，为 P2 后续的 `joinStream` 回放+续实时（spec 第 3 节）提供"非 owner 副本订阅实时事件"的基础设施。本阶段不依赖 Redis，纯新增文件，可独立 TDD。

**Architecture:** `EventBus` 以 abstract class 形式存在（既作 NestJS DI token，又约束实现形状），消费者注入 `EventBus` token，由 `AiModule` 按 `useClass: InProcessEventBus` 绑定具体实现。`InProcessEventBus` 基于 `apps/server/src/base/common/event.ts` 已有的 `Emitter<T>`，按 channel（`run:{runId}`）懒创建独立 Emitter，`publish` 同步 `fire`、`subscribe` 返回可销毁句柄。第二阶段 `RedisEventBus extends EventBus` 替换时，仅需在 `AiModule` 改 `useClass`（或按 env 切换），消费方零改动。

**Tech Stack:** NestJS（DI + Jest + ts-jest）、TypeScript。无新依赖、无 Prisma、无 Redis —— 纯进程内逻辑，测试极快。

**Spec:** `docs/superpowers/specs/2026-06-15-llm-conversation-protocol-design.md` 第 3.1 节（Redis 前提）、3.4 节（Channel 拓扑 `run:{runId}` + 消息 `{ seq, eventType, payload }`）、6.3 节（`EventBus` 抽象 + 单进程降级）。本计划是 P2 五个执行子阶段（memory [[llm-protocol-p2-plan]]）的**第 1 个**；后续 `RedisEventBus`、`joinStream` 回放、stop 统一、前端连接态各另立计划。

---

## 关键设计约束（实现时不可违背）

1. **EventBus 是行为抽象，不是 interface token**：TypeScript interface 编译后消失，无法作 NestJS DI token。故用 `abstract class EventBus` 作 token，`InProcessEventBus` / 未来 `RedisEventBus` 均 `extends EventBus`。消费方一律注入 `EventBus`，永不知具体实现。
2. **channel 拓扑固定 `run:{runId}`**（spec 3.4）：按 run 分 channel，非全集群广播。`runChannel(runId)` 是唯一合法的 channel 字符串构造方式，消费方不手拼 `run:xxx`。
3. **事件载荷统一形状 `RunStreamEvent`**（spec 3.4）：`{ seq, eventType, payload }`。`seq` 是 per-run 单调序号（重连去重锚），`eventType` 是 LangGraph 标准六类之一（metadata/messages/values/tasks/end/error），`payload` 是 SSE data 原样。
4. **publish 返回 Promise<void>**：InProcess 实现内部同步（`Emitter.fire` 同步），但接口返回 `Promise<void>` 以与未来 `RedisEventBus`（`PUBLISH` 是 async）对齐。实现里用 `async publish()` 让其自然返回 resolved promise。
5. **本阶段边界**：只交付抽象 + InProcess 实现 + DI 注册。**不**接入 `RunRecord.emitEvent` 三路解耦（那是 P3/spec 3.3），**不**实现 `joinStream`（P2-3），**不**引入 Redis（P2-2）。消费方此时无人调用 EventBus —— 本阶段交付的是"可注入、可工作、有测试覆盖"的基础设施，供后续阶段消费。
6. **InProcess 正确性下限**：单/多订阅者投递、unsubscribe 后停止、channel 隔离、无订阅者 publish 不报错、subscribe 期间自退订安全（joinStream 终态关闭场景）。这些是 `RedisEventBus` 也必须满足的语义契约，InProcess 先把它们钉死。

## File Structure

**新建：**
- `apps/server/src/ai/event/event-bus.ts` — `RunStreamEvent` / `EventBusSubscription` 类型 + `abstract class EventBus`（DI token）+ `runChannel(runId)` helper
- `apps/server/src/ai/event/in-process.event-bus.ts` — `InProcessEventBus extends EventBus`，基于 `Emitter<T>` 的单进程降级实现
- `apps/server/src/ai/event/__tests__/in-process.event-bus.spec.ts` — InProcess 语义 + runChannel 的 TDD 测试

**修改：**
- `apps/server/src/ai/ai.module.ts` — providers 注册 `{ provide: EventBus, useClass: InProcessEventBus }`，exports 导出 `EventBus`
- `apps/server/src/ai/__tests__/ai.module.bootstrap.spec.ts` — 验证 `EventBus` 经 DI 绑定为 `InProcessEventBus` + 端到端投递

---

## Task 1: EventBus 抽象 + 类型 + runChannel helper

**Files:**
- Create: `apps/server/src/ai/event/event-bus.ts`

- [ ] **Step 1: 创建 event-bus.ts（类型 + abstract class + channel helper）**

`apps/server/src/ai/event/event-bus.ts`：

```ts
/**
 * EventBus — 跨副本实时事件分发抽象（spec 3.1/3.4/6.3）。
 *
 * channel 拓扑：run:{runId}，按 run 分 channel（非全集群广播，spec 3.4）。
 * 两种实现：
 *   - RedisEventBus（多副本，P2 后续阶段）：Redis PUBLISH/SUBSCRIBE
 *   - InProcessEventBus（单进程降级，本地开发不依赖 Redis）
 *
 * 消费方注入 abstract class EventBus token，由 AiModule 按 env 绑定实现。
 * 用 abstract class 而非 interface：interface 编译后消失无法作 NestJS DI token，
 * abstract class 既能做 token 又能约束实现形状。
 */

/** spec 3.2/3.4 事件载荷：状态边界事件与临时(messages)事件统一形状 */
export interface RunStreamEvent {
    /** per-run 单调递增序号，重连去重锚（spec 3.5） */
    seq: number;
    /** LangGraph 标准事件名：metadata | messages | values | tasks | end | error */
    eventType: string;
    /** SSE 事件 data 原样载荷 */
    payload: unknown;
}

/** 订阅句柄：unsubscribe 后该订阅不再收到事件 */
export interface EventBusSubscription {
    unsubscribe(): void;
}

/**
 * channel 命名规则：run:{runId}（spec 3.4，按 run 分 channel）。
 * 消费方构造 channel 字符串的唯一合法方式，禁止手拼 `run:xxx`。
 */
export function runChannel(runId: string): string {
    return `run:${runId}`;
}

/**
 * EventBus abstract token —— NestJS provider token + 实现形状约束。
 *
 * publish 返回 Promise<void>：InProcess 实现内部同步，但接口与未来
 * RedisEventBus（PUBLISH 是 async）对齐。
 */
export abstract class EventBus {
    /** 发布事件到 channel。Redis 实现走 PUBLISH，InProcess 实现走 Emitter.fire。 */
    abstract publish(channel: string, event: RunStreamEvent): Promise<void>;

    /** 订阅 channel 的事件流，返回可销毁句柄（懒订阅由实现决定）。 */
    abstract subscribe(
        channel: string,
        handler: (event: RunStreamEvent) => void,
    ): EventBusSubscription;
}
```

- [ ] **Step 2: 验证类型编译通过**

Run:
```bash
cd apps/server && pnpm exec tsc --noEmit
```
Expected: 无错误退出（exit 0）。event-bus.ts 是纯新增类型文件，不引入新依赖。若 tsc 报其他预存文件错误（与本次无关），忽略 —— 只要本次新增文件无 TS 错误即可。

- [ ] **Step 3: 提交**

```bash
git add apps/server/src/ai/event/event-bus.ts
git commit -m "feat(ai): add EventBus abstraction + runChannel helper (P2)"
```

---

## Task 2: InProcessEventBus 实现（TDD）

**Files:**
- Create: `apps/server/src/ai/event/__tests__/in-process.event-bus.spec.ts`
- Create: `apps/server/src/ai/event/in-process.event-bus.ts`

- [ ] **Step 1: 写失败测试（先测后码）**

`apps/server/src/ai/event/__tests__/in-process.event-bus.spec.ts`：

```ts
import { InProcessEventBus } from '../in-process.event-bus';
import { runChannel, type RunStreamEvent } from '../event-bus';

describe('runChannel', () => {
    it('formats a channel as run:{runId}', () => {
        expect(runChannel('r_abc')).toBe('run:r_abc');
    });
});

describe('InProcessEventBus', () => {
    let bus: InProcessEventBus;

    beforeEach(() => {
        bus = new InProcessEventBus();
    });

    const ev = (seq: number, eventType = 'values'): RunStreamEvent => ({
        seq,
        eventType,
        payload: { n: seq },
    });

    it('delivers a published event to a subscribed handler', async () => {
        const received: RunStreamEvent[] = [];
        bus.subscribe(runChannel('r1'), e => received.push(e));
        await bus.publish(runChannel('r1'), ev(1));
        expect(received).toEqual([ev(1)]);
    });

    it('delivers to multiple subscribers on the same channel', async () => {
        const a: RunStreamEvent[] = [];
        const b: RunStreamEvent[] = [];
        bus.subscribe(runChannel('r1'), e => a.push(e));
        bus.subscribe(runChannel('r1'), e => b.push(e));
        await bus.publish(runChannel('r1'), ev(1));
        expect(a).toEqual([ev(1)]);
        expect(b).toEqual([ev(1)]);
    });

    it('stops delivering after unsubscribe', async () => {
        const received: RunStreamEvent[] = [];
        const sub = bus.subscribe(runChannel('r1'), e => received.push(e));
        await bus.publish(runChannel('r1'), ev(1));
        sub.unsubscribe();
        await bus.publish(runChannel('r1'), ev(2));
        expect(received).toEqual([ev(1)]);
    });

    it('isolates channels — publish to one does not reach another', async () => {
        const a: RunStreamEvent[] = [];
        bus.subscribe(runChannel('r1'), e => a.push(e));
        await bus.publish(runChannel('r2'), ev(1));
        expect(a).toEqual([]);
    });

    it('does not throw when publishing to a channel with no subscribers', async () => {
        await expect(bus.publish(runChannel('r1'), ev(1))).resolves.toBeUndefined();
    });

    it('is awaitable — handler runs before publish resolves', async () => {
        const seen: number[] = [];
        bus.subscribe(runChannel('r1'), e => seen.push(e.seq));
        await bus.publish(runChannel('r1'), ev(7));
        expect(seen).toEqual([7]);
    });

    it('unsubscribe is idempotent', async () => {
        const received: RunStreamEvent[] = [];
        const sub = bus.subscribe(runChannel('r1'), e => received.push(e));
        sub.unsubscribe();
        expect(() => sub.unsubscribe()).not.toThrow();
        await bus.publish(runChannel('r1'), ev(1));
        expect(received).toEqual([]);
    });

    it('survives a handler unsubscribing itself during dispatch', async () => {
        // 模拟 joinStream 收到 end 事件后自退订（终态关闭场景）
        const received: RunStreamEvent[] = [];
        let sub!: { unsubscribe(): void };
        sub = bus.subscribe(runChannel('r1'), e => {
            received.push(e);
            sub.unsubscribe();
        });
        await bus.publish(runChannel('r1'), ev(1));
        await bus.publish(runChannel('r1'), ev(2)); // 已退订，不应收到
        expect(received).toEqual([ev(1)]);
    });
});
```

- [ ] **Step 2: 运行测试，确认失败（实现不存在）**

Run:
```bash
cd apps/server && pnpm exec jest src/ai/event/__tests__/in-process.event-bus.spec.ts
```
Expected: FAIL —— `Cannot find module '../in-process.event-bus'`（或 import 解析失败）。确认测试在等待实现。

- [ ] **Step 3: 实现 InProcessEventBus**

`apps/server/src/ai/event/in-process.event-bus.ts`：

```ts
import { Injectable } from '@nestjs/common';
import { Emitter } from '../../base/common/event';
import { EventBus, type EventBusSubscription, type RunStreamEvent } from './event-bus';

/**
 * InProcessEventBus — EventBus 的单进程降级实现（spec 6.3）。
 *
 * 基于 base/common/event 的 Emitter<T>：每 channel 一个 Emitter，首次
 * publish/subscribe 时懒创建。publish 同步 fire（返回 resolved Promise），
 * subscribe 返回包装 Emitter.on dispose 的 EventBusSubscription。
 *
 * 多副本部署应改用 RedisEventBus（P2 后续阶段）；本地开发/单进程无需 Redis。
 * 消费方注入 abstract class EventBus token，由 AiModule 绑定本实现。
 */
@Injectable()
export class InProcessEventBus extends EventBus {
    /** channel → Emitter，首次访问懒创建 */
    private readonly channels = new Map<string, Emitter<RunStreamEvent>>();

    override async publish(channel: string, event: RunStreamEvent): Promise<void> {
        this.getOrCreate(channel).fire(event);
    }

    override subscribe(
        channel: string,
        handler: (event: RunStreamEvent) => void,
    ): EventBusSubscription {
        const dispose = this.getOrCreate(channel).on(handler);
        return { unsubscribe: dispose };
    }

    private getOrCreate(channel: string): Emitter<RunStreamEvent> {
        let emitter = this.channels.get(channel);
        if (!emitter) {
            emitter = new Emitter<RunStreamEvent>();
            this.channels.set(channel, emitter);
        }
        return emitter;
    }
}
```

- [ ] **Step 4: 运行测试，确认全部通过**

Run:
```bash
cd apps/server && pnpm exec jest src/ai/event/__tests__/in-process.event-bus.spec.ts
```
Expected: PASS —— `runChannel` 1 项 + `InProcessEventBus` 8 项，共 9 个测试全绿。

- [ ] **Step 5: 提交**

```bash
git add apps/server/src/ai/event/in-process.event-bus.ts apps/server/src/ai/event/__tests__/in-process.event-bus.spec.ts
git commit -m "feat(ai): implement InProcessEventBus with TDD coverage (P2)"
```

---

## Task 3: AiModule 注册 EventBus + bootstrap DI 验证

**Files:**
- Modify: `apps/server/src/ai/ai.module.ts`（providers 列表约 39-61 行；exports 约 62 行）
- Modify: `apps/server/src/ai/__tests__/ai.module.bootstrap.spec.ts`（import 区约 59-67 行；describe 末尾约 204 行）

- [ ] **Step 1: 在 ai.module.ts 注册 EventBus（useClass 绑定 InProcessEventBus）**

在 `apps/server/src/ai/ai.module.ts` 顶部 import 区（`RunEventStore` import 附近，约第 33 行后）新增：

```ts
import { EventBus } from './event/event-bus';
import { InProcessEventBus } from './event/in-process.event-bus';
```

在 `@Module` providers 数组中（"基础设施层"区块，`RunEventStore` 下方）新增绑定：

```ts
        // 基础设施层
        ThreadService,
        RunEventStore,
        CheckpointerProvider,
        CheckpointReaderService,
        // EventBus — abstract token 绑定单进程降级实现（spec 6.3）；
        // 多副本部署改 useClass: RedisEventBus（P2 后续）
        { provide: EventBus, useClass: InProcessEventBus },
```

在 `exports` 数组新增 `EventBus`（供未来 controller/joinStream 等跨模块消费方注入）：

```ts
    exports: [AiChatService, ThreadService, EventBus],
```

- [ ] **Step 2: 扩展 bootstrap spec，验证 DI wiring + 端到端投递**

在 `apps/server/src/ai/__tests__/ai.module.bootstrap.spec.ts` import 区（`RunStateRepository` import 附近，约第 67 行后）新增：

```ts
import { EventBus } from '../event/event-bus';
import { InProcessEventBus } from '../event/in-process.event-bus';
import { runChannel } from '../event/event-bus';
```

在 `describe('AiModule bootstrap')` 末尾（`wires RunStateRepository...` 测试之后、闭合 `})` 之前，约第 204 行）新增两个测试：

```ts
    it('binds EventBus to InProcessEventBus through Nest DI', async () => {
        const module = await compileAiModuleForDi();
        const bus = module.get(EventBus);
        expect(bus).toBeInstanceOf(InProcessEventBus);
        await module.close();
    });

    it('EventBus delivers events end-to-end after DI wiring', async () => {
        const module = await compileAiModuleForDi();
        const bus = module.get(EventBus);
        const received: number[] = [];
        bus.subscribe(runChannel('r1'), e => received.push(e.seq));
        await bus.publish(runChannel('r1'), { seq: 5, eventType: 'values', payload: {} });
        expect(received).toEqual([5]);
        await module.close();
    });
```

- [ ] **Step 3: 运行 bootstrap spec，确认新测试通过**

Run:
```bash
cd apps/server && pnpm exec jest src/ai/__tests__/ai.module.bootstrap.spec.ts
```
Expected: PASS —— 原有 9 个测试 + 新增 2 个，共 11 个全绿。

- [ ] **Step 4: 全量回归 + 构建**

Run:
```bash
cd apps/server && pnpm exec jest src/ai --runInBand && pnpm run build
```
Expected: jest 全绿（P1 基线 14 suites / 191 passed / 1 skipped + 本次新增 1 suite / ~11 tests）；`pnpm run build` 通过（tsc 无错）。

- [ ] **Step 5: 提交**

```bash
git add apps/server/src/ai/ai.module.ts apps/server/src/ai/__tests__/ai.module.bootstrap.spec.ts
git commit -m "feat(ai): register EventBus (InProcessEventBus) in AiModule (P2)"
```

---

## 验收标准（本阶段）

- [ ] `event-bus.ts` 提供 `RunStreamEvent` / `EventBusSubscription` 类型 + `abstract class EventBus` token + `runChannel(runId)` helper
- [ ] `InProcessEventBus extends EventBus` 基于 `Emitter<T>`，按 channel 懒创建，publish/subscribe/unsubscribe 语义正确（9 个单测覆盖）
- [ ] `AiModule` 用 `{ provide: EventBus, useClass: InProcessEventBus }` 注册并 export
- [ ] bootstrap spec 验证 DI 绑定为 `InProcessEventBus` + 端到端投递
- [ ] 全量 jest + build 通过，无新依赖、无 Redis、无 Prisma 改动

## 本阶段不做（留给后续）

- `RedisEventBus`（P2-2，依赖 Redis PUBLISH/SUBSCRIBE + 懒订阅）
- `joinStream` 端点回放 PG + 续 Redis 实时、seq 去重（P2-3）
- `RunRecord.emitEvent` 三路解耦接入 EventBus（spec 3.3，P3）
- stop 统一语义、前端连接态状态机（P2-4/P2-5 + P4）
