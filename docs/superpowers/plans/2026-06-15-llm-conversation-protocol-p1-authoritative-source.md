# LLM 对话协议重构 P1：权威源迁移 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 AI run 的状态与事件流从「进程内内存权威」迁移为「PG 权威 + 进程内 owner 缓存」，使 interrupted run 的 resume 可被任意后端副本接管（进程外 resume），为多副本部署奠基。

**Architecture:** 新增 `RunStateRepository` 作为 PG 权威读写层（封装 `prisma.run` 查询、乐观租约 `acquireLease/releaseLease/heartbeat`）；`RunManager` 退化为 owner 副本的执行态缓存 + 委托查询；`AiChatService.resumeFromCommand` 改为「查 PG → acquireLease → 从 RunRow 重建 RunContext/RunRecord → 执行」，不再依赖内存里碰巧有那个 RunRecord。`Run` 表新增 `ownerId`/`leaseUntil`/`lastSeq`/`resumePayload`/`llmConfig` 等字段，`RunEvent` 加 `@@unique([runId, seq])` 防重号。

**Tech Stack:** NestJS（DI + Jest + ts-jest）、Prisma 7（`@my-km/prisma` 包，`prisma migrate dev`）、PostgreSQL、LangGraph（checkpoint 已在 PostgresSaver 持久化）。

**Spec:** `docs/superpowers/specs/2026-06-15-llm-conversation-protocol-design.md` 第 2 节（权威状态层）+ 第 4.2-4.4 节（interrupted 稳态与进程外 resume）。本计划仅覆盖 spec 6.4 节的 **P1 阶段**；P2-P5 在各自阶段启动时另立计划。

---

## 关键设计约束（实现时不可违背）

1. **PG 是唯一权威源**：run 状态、事件 seq、租约归属全部以 `Run`/`RunEvent` 表为准。进程内 `RunManager.runs` Map 仅是 **owner 副本的执行态缓存**，可随时丢弃重建。
2. **owner 定义**：当前持有某 run 执行权的副本，由 `Run.ownerId` + `Run.leaseUntil` 界定。同一 run 任意时刻最多一个 owner（乐观租约保证）。
3. **interrupted 是持久化稳态**：graph 暂停在 checkpoint，owner 释放执行（`ownerId=NULL`）。resume 时由任意副本 `acquireLease` 抢占后从 checkpoint 恢复。
4. **P1 边界**：跨副本 `interrupt`（中止别副本的 run）和完整 `stop` 终态语义留给 P3。P1 的 `cancel` 仅对 owner 本副本内存 run 生效（现状），跨副本 cancel 标注 TODO。
5. **lastSeq 锚定 PG**：`RunRecord.seq` 起点读 `Run.lastSeq`，执行结束 flush 后回写，保证跨 owner 连续。SSE 写入解耦（三路）留给 P3，P1 保持 `RunEventStore` 现状。

## File Structure

**新建：**
- `apps/server/src/ai/run/replica-id.ts` — `REPLICA_ID` injection token
- `apps/server/src/ai/run/lease.types.ts` — `LeaseResult` 联合类型
- `apps/server/src/ai/run/run-state.repository.ts` — PG 权威读写 + 租约
- `apps/server/src/ai/run/__tests__/run-state.repository.spec.ts` — 仓储测试

**修改：**
- `packages/prisma/prisma/schema.prisma` — Run 新增字段、RunEvent 加 unique
- `apps/server/src/ai/run/run-record.ts` — lastSeq 起点 + setter
- `apps/server/src/ai/run/run-manager.ts` — createRun 持久化新字段、getActiveRunForThread 委托、新增 adoptRun
- `apps/server/src/ai/run/__tests__/run-manager.spec.ts` — 适配
- `apps/server/src/ai/ai.service.ts` — 注入 RunStateRepository + REPLICA_ID；resumeFromCommand 进程外化；startRun 并发查 PG；executeRunProtocol heartbeat + lastSeq 回写
- `apps/server/src/ai/__tests__/ai.service.spec.ts` — 适配新依赖
- `apps/server/src/ai/ai.module.ts` — 注册 RunStateRepository + REPLICA_ID

---

## Task 1: Prisma schema 迁移

**Files:**
- Modify: `packages/prisma/prisma/schema.prisma`（Run model，约 117-142 行；RunEvent model，约 144-157 行）

- [ ] **Step 1: 修改 Run model，新增权威源字段**

在 `packages/prisma/prisma/schema.prisma` 的 `model Run` 中，在 `provider  String?` 行之后、`// Token 用量` 注释之前插入：

```prisma
  // P1 权威源：执行输入与上下文快照
  assistantId    String    @default("default")
  inputKind      String    @default("message")   // message | resume
  content        String?   @db.Text              // 用户输入(仅 message kind)
  requestContext Json?                           // 编辑器上下文快照
  resumePayload  Json?                           // command.resume (仅 resume kind)
  llmConfig      Json?                           // provider/model 快照(重建 RunContext 用)
  traceId        String?

  // P1 权威源：多副本租约
  ownerId        String?                          // 持有执行的副本 ID
  leaseUntil     DateTime?                        // 租约过期时间
  lastSeq        Int       @default(0)            // 已持久化最大事件 seq
  error          String?   @db.Text               // 失败原因
```

- [ ] **Step 2: RunEvent model 加 unique 约束防重号**

在 `model RunEvent` 末尾（`@@index([runId])` 之后）追加：

```prisma
  @@unique([runId, seq])
```

- [ ] **Step 3: 生成迁移并应用**

Run:
```bash
pnpm --filter @my-km/prisma migrate -- --name p1_authoritative_source
pnpm --filter @my-km/prisma generate
```
Expected: 迁移文件创建于 `packages/prisma/prisma/migrations/<timestamp>_p1_authoritative_source/`，`migrate dev` 自动应用，`generate` 重新生成 client。若交互卡住，改用 `pnpm --filter @my-km/prisma migrate -- --name p1_authoritative_source --create-only` 后再 `pnpm --filter @my-km/prisma exec prisma migrate deploy`。

- [ ] **Step 4: 验证 client 类型包含新字段**

Run:
```bash
node -e "const {PrismaClient}=require('./packages/prisma/generated'); console.log('client loaded')"
```
Expected: 打印 `client loaded`，无异常。（确认 generated client 可加载；类型会在 ts-jest 编译时校验。）

- [ ] **Step 5: 提交**

```bash
git add packages/prisma/prisma/schema.prisma packages/prisma/prisma/migrations packages/prisma/generated
git commit -m "feat(ai): add authoritative-source fields to Run schema (P1)"
```

---

## Task 2: REPLICA_ID token 与 lease 类型

**Files:**
- Create: `apps/server/src/ai/run/replica-id.ts`
- Create: `apps/server/src/ai/run/lease.types.ts`

- [ ] **Step 1: 创建 REPLICA_ID injection token**

`apps/server/src/ai/run/replica-id.ts`：

```ts
/**
 * REPLICA_ID — 当前后端副本的唯一标识。
 *
 * 多副本下每个进程实例一个；用于 Run.ownerId 租约归属。
 * 来源：env AI_REPLICA_ID（部署时显式指定），否则进程启动随机生成（单进程足够）。
 */
export const REPLICA_ID = Symbol('REPLICA_ID');
```

- [ ] **Step 2: 创建 LeaseResult 类型**

`apps/server/src/ai/run/lease.types.ts`：

```ts
import type { PrismaService } from '../../prisma/prisma.service';

/** PG Run 行类型（Prisma 推断，避免直接依赖 generated 路径） */
export type RunRow = NonNullable<Awaited<ReturnType<PrismaService['run']['findUnique']>>>;

/** 租约抢占失败时的诊断信息 */
export interface LeaseConflict {
    ownerId: string | null;
    leaseUntil: Date | null;
}

export interface LeaseAcquired {
    acquired: true;
    run: RunRow;
    conflict: null;
}

export interface LeaseDenied {
    acquired: false;
    run: null;
    conflict: LeaseConflict | null;
}

/** acquireLease 返回值：成功携带 run 行，失败携带冲突诊断 */
export type LeaseResult = LeaseAcquired | LeaseDenied;
```

- [ ] **Step 3: 类型检查**

