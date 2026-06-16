# LLM 对话协议重构 P2-2：RedisEventBus 实现 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 `RedisEventBus`（`EventBus` 抽象的多副本实现，基于 Redis Pub/Sub），并让 `AiModule` 按 `AI_EVENT_BUS` 环境变量在 `InProcessEventBus`（单进程降级）与 `RedisEventBus`（多副本）间切换。本阶段不实现 joinStream 消费方（P2-3），只交付"可工作、可注入、有测试覆盖"的 Redis 实现 + 切换开关。

**Architecture:** `RedisEventBus extends EventBus`，构造注入两个 `RedisPubSubLike`（publisher 连接做 `PUBLISH`，subscriber 连接做 `SUBSCRIBE` —— ioredis 的 subscribe 模式独占连接，必须分离两条）。channel = `run:{runId}`（复用 P2-1 的 `runChannel`）。`RunStreamEvent` 经 `JSON.stringify` 传输，subscriber 的 `message` 事件解析回对象并路由到该 channel 的 handler 集合。懒订阅（spec 3.4）：某 channel 首个 handler 到达才 `SUBSCRIBE`，最后一个离开才 `UNSUBSCRIBE`。`AiModule` 的 `EventBus` provider 从 `useClass: InProcessEventBus` 改为 `useFactory`，按 `EnvConfig.eventBusMode` 返回对应实现；默认 `in-process`，本地开发无需 Redis。

**Tech Stack:** NestJS（DI + `useFactory` + `OnModuleDestroy` + Jest）、ioredis ^5.9.1（已装）、Redis 7（docker-compose 已就绪，端口 6379）、TypeScript。RedisEventBus 自身单测**不依赖真实 Redis** —— 注入 `FakeRedis`（基于 `node:events` 的 `EventEmitter`）验证编排逻辑；真实 `new Redis(url)` 的实例化在 `useFactory`，由部署环境验证。

**Spec:** `docs/superpowers/specs/2026-06-15-llm-conversation-protocol-design.md` 第 3.1 节（Redis 已就绪）、3.4 节（channel `run:{runId}` + 懒订阅 + message `{ seq, eventType, payload }`）、6.3 节（EventBus 抽象 + 单进程降级）。本计划是 P2 第二个子阶段（memory [[llm-protocol-p2-plan]]）；P2-1（EventBus 抽象 + InProcess）已合并 main（`893a5bf`）。

---

## 关键设计约束（实现时不可违背）

1. **RedisEventBus 注入 RedisPubSubLike，不自己 new Redis**：解耦 ioredis 实例化，使编排逻辑（handler map 管理、懒订阅、序列化、lifecycle）可用 `FakeRedis` 独立单测。真实 `new Redis(url)` 只发生在 `AiModule` 的 `useFactory`。`RedisPubSubLike` 是最小接口（publish/subscribe/unsubscribe/on('message')/quit），ioredis 的 `Redis` 实例天然满足。
2. **publisher 与 subscriber 必须是两条独立连接**：Redis 协议规定，一个连接进入 SUBSCRIBE 模式后只能执行 subscribe/unsubscribe/psubscribe/punsubscribe，不能 PUBLISH。`useFactory` 必须 `new Redis(url)` 两次分别传入。
3. **懒订阅按 channel 引用计数**（spec 3.4）：channel 的本地 handler 集合为空时才 `SUBSCRIBE`，非空时复用；集合清空时才 `UNSUBSCRIBE`。即 `subscriber.subscribe(channel)` 每个 channel 至多调一次（直到所有 handler 离开）。
4. **默认 in-process，本地开发不依赖 Redis**（spec 6.3）：`AI_EVENT_BUS` 未设或非 `'redis'` 一律降级 `InProcessEventBus`。`EnvConfig.eventBusMode` getter 把任何非 `'redis'` 值归一为 `'in-process'`。
5. **publish 返回 Promise<void>，subscribe 同步返回 EventBusSubscription**：与 InProcessEventBus / EventBus 抽象一致。`subscriber.subscribe(channel)` 是 async，但 `subscribe()` 方法**同步返回**（fire-and-forget `void this.subscriber.subscribe(channel)`）；调用方（P2-3 joinStream）负责"先订阅后回放"的时序（spec 3.5），不在 EventBus 层阻塞。
6. **OnModuleDestroy 必须 quit 两条连接**：进程退出时关闭 Redis 连接，防泄漏。quit 失败 warn 不抛（降级优雅退出）。
7. **本阶段边界**：只交付 RedisEventBus 实现 + DI 切换。**不**实现 joinStream（P2-3）、**不**接入 `RunRecord.emitEvent` 三路解耦（spec 3.3，P3）、**不**做副本级 SSE 连接索引（spec 3.4 的 `Map<runId, Set<sseConn>>`，那是 joinStream 层）。此时 EventBus 仍无消费方。