Run:
```bash
pnpm --filter server exec tsc --noEmit -p tsconfig.json 2>&1 | grep -E "replica-id|lease.types" || echo "no errors in new files"
```
Expected: 新文件无类型错误。（若 server 无独立 tsc 脚本，用 `pnpm --filter server build` 的类型检查阶段替代。）

- [ ] **Step 4: 提交**

```bash
git add apps/server/src/ai/run/replica-id.ts apps/server/src/ai/run/lease.types.ts
git commit -m "feat(ai): add REPLICA_ID token and LeaseResult types (P1)"
```

---

## Task 3: RunStateRepository — 基础查询与持久化

**Files:**
- Create: `apps/server/src/ai/run/run-state.repository.ts`
- Create: `apps/server/src/ai/run/__tests__/run-state.repository.spec.ts`

- [ ] **Step 1: 写失败测试（基础查询 + createRun + setStatus + saveResumePayload + updateLastSeq）**

`apps/server/src/ai/run/__tests__/run-state.repository.spec.ts`：

```ts
import { Test, type TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../prisma/prisma.service';
import { RunStateRepository } from '../run-state.repository';

function createMockPrisma(): PrismaService {
    return {
        run: {
            findUnique: jest.fn(),
            findFirst: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            updateMany: jest.fn(),
        },
    } as unknown as PrismaService;
}

describe('RunStateRepository', () => {
    let repo: RunStateRepository;
    let prisma: PrismaService;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                RunStateRepository,
                { provide: PrismaService, useFactory: createMockPrisma },
            ],
        }).compile();
        repo = module.get(RunStateRepository);
        prisma = module.get(PrismaService);
    });

    describe('findById', () => {
        it('returns run row by id', async () => {
            (prisma.run.findUnique as jest.Mock).mockResolvedValue({ id: 'r1', status: 'running' });
            const row = await repo.findById('r1');
            expect(row?.id).toBe('r1');
            expect(prisma.run.findUnique).toHaveBeenCalledWith({ where: { id: 'r1' } });
        });
    });

    describe('findActiveRunByThread', () => {
        it('queries active runs ordered by newest', async () => {
            (prisma.run.findFirst as jest.Mock).mockResolvedValue({ id: 'r1', threadId: 't1' });
            const row = await repo.findActiveRunByThread('t1');
            expect(row?.id).toBe('r1');
            expect(prisma.run.findFirst).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: {
                        threadId: 't1',
                        status: { in: ['pending', 'running', 'interrupted'] },
                    },
                    orderBy: { createdAt: 'desc' },
                }),
            );
        });
    });

    describe('createRun', () => {
        it('persists all authoritative fields', async () => {
            (prisma.run.create as jest.Mock).mockResolvedValue({ id: 'r1' });
            await repo.createRun({
                id: 'r1',
                threadId: 't1',
                status: 'pending',
                model: 'glm-5',
                provider: 'zhipu',
                inputKind: 'message',
                content: 'hi',
                requestContext: { selectedText: 'x' },
                llmConfig: { provider: 'zhipu', model: 'glm-5' },
                ownerId: 'replica-A',
                leaseUntil: expect.any(Date),
                traceId: 'trace-1',
            });
            expect(prisma.run.create).toHaveBeenCalledWith({
                data: expect.objectContaining({
                    id: 'r1',
                    inputKind: 'message',
                    content: 'hi',
                    ownerId: 'replica-A',
                    lastSeq: 0,
                }),
            });
        });
    });

    describe('setStatus', () => {
        it('sets startedAt when running', async () => {
            await repo.setStatus('r1', 'running');
            expect(prisma.run.update).toHaveBeenCalledWith(
                expect.objectContaining({ where: { id: 'r1' }, data: expect.objectContaining({ status: 'running' }) }),
            );
            const data = (prisma.run.update as jest.Mock).mock.calls[0][0].data;
            expect(data.startedAt).toBeInstanceOf(Date);
        });

        it('sets completedAt for terminal statuses', async () => {
            await repo.setStatus('r1', 'completed');
            const data = (prisma.run.update as jest.Mock).mock.calls[0][0].data;
            expect(data.completedAt).toBeInstanceOf(Date);
        });
    });

    describe('saveResumePayload', () => {
        it('writes resumePayload', async () => {
            await repo.saveResumePayload('r1', { tool_call_id: 'tc-1' });
            expect(prisma.run.update).toHaveBeenCalledWith({
                where: { id: 'r1' },
                data: { resumePayload: { tool_call_id: 'tc-1' } },
            });
        });
    });

    describe('updateLastSeq', () => {
        it('writes lastSeq', async () => {
            await repo.updateLastSeq('r1', 42);
            expect(prisma.run.update).toHaveBeenCalledWith({
                where: { id: 'r1' },
                data: { lastSeq: 42 },
            });
        });
    });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:
```bash
cd apps/server && pnpm exec jest src/ai/run/__tests__/run-state.repository.spec.ts
```
Expected: FAIL — `RunStateRepository is not defined`（模块不存在）。

- [ ] **Step 3: 实现 RunStateRepository 基础方法**

`apps/server/src/ai/run/run-state.repository.ts`：

```ts
/**
 * RunStateRepository — Run 状态的 PG 权威读写层。
 *
 * P1 权威源：所有 run 状态查询/变更经此仓储，PG 为唯一权威。
 * 进程内 RunManager 仅作 owner 执行态缓存，委托此仓储读写持久态。
 */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { RunRow } from './lease.types';

const ACTIVE_STATUSES = ['pending', 'running', 'interrupted'];

export interface CreateRunInput {
    id: string;
    threadId: string;
    status: string;
    model: string | null;
    provider: string | null;
    inputKind: string;
    content: string | null;
    requestContext: unknown;
    llmConfig: unknown;
    ownerId: string;
    leaseUntil: Date;
    traceId: string | null;
}

@Injectable()
export class RunStateRepository {
    constructor(private readonly prisma: PrismaService) {}

    findById(runId: string) {
        return this.prisma.run.findUnique({ where: { id: runId } });
    }

    findActiveRunByThread(threadId: string) {
        return this.prisma.run.findFirst({
            where: { threadId, status: { in: ACTIVE_STATUSES } },
            orderBy: { createdAt: 'desc' },
        });
    }

    async createRun(input: CreateRunInput): Promise<RunRow> {
        return this.prisma.run.create({
            data: {
                id: input.id,
                threadId: input.threadId,
                status: input.status,
                model: input.model,
                provider: input.provider,
                assistantId: 'default',
                inputKind: input.inputKind,
                content: input.content,
                requestContext: input.requestContext as never,
                llmConfig: input.llmConfig as never,
                ownerId: input.ownerId,
                leaseUntil: input.leaseUntil,
                lastSeq: 0,
                traceId: input.traceId,
            },
        });
    }

    async setStatus(runId: string, status: string): Promise<void> {
        const data: Record<string, unknown> = { status };
        if (status === 'running') data.startedAt = new Date();
        if (status === 'completed' || status === 'failed' || status === 'cancelled') {
            data.completedAt = new Date();
        }
        await this.prisma.run.update({ where: { id: runId }, data });
    }

    async saveResumePayload(runId: string, payload: unknown): Promise<void> {
        await this.prisma.run.update({
            where: { id: runId },
            data: { resumePayload: payload as never },
        });
    }

    async updateLastSeq(runId: string, lastSeq: number): Promise<void> {
        await this.prisma.run.update({ where: { id: runId }, data: { lastSeq } });
    }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run:
```bash
cd apps/server && pnpm exec jest src/ai/run/__tests__/run-state.repository.spec.ts
```
Expected: PASS（6 个 it 通过）。

- [ ] **Step 5: 提交**

```bash
git add apps/server/src/ai/run/run-state.repository.ts apps/server/src/ai/run/__tests__/run-state.repository.spec.ts
git commit -m "feat(ai): add RunStateRepository base queries (P1)"
```

---

## Task 4: RunStateRepository — acquireLease（核心租约）

**Files:**
- Modify: `apps/server/src/ai/run/run-state.repository.ts`
- Modify: `apps/server/src/ai/run/__tests__/run-state.repository.spec.ts`

- [ ] **Step 1: 追加 acquireLease 失败测试**

在 `run-state.repository.spec.ts` 的 `describe('RunStateRepository', ...)` 内追加：

```ts
    describe('acquireLease', () => {
        const now = Date.now;
        beforeEach(() => {
            // 固定 Date.now，使 leaseUntil 断言稳定
            jest.spyOn(Date, 'now').mockReturnValue(1000000);
        });
        afterEach(() => {
            (Date.now as unknown as jest.Mock).mockRestore();
        });

        it('acquires when ownerId is null', async () => {
            (prisma.run.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
            (prisma.run.findUnique as jest.Mock).mockResolvedValue({ id: 'r1', ownerId: 'A' });

            const result = await repo.acquireLease('r1', 'A');

            expect(result.acquired).toBe(true);
            if (result.acquired) expect(result.run.id).toBe('r1');
            const where = (prisma.run.updateMany as jest.Mock).mock.calls[0][0].where;
            expect(where.OR).toEqual([
                { ownerId: null },
                { ownerId: 'A' },
                { leaseUntil: { lt: expect.any(Date) } },
            ]);
        });

        it('re-acquires when same replica already owns', async () => {
            (prisma.run.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
            (prisma.run.findUnique as jest.Mock).mockResolvedValue({ id: 'r1', ownerId: 'A' });

            const result = await repo.acquireLease('r1', 'A');
            expect(result.acquired).toBe(true);
        });

        it('acquires when lease expired (other owner stale)', async () => {
            (prisma.run.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
            (prisma.run.findUnique as jest.Mock).mockResolvedValue({ id: 'r1', ownerId: 'B' });

            const result = await repo.acquireLease('r1', 'A');
            expect(result.acquired).toBe(true);
        });

        it('denies when another live owner holds lease', async () => {
            (prisma.run.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
            (prisma.run.findUnique as jest.Mock).mockResolvedValue({
                id: 'r1',
                ownerId: 'B',
                leaseUntil: new Date(2000000),
            });

            const result = await repo.acquireLease('r1', 'A');

            expect(result.acquired).toBe(false);
            if (!result.acquired) {
                expect(result.conflict?.ownerId).toBe('B');
            }
        });

        it('denies with null conflict when run missing', async () => {
            (prisma.run.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
            (prisma.run.findUnique as jest.Mock).mockResolvedValue(null);

            const result = await repo.acquireLease('missing', 'A');

            expect(result.acquired).toBe(false);
            if (!result.acquired) expect(result.conflict).toBeNull();
        });
    });
```

- [ ] **Step 2: 运行测试确认失败**

Run:
```bash
cd apps/server && pnpm exec jest src/ai/run/__tests__/run-state.repository.spec.ts -t "acquireLease"
```
Expected: FAIL — `repo.acquireLease is not a function`。

- [ ] **Step 3: 实现 acquireLease**

在 `run-state.repository.ts` 的 `RunStateRepository` class 内追加：

```ts
    async acquireLease(runId: string, replicaId: string, ttlMs = 30_000): Promise<LeaseResult> {
        const leaseUntil = new Date(Date.now() + ttlMs);
        const result = await this.prisma.run.updateMany({
            where: {
                id: runId,
                OR: [{ ownerId: null }, { ownerId: replicaId }, { leaseUntil: { lt: new Date() } }],
            },
            data: { ownerId: replicaId, leaseUntil },
        });
        if (result.count === 0) {
            const current = await this.prisma.run.findUnique({
                where: { id: runId },
                select: { ownerId: true, leaseUntil: true },
            });
            return {
                acquired: false,
                run: null,
                conflict: current ? { ownerId: current.ownerId, leaseUntil: current.leaseUntil } : null,
            };
        }
        const run = await this.prisma.run.findUnique({ where: { id: runId } });
        return { acquired: true, run, conflict: null };
    }
```

并在文件顶部 import 补充：

```ts
import type { LeaseResult, RunRow } from './lease.types';
```

（`RunRow` 已 import，仅追加 `LeaseResult`。）

- [ ] **Step 4: 运行测试确认通过**

Run:
```bash
cd apps/server && pnpm exec jest src/ai/run/__tests__/run-state.repository.spec.ts
```
Expected: PASS（全部 it，含 5 个 acquireLease 用例）。

- [ ] **Step 5: 提交**

```bash
git add apps/server/src/ai/run/run-state.repository.ts apps/server/src/ai/run/__tests__/run-state.repository.spec.ts
git commit -m "feat(ai): implement optimistic lease acquireLease (P1)"
```

---

## Task 5: RunStateRepository — releaseLease + heartbeat

**Files:**
- Modify: `apps/server/src/ai/run/run-state.repository.ts`
- Modify: `apps/server/src/ai/run/__tests__/run-state.repository.spec.ts`

- [ ] **Step 1: 追加 releaseLease / heartbeat 测试**

在 spec 的 `describe('RunStateRepository', ...)` 内追加：

```ts
    describe('releaseLease', () => {
        it('clears ownerId only when caller is owner', async () => {
            await repo.releaseLease('r1', 'A');
            expect(prisma.run.updateMany).toHaveBeenCalledWith({
                where: { id: 'r1', ownerId: 'A' },
                data: { ownerId: null, leaseUntil: null },
            });
        });
    });

    describe('heartbeat', () => {
        it('returns true when caller still owns', async () => {
            (prisma.run.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
            const alive = await repo.heartbeat('r1', 'A');
            expect(alive).toBe(true);
        });

        it('returns false when lease lost', async () => {
            (prisma.run.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
            const alive = await repo.heartbeat('r1', 'A');
            expect(alive).toBe(false);
        });
    });
```

- [ ] **Step 2: 运行确认失败**

Run:
```bash
cd apps/server && pnpm exec jest src/ai/run/__tests__/run-state.repository.spec.ts -t "releaseLease|heartbeat"
```
Expected: FAIL — 方法不存在。

- [ ] **Step 3: 实现 releaseLease + heartbeat**

在 `RunStateRepository` class 内追加：

```ts
    async releaseLease(runId: string, replicaId: string): Promise<void> {
        await this.prisma.run.updateMany({
            where: { id: runId, ownerId: replicaId },
            data: { ownerId: null, leaseUntil: null },
        });
    }

    async heartbeat(runId: string, replicaId: string, ttlMs = 30_000): Promise<boolean> {
        const result = await this.prisma.run.updateMany({
            where: { id: runId, ownerId: replicaId },
            data: { leaseUntil: new Date(Date.now() + ttlMs) },
        });
        return result.count > 0;
    }
```

- [ ] **Step 4: 运行确认通过**

Run:
```bash
cd apps/server && pnpm exec jest src/ai/run/__tests__/run-state.repository.spec.ts
```
Expected: PASS（全部）。

- [ ] **Step 5: 提交**

```bash
git add apps/server/src/ai/run/run-state.repository.ts apps/server/src/ai/run/__tests__/run-state.repository.spec.ts
git commit -m "feat(ai): implement releaseLease and heartbeat (P1)"
```

---

## Task 6: RunManager 重构为 owner 缓存 + 委托 PG

**Files:**
- Modify: `apps/server/src/ai/run/run-manager.ts`
- Modify: `apps/server/src/ai/run/__tests__/run-manager.spec.ts`

**目标：** `createRun` 持久化新权威字段（委托 `RunStateRepository`），`getActiveRunForThread` 委托查 PG（返回 RunRow 而非 RunRecord），新增 `adoptRun`（resume 时把重建的 RunRecord 注入内存缓存并标记本副本为 owner）。

- [ ] **Step 1: 改 run-manager.spec.ts，注入 RunStateRepository mock 并更新断言**

替换 `apps/server/src/ai/run/__tests__/run-manager.spec.ts` 顶部的 mock 工厂与 beforeEach，并在相关 describe 内更新：

```ts
import type { BaseCheckpointSaver } from '@langchain/langgraph-checkpoint';
import type { PrismaService } from '../../../prisma/prisma.service';
import type { RunEventStore } from '../../store/run-event-store';
import { RunStatus } from '../../types/run.types';
import type { RunContext } from '../run-context';
import { RunManager } from '../run-manager';
import { type RunExecutionSnapshot, RunRecord } from '../run-record';
import type { RunStateRepository } from '../run-state.repository';

function createMockRunContext(overrides?: {
    eventStore?: { append: jest.Mock };
    checkpointer?: { type: string };
}): RunContext {
    const mockES = overrides?.eventStore ?? { append: jest.fn().mockResolvedValue({}) };
    const mockCP = overrides?.checkpointer ?? { type: 'memory' };
    return {
        checkpointer: mockCP as unknown as BaseCheckpointSaver,
        eventStore: mockES as unknown as RunEventStore,
        llmConfig: { provider: 'zhipu', model: 'glm-5' },
    } as RunContext;
}

/** mock RunStateRepository — 持久化用 */
function createMockRunStateRepo(): {
    repo: RunStateRepository;
    store: Map<string, Record<string, unknown>>;
} {
    const store = new Map<string, Record<string, unknown>>();
    const repo = {
        findById: jest.fn(async (id: string) => store.get(id) ?? null),
        findActiveRunByThread: jest.fn(async (threadId: string) => {
            for (const row of store.values()) {
                if (row.threadId === threadId && ['pending', 'running', 'interrupted'].includes(row.status as string)) {
                    return row;
                }
            }
            return null;
        }),
        createRun: jest.fn(async (input: Record<string, unknown>) => {
            const row = { ...input, lastSeq: 0 };
            store.set(input.id as string, row);
            return row;
        }),
        setStatus: jest.fn(async (id: string, status: string) => {
            const row = store.get(id);
            if (row) row.status = status;
        }),
        acquireLease: jest.fn(async () => ({ acquired: true })),
        releaseLease: jest.fn(),
        heartbeat: jest.fn(async () => true),
        saveResumePayload: jest.fn(),
        updateLastSeq: jest.fn(),
    } as unknown as RunStateRepository;
    return { repo, store };
}

describe('RunManager', () => {
    let manager: RunManager;
    let runStateRepo: RunStateRepository;

    beforeEach(() => {
        const { repo } = createMockRunStateRepo();
        runStateRepo = repo;
        manager = new RunManager(runStateRepo);
    });

    describe('createRun', () => {
        it('creates a run and persists authoritative fields via repo', async () => {
            const ctx = createMockRunContext();
            const snapshot = { content: 'Hello' };

            const run = await manager.createRun('thread-1', ctx, snapshot, { replicaId: 'A' });

            expect(run).toBeDefined();
            expect(run.threadId).toBe('thread-1');
            expect(run.status).toBe(RunStatus.Pending);
            expect(runStateRepo.createRun).toHaveBeenCalledWith(
                expect.objectContaining({
                    threadId: 'thread-1',
                    ownerId: 'A',
                    inputKind: 'message',
                    content: 'Hello',
                }),
            );
        });

        it('tracks the run by ID in memory cache', async () => {
            const ctx = createMockRunContext();
            const run = await manager.createRun('thread-1', ctx, { content: 'test' }, { replicaId: 'A' });
            expect(manager.getRun(run.id)).toBe(run);
        });

        it('returns undefined for unknown run ID', () => {
            expect(manager.getRun('nonexistent')).toBeUndefined();
        });
    });

    describe('getActiveRunByThread (delegated to PG)', () => {
        it('returns the active RunRow from repository', async () => {
            const ctx = createMockRunContext();
            await manager.createRun('thread-1', ctx, { content: 'test' }, { replicaId: 'A' });

            const active = await manager.getActiveRunByThread('thread-1');
            expect(active?.threadId).toBe('thread-1');
            expect(runStateRepo.findActiveRunByThread).toHaveBeenCalledWith('thread-1');
        });

        it('returns null when no active run', async () => {
            expect(await manager.getActiveRunByThread('none')).toBeNull();
        });
    });

    describe('adoptRun', () => {
        it('injects a rebuilt record into memory cache (resume path)', () => {
            const ctx = createMockRunContext();
            const record = new RunRecord({
                id: 'recovered-1',
                threadId: 'thread-1',
                runContext: ctx,
                snapshot: { content: '' },
            });
            manager.adoptRun(record);
            expect(manager.getRun('recovered-1')).toBe(record);
        });
    });

    describe('cancelRun', () => {
        it('cancels an in-memory run owned by this process', async () => {
            const ctx = createMockRunContext();
            const run = await manager.createRun('thread-1', ctx, { content: 'test' }, { replicaId: 'A' });
            await manager.cancelRun(run.id);
            expect(run.status).toBe(RunStatus.Cancelled);
        });

        it('does nothing for unknown run ID', async () => {
            await expect(manager.cancelRun('nonexistent')).resolves.not.toThrow();
        });
    });

    describe('cleanup', () => {
        it('removes completed/failed/cancelled runs from memory cache', async () => {
            const ctx = createMockRunContext();
            const r1 = await manager.createRun('t1', ctx, { content: 'a' }, { replicaId: 'A' });
            const r2 = await manager.createRun('t2', ctx, { content: 'b' }, { replicaId: 'A' });
            r1.setStatus(RunStatus.Completed);
            r2.setStatus(RunStatus.Running);
            manager.cleanup();
            expect(manager.getRun(r1.id)).toBeUndefined();
            expect(manager.getRun(r2.id)).toBe(r2);
        });
    });
});
```

- [ ] **Step 2: 运行确认失败**

Run:
```bash
cd apps/server && pnpm exec jest src/ai/run/__tests__/run-manager.spec.ts
```
Expected: FAIL — `RunManager` 构造签名不匹配（当前注入 PrismaService，新设计注入 RunStateRepository）。

- [ ] **Step 3: 重写 RunManager**

替换 `apps/server/src/ai/run/run-manager.ts` 全文：

```ts
/**
 * RunManager — owner 副本的执行态缓存 + 委托 PG 权威。
 *
 * P1 重构后职责：
 * - 内存缓存 Map<string, RunRecord> 仅是 owner 副本的执行态（abortController/graphIterator）
 * - run 状态/租约/查询的权威读写委托 RunStateRepository（PG）
 * - getActiveRunByThread 委托 PG，返回 RunRow（非 RunRecord）
 * - adoptRun: resume 时把从 RunRow 重建的 RunRecord 注入内存，标记本副本为 owner
 *
 * 缓存可随时丢弃，重建只需读 PG + checkpoint。
 */
import { Injectable, Logger } from '@nestjs/common';
import { RunStatus } from '../types/run.types';
import type { RunContext } from './run-context';
import { type RunExecutionSnapshot, RunRecord } from './run-record';
import type { LeaseResult, RunRow } from './lease.types';
import { RunStateRepository } from './run-state.repository';

const ACTIVE_STATUSES: RunStatus[] = [RunStatus.Pending, RunStatus.Running, RunStatus.Interrupted];

export interface CreateRunOpts {
    /** 抢占租约的副本 ID（owner） */
    replicaId: string;
    /** 运行 traceId（可选，写入 Run.traceId） */
    traceId?: string | null;
}

@Injectable()
export class RunManager {
    private readonly logger = new Logger(RunManager.name);
    /** owner 执行态缓存：runId → RunRecord（仅 owner 副本持有） */
    private readonly runs = new Map<string, RunRecord>();

    constructor(private readonly runStateRepo: RunStateRepository) {}

    /**
     * 创建新 RunRecord（内存）并委托 RunStateRepository 持久化权威字段。
     */
    async createRun(
        threadId: string,
        runContext: RunContext,
        snapshot: RunExecutionSnapshot,
        opts: CreateRunOpts,
    ): Promise<RunRecord> {
        const id = crypto.randomUUID();
        const record = new RunRecord({ id, threadId, runContext, snapshot });

        this.runs.set(id, record);

        try {
            await this.runStateRepo.createRun({
                id,
                threadId,
                status: RunStatus.Pending,
                model: runContext.llmConfig.model ?? null,
                provider: runContext.llmConfig.provider ?? null,
                inputKind: 'message',
                content: snapshot.content,
                requestContext: snapshot.requestContext ?? null,
                llmConfig: runContext.llmConfig,
                ownerId: opts.replicaId,
                leaseUntil: new Date(Date.now() + 30_000),
                traceId: opts.traceId ?? null,
            });
        } catch (err) {
            this.logger.error(`Failed to persist Run ${id}: ${(err as Error).message}`);
        }

        this.logger.log(`Run created: ${id} for thread: ${threadId}`);
        return record;
    }

    /**
     * resume 路径：把从 RunRow 重建的 RunRecord 注入内存缓存。
     * 调用方需先 acquireLease 成功。
     */
    adoptRun(record: RunRecord): void {
        this.runs.set(record.id, record);
    }

    /** 更新 run 状态（内存缓存 + PG 权威） */
    async setStatus(runId: string, status: RunStatus): Promise<void> {
        const record = this.runs.get(runId);
        if (record) record.setStatus(status);
        try {
            await this.runStateRepo.setStatus(runId, status);
        } catch (err) {
            this.logger.error(`Failed to update Run ${runId} status: ${(err as Error).message}`);
        }
    }

    /** 完成 run，写入最终 token 用量（PG）。tokenUsage 未传则从内存 record.finalize() 取。 */
    async finalize(
        runId: string,
        tokenUsage?: { promptTokens: number; completionTokens: number; totalTokens: number },
    ): Promise<void> {
        const record = this.runs.get(runId);
        const usage =
            tokenUsage ??
            (record ? record.finalize() : { promptTokens: 0, completionTokens: 0, totalTokens: 0 });
        try {
            await this.runStateRepo.updateTokenUsage(runId, usage);
        } catch (err) {
            this.logger.error(`Failed to finalize Run ${runId}: ${(err as Error).message}`);
        }
    }

    /** 内存缓存查找（owner 执行态） */
    getRun(runId: string): RunRecord | undefined {
        return this.runs.get(runId);
    }

    /** 委托 PG 查找 thread 的活跃 run（权威） */
    async getActiveRunByThread(threadId: string): Promise<RunRow | null> {
        return this.runStateRepo.findActiveRunByThread(threadId);
    }

    /** 委托 PG 租约抢占 */
    async acquireLease(runId: string, replicaId: string): Promise<LeaseResult> {
        return this.runStateRepo.acquireLease(runId, replicaId);
    }

    /** 委托 PG 释放租约 */
    async releaseLease(runId: string, replicaId: string): Promise<void> {
        return this.runStateRepo.releaseLease(runId, replicaId);
    }

    /** 取消 owner 本副本内存中的 run（P1：跨副本 cancel 留 P3） */
    async cancelRun(runId: string): Promise<void> {
        const run = this.runs.get(runId);
        if (run) {
            run.abort();
            await this.setStatus(runId, RunStatus.Cancelled);
            this.logger.log(`Run cancelled: ${runId}`);
        }
    }

    /** 释放非活跃 run 的内存缓存（PG 记录保留） */
    cleanup(): void {
        for (const [id, run] of this.runs.entries()) {
            if (!ACTIVE_STATUSES.includes(run.status)) {
                this.runs.delete(id);
            }
        }
    }
}
```

> **注意：** 上面用到了 `runStateRepo.updateTokenUsage`，需在 `RunStateRepository` 补充该方法（Task 3 未含）。下一步补。

- [ ] **Step 4: 在 RunStateRepository 补 updateTokenUsage**

在 `run-state.repository.ts` 的 `RunStateRepository` class 内追加：

```ts
    async updateTokenUsage(
        runId: string,
        usage: { promptTokens: number; completionTokens: number; totalTokens: number },
    ): Promise<void> {
        await this.prisma.run.update({ where: { id: runId }, data: usage });
    }
```

并在 `run-state.repository.spec.ts` 补一个测试（`describe('updateTokenUsage', ...)`）：

```ts
    describe('updateTokenUsage', () => {
        it('writes token counts', async () => {
            await repo.updateTokenUsage('r1', { promptTokens: 10, completionTokens: 20, totalTokens: 30 });
            expect(prisma.run.update).toHaveBeenCalledWith({
                where: { id: 'r1' },
                data: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
            });
        });
    });
```

- [ ] **Step 5: 运行 RunManager + Repository 测试确认通过**

Run:
```bash
cd apps/server && pnpm exec jest src/ai/run/__tests__/run-manager.spec.ts src/ai/run/__tests__/run-state.repository.spec.ts
```
Expected: PASS（两文件全绿）。

- [ ] **Step 6: 提交**

```bash
git add apps/server/src/ai/run/run-manager.ts apps/server/src/ai/run/__tests__/run-manager.spec.ts apps/server/src/ai/run/run-state.repository.ts apps/server/src/ai/run/__tests__/run-state.repository.spec.ts
git commit -m "refactor(ai): RunManager delegates to PG via RunStateRepository (P1)"
```

---

## Task 7: RunRecord — lastSeq 锚定

**Files:**
- Modify: `apps/server/src/ai/run/run-record.ts`
- Modify: `apps/server/src/ai/run/__tests__/run-record.spec.ts`

- [ ] **Step 1: 追加 lastSeq 失败测试**

在 `apps/server/src/ai/run/__tests__/run-record.spec.ts` 的顶层 `describe('RunRecord', ...)` 内追加（该文件顶部已有 `createMockRunContext` 工厂，直接复用，无需新增）：

```ts
    describe('lastSeq anchoring', () => {
        it('defaults seq to 0 for a new run', () => {
            const record = new RunRecord({
                id: 'r1',
                threadId: 't1',
                runContext: createMockRunContext(),
                snapshot: { content: 'hi' },
            });
            expect(record.currentSeq).toBe(0);
        });

        it('starts seq from provided lastSeq (resume path)', () => {
            const record = new RunRecord({
                id: 'r1',
                threadId: 't1',
                runContext: createMockRunContext(),
                snapshot: { content: '' },
                lastSeq: 41,
            });
            expect(record.currentSeq).toBe(41);
        });

        it('setLastSeq resets the seq counter', () => {
            const record = new RunRecord({
                id: 'r1',
                threadId: 't1',
                runContext: createMockRunContext(),
                snapshot: { content: '' },
            });
            record.setLastSeq(99);
            expect(record.currentSeq).toBe(99);
        });
    });
```

- [ ] **Step 2: 运行确认失败**

Run:
```bash
cd apps/server && pnpm exec jest src/ai/run/__tests__/run-record.spec.ts -t "lastSeq"
```
Expected: FAIL — `currentSeq`/`setLastSeq`/`lastSeq` 选项不存在。

- [ ] **Step 3: 修改 RunRecord 支持 lastSeq**

编辑 `apps/server/src/ai/run/run-record.ts`：

3a. 在 `RunRecordOpts` interface 加可选字段：

```ts
export interface RunRecordOpts {
    id: string;
    threadId: string;
    runContext: RunContext;
    snapshot: RunExecutionSnapshot;
    /** seq 起点（resume 时从 Run.lastSeq 恢复，默认 0） */
    lastSeq?: number;
}
```

3b. 把 `private seq = 0;` 改为：

```ts
    private seq: number;
```

3c. 构造函数末尾赋值（在 `this.abortSignal = this.abortController.signal;` 之后）：

```ts
        this.seq = opts.lastSeq ?? 0;
```

3d. 新增 getter/setter（放在 `get pendingResume` 附近）：

```ts
    /** 当前已分配的最大 seq（执行结束回写 Run.lastSeq） */
    get currentSeq(): number {
        return this.seq;
    }

    /** 重置 seq 起点（resume 路径从 RunRow.lastSeq 锚定） */
    setLastSeq(seq: number): void {
        this.seq = seq;
    }
```

- [ ] **Step 4: 运行确认通过**

Run:
```bash
cd apps/server && pnpm exec jest src/ai/run/__tests__/run-record.spec.ts
```
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add apps/server/src/ai/run/run-record.ts apps/server/src/ai/run/__tests__/run-record.spec.ts
git commit -m "feat(ai): anchor RunRecord.seq on lastSeq for cross-owner continuity (P1)"
```

---

## Task 8: AiChatService.resumeFromCommand 进程外 resume

**Files:**
- Modify: `apps/server/src/ai/ai.service.ts`
- Modify: `apps/server/src/ai/__tests__/ai.service.spec.ts`

**目标：** `resumeFromCommand` 改为「查 PG → acquireLease → saveResumePayload → 从 RunRow 重建 RunContext/RunRecord → adoptRun → setStatus(running)」，不再依赖内存里已有 RunRecord。

- [ ] **Step 1: 改 ai.service.spec.ts，注入 RunStateRepository + REPLICA_ID mock，重写 resume 测试块**

1a. 在 `ai.service.spec.ts` 顶部 import 区追加：

```ts
import type { RunStateRepository } from '../run/run-state.repository';
import { REPLICA_ID } from '../run/replica-id';
```

1b. 在 `beforeEach` 内（`mockRunManager` 定义之后、`Test.createTestingModule` 之前）新增 mock 仓储：

```ts
        // P1: mock RunStateRepository — resume 路径的 PG 权威源
        const mockRunStateRepo = {
            findActiveRunByThread: jest.fn(),
            acquireLease: jest.fn(),
            saveResumePayload: jest.fn(),
            setStatus: jest.fn(),
            updateLastSeq: jest.fn(),
            releaseLease: jest.fn(),
            heartbeat: jest.fn().mockResolvedValue(true),
            findById: jest.fn(),
        };
```

1c. 在 `Test.createTestingModule` 的 `providers` 数组内追加：

```ts
                { provide: RunStateRepository, useValue: mockRunStateRepo },
                { provide: REPLICA_ID, useValue: 'replica-test' },
```

1d. 在 `beforeEach` 末尾把 `mockRunStateRepo` 暴露到测试作用域（在 `service = module.get(...)` 附近）：

```ts
        (service as unknown as { __runStateRepo: unknown }).__runStateRepo = mockRunStateRepo;
```

1e. 替换 `describe('resumeFromCommand', ...)` 整块为：

```ts
    describe('resumeFromCommand', () => {
        function getRepo() {
            return (service as unknown as { __runStateRepo: Record<string, jest.Mock> }).__runStateRepo;
        }

        it('should throw NotFoundException when no active run for thread', async () => {
            getRepo().findActiveRunByThread.mockResolvedValue(null);
            await expect(
                service.resumeFromCommand('nonexistent-thread', { resume: { foo: 'bar' } }),
            ).rejects.toThrow(NotFoundException);
        });

        it('should throw ConflictException when run is not interrupted', async () => {
            getRepo().findActiveRunByThread.mockResolvedValue({
                id: 'r1',
                threadId: 'thread-1',
                status: 'running',
                ownerId: 'replica-test',
            });
            await expect(
                service.resumeFromCommand('thread-1', { resume: { ok: true } }),
            ).rejects.toThrow(ConflictException);
        });

        it('should throw ConflictException when lease cannot be acquired (busy)', async () => {
            getRepo().findActiveRunByThread.mockResolvedValue({
                id: 'r1',
                threadId: 'thread-1',
                status: 'interrupted',
                ownerId: 'replica-B',
            });
            getRepo().acquireLease.mockResolvedValue({
                acquired: false,
                conflict: { ownerId: 'replica-B', leaseUntil: new Date() },
            });
            await expect(
                service.resumeFromCommand('thread-1', { resume: { tool_call_id: 'tc-1' } }),
            ).rejects.toThrow(ConflictException);
            expect(getRepo().saveResumePayload).not.toHaveBeenCalled();
        });

        it('should rebuild RunRecord from RunRow, adopt it, and set Running on success', async () => {
            getRepo().findActiveRunByThread.mockResolvedValue({
                id: 'r1',
                threadId: 'thread-1',
                status: 'interrupted',
                ownerId: null,
                content: 'prior user msg',
                requestContext: { selectedText: 'x' },
                llmConfig: { provider: 'zhipu', model: 'glm-5' },
                lastSeq: 7,
            });
            getRepo().acquireLease.mockResolvedValue({
                acquired: true,
                run: { id: 'r1' },
                conflict: null,
            });

            const resumed = await service.resumeFromCommand('thread-1', {
                resume: { tool_call_id: 'tc-1', tool_result: 'ok' },
            });

            expect(getRepo().saveResumePayload).toHaveBeenCalledWith('r1', {
                tool_call_id: 'tc-1',
                tool_result: 'ok',
            });
            expect(getRepo().setStatus).toHaveBeenCalledWith('r1', 'running');
            expect(resumed.id).toBe('r1');
            expect(resumed.status).toBe(RunStatus.Running);
            expect(resumed.isResume).toBe(true);
            expect(resumed.currentSeq).toBe(7); // lastSeq anchored from RunRow
        });
    });
```

- [ ] **Step 2: 运行确认失败**

Run:
```bash
cd apps/server && pnpm exec jest src/ai/ai.service.spec.ts -t "resumeFromCommand"
```
Expected: FAIL — `resumeFromCommand` 仍走旧内存路径（`runManager.getActiveRunForThread`），与新 mock 不匹配，或 `REPLICA_ID`/`RunStateRepository` 注入缺失导致 DI 报错。

- [ ] **Step 3: 重写 ai.service.ts 的 resumeFromCommand + 构造注入**

3a. 顶部 import 追加：

```ts
import { Inject, Injectable } from '@nestjs/common';
```
（若已有 `Injectable` 则只追加 `Inject`）。

```ts
import { REPLICA_ID } from './run/replica-id';
import type { LeaseResult } from './run/lease.types';
import { RunStateRepository } from './run/run-state.repository';
```

3b. 构造函数注入新依赖（在现有构造参数末尾追加）：

```ts
    constructor(
        private readonly threadService: ThreadService,
        private readonly runManager: RunManager,
        private readonly runContextFactory: RunContextFactory,
        private readonly providerRegistry: ProviderRegistry,
        private readonly llmFactory: LLMFactory,
        private readonly _checkpointReader: CheckpointReaderService,
        private readonly runStateRepo: RunStateRepository,
        @Inject(REPLICA_ID) private readonly replicaId: string,
    ) {
        void this._checkpointReader;
    }
```

3c. 替换 `resumeFromCommand` 方法全文为：

```ts
    /**
     * 进程外 resume：任意副本可恢复一个 interrupted run。
     *
     * 流程：查 PG active run → 校验 interrupted → acquireLease 抢占 →
     * saveResumePayload → 从 RunRow 重建 RunContext/RunRecord → adoptRun → setStatus(running)。
     * 不依赖内存里已有 RunRecord。
     */
    async resumeFromCommand(
        threadId: string,
        command: { resume?: unknown },
    ): Promise<RunRecord> {
        const runRow = await this.runStateRepo.findActiveRunByThread(threadId);
        if (!runRow) {
            throw new NotFoundException(`No active run for thread: ${threadId}`);
        }
        if (runRow.status !== RunStatus.Interrupted) {
            throw new ConflictException(
                `Run ${runRow.id} is not interrupted (status: ${runRow.status})`,
            );
        }

        const lease: LeaseResult = await this.runStateRepo.acquireLease(runRow.id, this.replicaId);
        if (!lease.acquired) {
            throw new ConflictException(
                `Run ${runRow.id} is busy (owner: ${lease.conflict?.ownerId ?? 'unknown'})`,
            );
        }

        this.logger.log(`Run ${runRow.id} resumed by replica ${this.replicaId}`);

        await this.runStateRepo.saveResumePayload(runRow.id, command.resume);

        // 从 RunRow 重建 RunContext（llmConfig 快照）+ RunRecord（lastSeq 锚定）
        const llmConfig =
            (runRow.llmConfig as LLMConfig | null) ?? this.resolveDefaultLlmConfig();
        const runContext = await this.runContextFactory.create({ llmConfig });
        const record = new RunRecord({
            id: runRow.id,
            threadId,
            runContext,
            snapshot: {
                content: runRow.content ?? '',
                requestContext: (runRow.requestContext as Record<string, unknown> | null) ?? undefined,
            },
            lastSeq: runRow.lastSeq,
        });
        record.setResumePayload(command.resume);

        this.runManager.adoptRun(record);
        await this.runStateRepo.setStatus(record.id, RunStatus.Running);
        record.setStatus(RunStatus.Running);
        return record;
    }
```

3d. 新增私有 helper `resolveDefaultLlmConfig`（在 `resolveLlmConfig` 附近）：

```ts
    /** 返回 provider 注册的默认 LLMConfig（resume 时 RunRow.llmConfig 缺失的兜底） */
    private resolveDefaultLlmConfig(): LLMConfig {
        const cfg = this.providerRegistry.defaultConfig;
        if (!cfg) throw new Error('No LLM provider configured');
        return cfg;
    }
```

- [ ] **Step 4: 运行 resume 测试确认通过**

Run:
```bash
cd apps/server && pnpm exec jest src/ai/ai.service.spec.ts -t "resumeFromCommand"
```
Expected: PASS（4 个用例）。

- [ ] **Step 5: 提交**

```bash
git add apps/server/src/ai/ai.service.ts apps/server/src/ai/__tests__/ai.service.spec.ts
git commit -m "feat(ai): out-of-process resume via PG lease + RunRow rebuild (P1)"
```

---

## Task 9: startRun 并发控制适配（查 PG + replicaId）

**Files:**
- Modify: `apps/server/src/ai/ai.service.ts`
- Modify: `apps/server/src/ai/__tests__/ai.service.spec.ts`

**目标：** `startRun` 用 `runManager.getActiveRunByThread`（现返回 PG RunRow）做并发检查；`handleConcurrency` 适配 RunRow + replicaId。P1 约束：跨副本 interrupt 退化为 reject+warn（无法 abort 别副本内存 run）。

- [ ] **Step 1: 改 ai.service.spec.ts 的 multitask 测试块，mock 改为 RunRow**

在 `ai.service.spec.ts` 的 `beforeEach` 内，把 functional mock RunManager 的 `getActiveRunForThread` 替换为返回 RunRow 的异步版本，并在 `createRun` mock 里持久化 ownerId。替换现有 `mockRunManager` 内相关方法：

```ts
        // Functional mock RunManager — P1: getActiveRunByThread 返回 PG RunRow
        const runStore = new Map<string, { record: RunRecord; row: Record<string, unknown> }>();
        const mockRunManager = {
            createRun: jest.fn().mockImplementation(
                async (threadId: string, runContext: RunContext, snapshot: any, opts: any) => {
                    const record = new RunRecord({
                        id: `run-${runStore.size + 1}`,
                        threadId,
                        runContext,
                        snapshot,
                    });
                    const row = {
                        id: record.id,
                        threadId,
                        status: 'pending',
                        ownerId: opts?.replicaId ?? 'replica-test',
                    };
                    runStore.set(record.id, { record, row });
                    return record;
                },
            ),
            setStatus: jest.fn().mockImplementation(async (_runId: string, status: RunStatus) => {
                const entry = [...runStore.values()].find(e => e.record.id === _runId);
                if (entry) {
                    entry.record.setStatus(status);
                    entry.row.status = status;
                }
            }),
            adoptRun: jest.fn().mockImplementation((record: RunRecord) => {
                runStore.set(record.id, { record, row: { id: record.id, threadId: record.threadId, status: 'running' } });
            }),
            finalize: jest.fn(),
            getRun: jest.fn().mockImplementation((id: string) => runStore.get(id)?.record),
            getActiveRunByThread: jest.fn().mockImplementation(async (threadId: string) => {
                for (const { record, row } of runStore.values()) {
                    if (
                        record.threadId === threadId &&
                        ['pending', 'running', 'interrupted'].includes(record.status)
                    ) {
                        return row;
                    }
                }
                return null;
            }),
            acquireLease: jest.fn(),
            releaseLease: jest.fn(),
            cancelRun: jest.fn().mockImplementation(async (id: string) => {
                const entry = runStore.get(id);
                if (entry) entry.record.abort();
            }),
            cleanup: jest.fn(),
        };
```

> 同时 mock `RunStateRepository`（Task 8 已加）需让 `findActiveRunByThread` 在 startRun 不被直接调用——startRun 经 `runManager.getActiveRunByThread`。保持 mockRunStateRepo 不变即可。

更新 multitask 测试块中对 `getActiveRunForThread` 的同步调用为 `await`：

```ts
        it('should reject when active run exists and strategy is "reject"', async () => {
            await service.startRun({ content: 'First', threadId: 't1' });
            const active = await runManager.getActiveRunByThread('t1');
            if (active) {
                await runManager.setStatus('run-1', RunStatus.Running);
            }

            await expect(
                service.startRun({ content: 'Second', threadId: 't1', multitaskStrategy: 'reject' }),
            ).rejects.toThrow(ConflictException);
        });
```

对其余 multitask 用例（default reject、enqueue warn、interrupt abort）做同样改动：`getActiveRunForThread` → `await runManager.getActiveRunByThread(...)`，并用 `runManager.setStatus(record.id, RunStatus.Running)` 设 running 态。`interrupt` 用例保持 `jest.spyOn(r1, 'abort')` 断言（r1 来自 startRun 返回值，owner=replica-test，同副本可 abort）。

- [ ] **Step 2: 运行确认失败**

Run:
```bash
cd apps/server && pnpm exec jest src/ai/ai.service.spec.ts -t "multitask_strategy"
```
Expected: FAIL — `startRun` 仍调同步 `getActiveRunForThread` 返回 RunRecord。

- [ ] **Step 3: 适配 ai.service.ts 的 startRun + handleConcurrency**

3a. `startRun` 内的并发检查块：

把
```ts
        const activeRun = this.runManager.getActiveRunForThread(thread.id);
        if (activeRun) {
            await this.handleConcurrency(activeRun, multitaskStrategy);
        }
```
改为：
```ts
        const activeRow = await this.runManager.getActiveRunByThread(thread.id);
        if (activeRow) {
            await this.handleConcurrency(activeRow, multitaskStrategy);
        }
```

3b. `createRun` 调用补 replicaId（`startRun` 内）：

把
```ts
        const record = await this.runManager.createRun(thread.id, runContext, {
            content,
            requestContext: opts.context,
        });
```
改为：
```ts
        const record = await this.runManager.createRun(
            thread.id,
            runContext,
            { content, requestContext: opts.context },
            { replicaId: this.replicaId },
        );
```

3c. 替换 `handleConcurrency` 全文为（接收 RunRow）：

```ts
    /**
     * 并发控制（P1）。
     *
     * - reject: 409
     * - interrupt: 仅当 active run 由本副本持有（内存可 abort）时生效；
     *   跨副本无法 abort，退化为 reject + warn（完整跨副本 interrupt 留 P3）
     * - rollback: 同 interrupt（checkpoint 回滚留 P3）
     * - enqueue: 未实现，reject + warn
     */
    private async handleConcurrency(
        activeRow: { id: string; ownerId: string | null },
        strategy: MultitaskStrategy,
    ): Promise<void> {
        switch (strategy) {
            case 'reject':
                throw new ConflictException('Run already in progress for this thread');

            case 'interrupt':
            case 'rollback': {
                if (activeRow.ownerId === this.replicaId) {
                    const record = this.runManager.getRun(activeRow.id);
                    if (record) {
                        record.abort();
                        await new Promise(resolve => setTimeout(resolve, 100));
                        break;
                    }
                }
                this.logger.warn(
                    `multitask_strategy '${strategy}' cannot abort cross-replica run ${activeRow.id} (owner: ${activeRow.ownerId}); falling back to 'reject'`,
                );
                throw new ConflictException('Run already in progress for this thread');
            }

            case 'enqueue':
                this.logger.warn(
                    `multitask_strategy 'enqueue' not yet supported, falling back to 'reject'`,
                );
                throw new ConflictException('Run already in progress for this thread');
        }
    }
```

- [ ] **Step 4: 运行 multitask + 全部 ai.service 测试**

Run:
```bash
cd apps/server && pnpm exec jest src/ai/ai.service.spec.ts
```
Expected: PASS（startRun / multitask / resume / executeRunProtocol / cancel 全绿）。

> 若 `executeRunProtocol` 测试因 `createRun` 新签名报错（snapshot opts 变化），确认 mock `createRun` 已接受第 4 参 `opts`（Step 1 已加）。若 `cancel` 测试因 `runManager.getRun` 返回值变化失败，确认 mock `getRun` 返回 record。

- [ ] **Step 5: 提交**

```bash
git add apps/server/src/ai/ai.service.ts apps/server/src/ai/__tests__/ai.service.spec.ts
git commit -m "refactor(ai): startRun concurrency check queries PG; cross-replica interrupt degrades (P1)"
```

---

## Task 10: executeRunProtocol — heartbeat + lastSeq 回写

**Files:**
- Modify: `apps/server/src/ai/ai.service.ts`
- Modify: `apps/server/src/ai/__tests__/ai.service.spec.ts`

**目标：** 执行期间每 10s heartbeat 续租约（丢失则 abort）；执行结束 flushRun 后回写 `Run.lastSeq`。终态时释放租约（completed/failed/cancelled）。

- [ ] **Step 1: 在 ai.service.spec.ts 补 heartbeat 与 lastSeq 断言**

在 `describe('executeRunProtocol', ...)` 末尾追加：

```ts
        it('should heartbeat during execution and write lastSeq on completion', async () => {
            const record = await service.startRun({ content: 'Hi', threadId: 't1' });
            const capture = createEventCapture();
            record.setSseWriter(capture.sseWriter);

            await service.executeRunProtocol(record);

            const repo = (service as unknown as { __runStateRepo: Record<string, jest.Mock> }).__runStateRepo;
            expect(repo.heartbeat).toHaveBeenCalled();
            expect(repo.updateLastSeq).toHaveBeenCalledWith(record.id, expect.any(Number));
        });
```

- [ ] **Step 2: 运行确认失败**

Run:
```bash
cd apps/server && pnpm exec jest src/ai/ai.service.spec.ts -t "heartbeat during execution"
```
Expected: FAIL — `heartbeat`/`updateLastSeq` 未被调用。

- [ ] **Step 3: 在 executeRunProtocol 加 heartbeat + lastSeq 回写 + 释放租约**

3a. 在 `executeRunProtocol` 的 `await otelContext.with(langgraphCtx, async () => {...})` 之前，启动 heartbeat：

```ts
        const heartbeatTimer = setInterval(async () => {
            try {
                const alive = await this.runStateRepo.heartbeat(record.id, this.replicaId);
                if (!alive) {
                    this.logger.warn(`Lost lease for run ${record.id}, aborting`);
                    record.abort();
                }
            } catch (err) {
                this.logger.warn(`heartbeat error: ${(err as Error).message}`);
            }
        }, 10_000);
```

3b. 在 `finally` 块内（`langgraphSpan.end();` 之前）追加清理：

```ts
            clearInterval(heartbeatTimer);
            await this.runStateRepo.updateLastSeq(record.id, record.currentSeq);
            try {
                await this.runStateRepo.releaseLease(record.id, this.replicaId);
            } catch (err) {
                this.logger.warn(`releaseLease error: ${(err as Error).message}`);
            }
```

> 注意：`finally` 当前内容是 `langgraphSpan.end(); await this.runManager.finalize(record.id); await record.runContext.eventStore.flushRun(record.id);`。`finalize` 的 `tokenUsage` 参数在 Task 6 中已改为可选（未传则从内存 record 取），所以现有 `await this.runManager.finalize(record.id)` 调用无需改动。把新增的三行（clearInterval 已在前面；updateLastSeq/releaseLease）插入到 `flushRun` 之后保证事件已落盘。最终 finally 顺序：
> ```ts
> } finally {
>     clearInterval(heartbeatTimer);
>     langgraphSpan.end();
>     await this.runManager.finalize(record.id);
>     await record.runContext.eventStore.flushRun(record.id);
>     await this.runStateRepo.updateLastSeq(record.id, record.currentSeq);
>     try {
>         await this.runStateRepo.releaseLease(record.id, this.replicaId);
>     } catch (err) {
>         this.logger.warn(`releaseLease error: ${(err as Error).message}`);
>     }
> }
> ```

- [ ] **Step 4: 运行全部 ai.service 测试**

Run:
```bash
cd apps/server && pnpm exec jest src/ai/ai.service.spec.ts
```
Expected: PASS（含新 heartbeat/lastSeq 用例）。

- [ ] **Step 5: 提交**

```bash
git add apps/server/src/ai/ai.service.ts apps/server/src/ai/__tests__/ai.service.spec.ts
git commit -m "feat(ai): heartbeat lease renewal and lastSeq writeback in executeRunProtocol (P1)"
```

---

## Task 11: AiModule 注册 + 集成验证

**Files:**
- Modify: `apps/server/src/ai/ai.module.ts`

- [ ] **Step 1: 注册 RunStateRepository + REPLICA_ID provider**

1a. 顶部 import 追加：

```ts
import { REPLICA_ID } from './run/replica-id';
import { RunStateRepository } from './run/run-state.repository';
```

1b. `@Module` 的 `providers` 数组内，在 `RunManager,` 之后追加：

```ts
        RunStateRepository,
        {
            provide: REPLICA_ID,
            useFactory: () => process.env.AI_REPLICA_ID ?? crypto.randomUUID(),
        },