## File Structure

**新建：**
- `apps/server/src/ai/event/redis.event-bus.ts` — `RedisPubSubLike` 接口 + `RedisEventBus extends EventBus implements OnModuleDestroy`
- `apps/server/src/ai/event/__tests__/redis.event-bus.spec.ts` — 注入 `FakeRedis` 的 TDD 测试（~10 用例）

**修改：**
- `apps/server/src/config/dto/env.validation.ts` — 新增 `AI_EVENT_BUS` 可选字段（Redis 区块末尾）
- `apps/server/src/config/env.config.ts` — 新增 `eventBusMode` getter（Redis 区块）
- `apps/server/src/config/__tests__/env.event-bus.spec.ts` — `eventBusMode` getter 的 TDD 测试（新建测试文件）
- `apps/server/src/ai/ai.module.ts` — `EventBus` provider 从 `useClass` 改为 `useFactory`（按 env 切换）
- `apps/server/src/ai/__tests__/ai.module.bootstrap.spec.ts` — 验证默认（无 `AI_EVENT_BUS`）仍绑定为 `InProcessEventBus`（回归）

---

## Task 1: AI_EVENT_BUS 环境变量 + eventBusMode getter（TDD）

**Files:**
- Create: `apps/server/src/config/__tests__/env.event-bus.spec.ts`
- Modify: `apps/server/src/config/dto/env.validation.ts`（Redis 区块末尾，约 `CACHE_KEY_PREFIX` 字段之后、class 闭合 `}` 之前）
- Modify: `apps/server/src/config/env.config.ts`（Redis 区块，`redisUrl` getter 之后）

- [ ] **Step 1: 写失败测试**

`apps/server/src/config/__tests__/env.event-bus.spec.ts`：

```ts
import { EnvConfig } from '../env.config';

/**
 * eventBusMode getter —— AI_EVENT_BUS 归一化为 'in-process' | 'redis'。
 * 默认 in-process（本地开发不依赖 Redis，spec 6.3）。
 */
describe('EnvConfig.eventBusMode', () => {
    const originalEnv = process.env;
    const REQUIRED = {
        DATABASE_URL: 'postgresql://kmuser:kmpass@localhost:5432/km_db',
        JWT_SECRET: 'test-secret-test-secret-test-secret',
    };

    beforeEach(() => {
        process.env = { ...REQUIRED };
    });

    afterAll(() => {
        process.env = originalEnv;
    });

    it('defaults to in-process when AI_EVENT_BUS is unset', () => {
        delete process.env.AI_EVENT_BUS;
        expect(new EnvConfig().eventBusMode).toBe('in-process');
    });

    it('returns redis when AI_EVENT_BUS=redis', () => {
        process.env.AI_EVENT_BUS = 'redis';
        expect(new EnvConfig().eventBusMode).toBe('redis');
    });

    it('falls back to in-process for any non-redis value', () => {
        process.env.AI_EVENT_BUS = 'garbage';
        expect(new EnvConfig().eventBusMode).toBe('in-process');
    });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run:
```bash
cd apps/server && pnpm exec jest src/config/__tests__/env.event-bus.spec.ts
```
Expected: FAIL —— `Property 'eventBusMode' does not exist on type 'EnvConfig'`（TS 编译错误）或运行时 undefined。确认 getter 尚不存在。

- [ ] **Step 3: 加 env.validation schema 字段**

在 `apps/server/src/config/dto/env.validation.ts` 的 Redis 区块末尾 —— 即 `CACHE_KEY_PREFIX` 字段（约第 294 行）之后、class 闭合 `}` 之前 —— 插入：

```ts

    /**
     * AI 事件总线模式
     * - in-process：单进程降级（默认，本地开发不依赖 Redis）
     * - redis：多副本，跨副本事件分发（spec 6.3）
     * @default in-process
     */
    @IsString()
    @IsOptional()
    AI_EVENT_BUS?: string;