```

- [ ] **Step 2: 跑 server 全量测试**

Run:
```bash
cd apps/server && pnpm exec jest src/ai
```
Expected: 所有 AI 模块测试 PASS（run-manager / run-record / run-state.repository / ai.service / threads.controller / ai.module.bootstrap / run-context* / thread.service / run-event-store / tool-definitions / format-editor-context / llm-default-config / checkpointer.provider）。

> 若 `ai.module.bootstrap.spec.ts` 因新增 provider 报错，确认其 `Test.createTestingModule({ imports: [AiModule] })` 能解析 `REPLICA_ID`（useFactory 无依赖，应自动可用）与 `RunStateRepository`（依赖 PrismaService，bootstrap spec 已 override PrismaService）。

- [ ] **Step 3: 跑 server 类型检查/构建**

Run:
```bash
cd apps/server && pnpm run build
```
Expected: 编译通过，无 TS 错误。

- [ ] **Step 4: 手动验证 resume 流程（可选，需 DB + LLM key）**

启动 server，用两条 curl 验证进程外 resume 语义（interrupted run 可被 acquireLease）：
```bash
# 1. 发起对话触发工具 interrupt（假设工具触发）
curl -N -X POST http://localhost:3000/api/threads/<tid>/runs/stream \
  -H 'Content-Type: application/json' \
  -d '{"input":{"messages":[{"type":"human","content":"读 a.km"}]},"assistant_id":"default","stream_mode":["values","tasks"]}'