```

- [ ] **Step 4: 加 EnvConfig.eventBusMode getter**

在 `apps/server/src/config/env.config.ts` 的 Redis 区块 —— `redisUrl` getter（约第 199-204 行）之后、`cacheTtl` getter 之前 —— 插入：

```ts

    /**
     * AI 事件总线模式（spec 6.3）。
     * 任何非 'redis' 值一律降级为 'in-process'（本地开发不依赖 Redis）。
     */
    get eventBusMode(): 'in-process' | 'redis' {
        return this.config.AI_EVENT_BUS === 'redis' ? 'redis' : 'in-process';
    }
```

- [ ] **Step 5: 运行测试，确认通过**

Run:
```bash
cd apps/server && pnpm exec jest src/config/__tests__/env.event-bus.spec.ts
```
Expected: PASS —— 3 个测试全绿（默认 in-process / redis 值 / 非 redis 值降级）。

- [ ] **Step 6: 提交**

```bash
git add apps/server/src/config/__tests__/env.event-bus.spec.ts apps/server/src/config/dto/env.validation.ts apps/server/src/config/env.config.ts
git commit -m "feat(config): add AI_EVENT_BUS mode switch (P2)"
```

---

## Task 2: RedisEventBus 实现（TDD，注入 FakeRedis）

**Files:**
- Create: `apps/server/src/ai/event/__tests__/redis.event-bus.spec.ts`
- Create: `apps/server/src/ai/event/redis.event-bus.ts`

- [ ] **Step 1: 写失败测试（先测后码）**

`apps/server/src/ai/event/__tests__/redis.event-bus.spec.ts`：

```ts
import { EventEmitter } from 'node:events';
import { RedisEventBus } from '../redis.event-bus';
import { runChannel, type RunStreamEvent } from '../event-bus';

/**
 * FakeRedis —— 最小 Redis Pub/Sub 测试替身（结构满足 RedisPubSubLike）。
 * publish 记录调用；message 经 EventEmitter.emit 路由到 subscriber 监听器；
 * subscribe/unsubscribe 记录 channel 调用以便验证懒订阅。
 */
class FakeRedis extends EventEmitter {
    published: Array<{ channel: string; message: string }> = [];
    subscribed: string[] = [];
    unsubscribed: string[] = [];
    quitCount = 0;

    async publish(channel: string, message: string): Promise<number> {
        this.published.push({ channel, message });
        return 1;
    }

    async subscribe(...channels: string[]): Promise<number> {
        this.subscribed.push(...channels);
        return channels.length;
    }

    async unsubscribe(...channels: string[]): Promise<number> {
        this.unsubscribed.push(...channels);
        return channels.length;
    }

    async quit(): Promise<string> {
        this.quitCount++;
        return 'OK';
    }
}

describe('RedisEventBus', () => {
    let publisher: FakeRedis;
    let subscriber: FakeRedis;
    let bus: RedisEventBus;

    beforeEach(() => {
        publisher = new FakeRedis();
        subscriber = new FakeRedis();
        bus = new RedisEventBus(publisher, subscriber);
    });

    const ev = (seq: number, eventType = 'values'): RunStreamEvent => ({
        seq,
        eventType,
        payload: { n: seq },
    });

    it('publishes a JSON-serialized event on the channel', async () => {
        await bus.publish(runChannel('r1'), ev(1));
        expect(publisher.published).toEqual([
            { channel: 'run:r1', message: JSON.stringify(ev(1)) },
        ]);
    });

    it('delivers a subscriber message to a handler (parsed)', () => {
        const handler = jest.fn();
        bus.subscribe(runChannel('r1'), handler);
        subscriber.emit('message', 'run:r1', JSON.stringify(ev(2)));
        expect(handler).toHaveBeenCalledWith(ev(2));
    });

    it('delivers to multiple handlers on the same channel', () => {
        const a = jest.fn();
        const b = jest.fn();
        bus.subscribe(runChannel('r1'), a);
        bus.subscribe(runChannel('r1'), b);
        subscriber.emit('message', 'run:r1', JSON.stringify(ev(3)));
        expect(a).toHaveBeenCalledWith(ev(3));
        expect(b).toHaveBeenCalledWith(ev(3));
    });

    it('stops delivering after unsubscribe', () => {
        const handler = jest.fn();
        const sub = bus.subscribe(runChannel('r1'), handler);
        subscriber.emit('message', 'run:r1', JSON.stringify(ev(1)));
        sub.unsubscribe();
        subscriber.emit('message', 'run:r1', JSON.stringify(ev(2)));
        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler).toHaveBeenCalledWith(ev(1));
    });

    it('isolates channels — message on one does not reach another', () => {
        const handler = jest.fn();
        bus.subscribe(runChannel('r1'), handler);
        subscriber.emit('message', 'run:r2', JSON.stringify(ev(1)));
        expect(handler).not.toHaveBeenCalled();
    });

    it('lazily subscribes a channel once for multiple handlers', () => {
        bus.subscribe(runChannel('r1'), jest.fn());
        bus.subscribe(runChannel('r1'), jest.fn());
        expect(subscriber.subscribed.filter(c => c === 'run:r1')).toHaveLength(1);
    });

    it('unsubscribes the channel only when the last handler leaves', () => {
        const sub1 = bus.subscribe(runChannel('r1'), jest.fn());
        const sub2 = bus.subscribe(runChannel('r1'), jest.fn());
        sub1.unsubscribe();
        expect(subscriber.unsubscribed).not.toContain('run:r1');
        sub2.unsubscribe();
        expect(subscriber.unsubscribed).toContain('run:r1');
    });

    it('unsubscribe is idempotent after channel teardown', () => {
        const sub = bus.subscribe(runChannel('r1'), jest.fn());
        sub.unsubscribe();
        expect(() => sub.unsubscribe()).not.toThrow();
        expect(subscriber.unsubscribed.filter(c => c === 'run:r1')).toHaveLength(1);
    });

    it('discards an unparseable message without throwing', () => {
        const handler = jest.fn();
        bus.subscribe(runChannel('r1'), handler);
        expect(() => subscriber.emit('message', 'run:r1', '{not json')).not.toThrow();
        expect(handler).not.toHaveBeenCalled();
    });

    it('quits both connections on module destroy', async () => {
        await bus.onModuleDestroy();
        expect(publisher.quitCount).toBe(1);
        expect(subscriber.quitCount).toBe(1);
    });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run:
```bash
cd apps/server && pnpm exec jest src/ai/event/__tests__/redis.event-bus.spec.ts
```
Expected: FAIL —— `Cannot find module '../redis.event-bus'`（import 解析失败）。确认测试在等待实现。

- [ ] **Step 3: 实现 RedisEventBus + RedisPubSubLike**

`apps/server/src/ai/event/redis.event-bus.ts`：

```ts
import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { EventBus, type EventBusSubscription, type RunStreamEvent } from './event-bus';

/**
 * RedisEventBus 依赖的最小 Pub/Sub 接口。
 *
 * ioredis 的 Redis 实例天然满足此接口；测试注入 FakeRedis。
 * 抽出此接口是为了解耦 ioredis 实例化——RedisEventBus 只编排"handler 管理 +
 * 懒订阅 + 序列化 + lifecycle"逻辑，真实 new Redis(url) 发生在 AiModule.useFactory。
 */
export interface RedisPubSubLike {
    publish(channel: string, message: string): Promise<unknown>;
    subscribe(...channels: string[]): Promise<unknown>;
    unsubscribe(...channels: string[]): Promise<unknown>;
    on(event: 'message', listener: (channel: string, message: string) => void): unknown;
    quit(): Promise<unknown>;
}

/**
 * RedisEventBus — EventBus 的多副本实现（spec 3.1/3.4/6.3）。
 *
 * 基于 Redis Pub/Sub：publisher 连接 PUBLISH，subscriber 连接 SUBSCRIBE。
 * ioredis 的 subscribe 模式独占连接（订阅后该连接不能执行普通命令），故分离
 * publisher/subscriber 两条连接。channel = run:{runId}（runChannel helper）。
 *
 * 懒订阅（spec 3.4）：某 channel 首个 handler 到达才 SUBSCRIBE，最后一个离开才
 * UNSUBSCRIBE；channel → handlers 由本类管理，subscriber 每 channel 只订阅一次。
 *
 * 序列化：RunStreamEvent 经 JSON.stringify 传输，message 事件 JSON.parse 还原。
 * subscribe() 同步返回（fire-and-forget SUBSCRIBE），调用方（P2-3 joinStream）
 * 负责"先订阅后回放"时序（spec 3.5）。
 */
@Injectable()
export class RedisEventBus extends EventBus implements OnModuleDestroy {
    private readonly logger = new Logger(RedisEventBus.name);
    private readonly publisher: RedisPubSubLike;
    private readonly subscriber: RedisPubSubLike;
    /** channel → handlers；懒订阅的引用计数靠 Set.size */
    private readonly handlers = new Map<string, Set<(event: RunStreamEvent) => void>>();

    constructor(publisher: RedisPubSubLike, subscriber: RedisPubSubLike) {
        super();
        this.publisher = publisher;
        this.subscriber = subscriber;
        this.subscriber.on('message', (channel, message) => {
            const handlers = this.handlers.get(channel);
            if (!handlers) return;
            let event: RunStreamEvent;
            try {
                event = JSON.parse(message) as RunStreamEvent;
            } catch (err) {
                this.logger.warn(
                    `Discarding unparseable message on ${channel}: ${(err as Error).message}`,
                );
                return;
            }
            for (const handler of handlers) handler(event);
        });
    }

    override async publish(channel: string, event: RunStreamEvent): Promise<void> {
        await this.publisher.publish(channel, JSON.stringify(event));
    }

    override subscribe(
        channel: string,
        handler: (event: RunStreamEvent) => void,
    ): EventBusSubscription {
        let set = this.handlers.get(channel);
        if (!set) {
            set = new Set();
            this.handlers.set(channel, set);
            // 懒订阅：该 channel 首个 handler 才真正 SUBSCRIBE（fire-and-forget）
            void this.subscriber.subscribe(channel);
        }
        set.add(handler);
        return {
            unsubscribe: () => {
                const current = this.handlers.get(channel);
                if (!current) return;
                current.delete(handler);
                if (current.size === 0) {
                    this.handlers.delete(channel);
                    // 懒退订：最后一个 handler 离开才 UNSUBSCRIBE
                    void this.subscriber.unsubscribe(channel);
                }
            },
        };
    }

    async onModuleDestroy(): Promise<void> {
        await Promise.all([this.publisher.quit(), this.subscriber.quit()]).catch(err => {
            this.logger.warn(`Redis quit error: ${(err as Error).message}`);
        });
    }
}
```

- [ ] **Step 4: 运行测试，确认全部通过**

Run:
```bash
cd apps/server && pnpm exec jest src/ai/event/__tests__/redis.event-bus.spec.ts
```
Expected: PASS —— 10 个测试全绿（序列化投递 / 解析路由 / 多 handler / unsubscribe 停投递 / channel 隔离 / 懒订阅一次 / 懒退订 / 幂等退订 / 不可解析丢弃 / 双连接 quit）。

- [ ] **Step 5: 提交**

```bash
git add apps/server/src/ai/event/redis.event-bus.ts apps/server/src/ai/event/__tests__/redis.event-bus.spec.ts
git commit -m "feat(ai): implement RedisEventBus with TDD coverage (P2)"
```

---

## Task 3: AiModule useFactory 按 env 切换 + bootstrap 回归

**Files:**
- Modify: `apps/server/src/ai/ai.module.ts`（import 区约 20-21 行；providers 基础设施层 EventBus 绑定约 49 行）
- Modify: `apps/server/src/ai/__tests__/ai.module.bootstrap.spec.ts`（验证默认绑定回归）

- [ ] **Step 1: ai.module.ts 改 useClass 为 useFactory，按 env 切换**

在 `apps/server/src/ai/ai.module.ts` 顶部 import 区新增 ioredis + RedisEventBus（保留 EventBus / InProcessEventBus 已有 import）：

```ts
import Redis from 'ioredis';
```

```ts
import { EventBus } from './event/event-bus';
import { InProcessEventBus } from './event/in-process.event-bus';
import { RedisEventBus } from './event/redis.event-bus';
```

把 providers 基础设施层的 EventBus 绑定从：

```ts
        // EventBus — abstract token 绑定单进程降级实现（spec 6.3）；
        // 多副本部署改 useClass: RedisEventBus（P2 后续）
        { provide: EventBus, useClass: InProcessEventBus },
```

改为 useFactory（按 EnvConfig.eventBusMode 切换）：

```ts
        // EventBus — abstract token 按 AI_EVENT_BUS 切换实现（spec 6.3）：
        //   in-process（默认，单进程降级）→ InProcessEventBus
        //   redis（多副本）→ RedisEventBus，两条独立连接（publisher + subscriber）
        {
            provide: EventBus,
            inject: [EnvConfig],
            useFactory: (config: EnvConfig) => {
                if (config.eventBusMode !== 'redis') {
                    return new InProcessEventBus();
                }
                const url = config.redisUrl;
                return new RedisEventBus(new Redis(url), new Redis(url));
            },
        },
```

同时在 ai.module.ts 顶部 import 区加 `EnvConfig`（若尚未导入）—— 检查现有 import；ConfigModule 是 `@Global`，`EnvConfig` 类可直接注入。在 `@nestjs/common` import 旁、或与其他 config 相关 import 一起加入：

```ts
import { EnvConfig } from '../config/env.config';
```

- [ ] **Step 2: 确认 bootstrap 回归（默认 in-process 仍绑定 InProcessEventBus）**

`apps/server/src/ai/__tests__/ai.module.bootstrap.spec.ts` 的现有测试 `'binds EventBus to InProcessEventBus through Nest DI'` 在 `useFactory` 默认分支下仍应通过（`AI_EVENT_BUS` 未设 → `eventBusMode === 'in-process'` → 返回 `new InProcessEventBus()`）。

无需新增测试 —— 跑现有 bootstrap spec 验证回归即可：

Run:
```bash
cd apps/server && pnpm exec jest src/ai/__tests__/ai.module.bootstrap.spec.ts
```
Expected: PASS —— 11 个测试全绿（含 `binds EventBus to InProcessEventBus` + `EventBus delivers events end-to-end`，证明 useFactory 默认路径与原 useClass 行为一致）。

- [ ] **Step 3: 全量回归 + 构建**

Run:
```bash
cd apps/server && pnpm exec jest src/ai src/config --runInBand && pnpm run build
```
Expected: jest 全绿（P2-1 基线 15 suites/202 passed/1 skipped + Task 1 env spec 1 suite/3 tests + Task 2 redis-event-bus spec 1 suite/10 tests）；`pnpm run build` 通过（tsc 无错；忽略预存的 `tool-node.span.spec.ts` 无关错误）。注意：bootstrap spec 默认不实例化 RedisEventBus（`AI_EVENT_BUS` 未设），不会触发真实 Redis 连接。

- [ ] **Step 4: 提交**

```bash
git add apps/server/src/ai/ai.module.ts apps/server/src/ai/__tests__/ai.module.bootstrap.spec.ts
git commit -m "feat(ai): switch EventBus binding by AI_EVENT_BUS env (P2)"
```

（若 bootstrap spec 未改动则只 add ai.module.ts；Step 2 只是跑回归。）

---

## 验收标准（本阶段）

- [ ] `AI_EVENT_BUS` env 支持（默认 in-process，`'redis'` 切多副本），`EnvConfig.eventBusMode` getter 归一化
- [ ] `RedisEventBus extends EventBus` 注入两条 `RedisPubSubLike`，pub/sub + 懒订阅 + JSON 序列化 + `OnModuleDestroy` quit，10 个单测覆盖（注入 `FakeRedis`，无真实 Redis）
- [ ] `AiModule` 的 `EventBus` provider 用 `useFactory` 按 `eventBusMode` 切换；默认 in-process 回归不破
- [ ] 全量 `jest src/ai src/config` + `build` 通过；RedisEventBus 单测不依赖真实 Redis

## 本阶段不做（留给后续）

- `joinStream` 端点（回放 PG + 续 Redis 实时、seq 去重衔接，P2-3）
- 副本级 SSE 连接索引 `Map<runId, Set<sseConn>>`（spec 3.4，joinStream 层）
- `RunRecord.emitEvent` 三路解耦接入 EventBus（spec 3.3，P3）
- Redis 连接的真实集成测试（需 docker-compose up redis，留给部署/集成测试，不在单测范围）
- stop 统一语义、前端连接态（P2-4/P2-5 + P4）

## 如何验证多副本真的工作（部署级，非本阶段 CI）

本阶段交付的是单测覆盖的编排逻辑。要端到端验证跨副本事件分发，部署后：
1. `AI_EVENT_BUS=redis` 启动两个后端副本（不同 `AI_REPLICA_ID`）。
2. 副本 A 的 owner run publish 事件 → 副本 B 的 SSE 连接应通过 Redis 收到（P2-3 joinStream 实现后）。
此验证依赖 P2-3 的消费方，本阶段不涉及。