# 2. 观察到 tasks(interrupt) 后，重启 server（模拟 owner 释放）
# 3. resume（新进程，从 PG 抢占租约）
curl -N -X POST http://localhost:3000/api/threads/<tid>/runs/stream \
  -H 'Content-Type: application/json' \
  -d '{"input":null,"command":{"resume":{"tool_call_id":"<tc-id>","tool_result":{"content":"ok"}}},"assistant_id":"default","stream_mode":["values"]}'
```
Expected: 即使 server 重启，resume 仍成功（PG 里有 interrupted run + checkpoint），新进程 acquireLease 成功并续跑。

- [ ] **Step 5: 提交**

```bash
git add apps/server/src/ai/ai.module.ts
git commit -m "feat(ai): register RunStateRepository and REPLICA_ID in AiModule (P1)"
```

---

## P1 完成验收（对照 spec 第 8 节）

- [x] run 状态/事件流以 PG 为权威源，进程内 RunSession 为缓存（Task 3-6）
- [x] acquireLease 单一执行者保证，租约 30s + 10s heartbeat（Task 4, 10）
- [x] interrupted 状态下 owner 释放执行，resume 可被任意副本接管（Task 8, 10）
- [x] lastSeq 锚定 PG，跨 owner 连续（Task 7, 10）
- [ ] joinStream 完整重连 → **P2**
- [ ] SSE 写入三路解耦 → **P3**
- [ ] stop 终态统一 / 跨副本 cancel → **P3**
- [ ] tool_status 标记 / 前端 6 atom / 工具卡片 → **P4**（工具卡片需先设计稿）
- [ ] user 隔离 / metrics / 失真文档重写 → **P5**

**P1 明确遗留（非阻塞，记入 TODO）：**
- 跨副本 `interrupt`/`cancel`：P1 退化为 reject+warn / owner 本地，完整实现留 P3
- `EventBus` 抽象与 Redis 接入：P2
- SSE 写入解耦（`emitEvent` 不阻塞）：P3

## 后续阶段（独立计划，P1 完成后另立）

- **P2 重连**：EventBus 抽象（InProcess/Redis）→ joinStream（回放+续实时）→ 前端连接态状态机
- **P3 协议清理**：SSE 三路解耦 → stop 终态统一 → messages 序列化标准化 → enqueue/rollback 明确语义 → 跨副本 cancel
- **P4 前端**：6 atom snapshot → tool_status → 工具卡片（**设计稿先行**）→ openThread 融合 joinStream
- **P5 文档安全**：user 隔离 → metrics → 重写 4 篇失真文档
