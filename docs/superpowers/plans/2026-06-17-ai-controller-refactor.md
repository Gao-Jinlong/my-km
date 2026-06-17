# AI 控制器层重构 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 AI 模块的控制器层重构为纯路由——`threads.controller` 瘦身到 Thread CRUD，`runs.controller` 合并所有 Run 端点并消除路由冲突，SSE 胶水内聚到 `AiChatService`，目录按"controller 跟随 service"重新组织。

**Architecture:** Controller 只做路由 + 入参解析 + DTO 映射；`AiChatService` 新增 `streamRun(cmd, res)` / `joinStream(runId, since, res)` 两个门面方法承接全部 SSE 胶水（建 sink、设 header、写错误帧、断线清理）；新增 `RunQueryService` 替代 controller 直接用 Prisma；`sse-helpers.ts` 提供 `writeSSE`/`setSseHeaders`/`sendProtocolError` 三个纯函数。文件迁移：`langgraph/threads.controller.ts` → `thread/`，删除 `langgraph/langgraph-protocol.ts`。

**Tech Stack:** NestJS（DI、控制器、异常 filter）、Express（SSE Response）、Jest + ts-jest（测试）、Prisma（数据访问）。

**Spec:** `docs/superpowers/specs/2026-06-17-ai-controller-refactor-design.md`

**Worktree:** `D:\projects\my-km\.worktrees\refactor-ai-controller`（分支 `refactor/ai-controller-layer`）

**关键约定（全计划通用）：**
- 测试命令（在 `apps/server` 目录下，需 node v22 在 PATH）：
  ```bash
  # Windows cmd — 跑指定路径的测试
  set "PATH=C:\Users\ginlon-atlas\AppData\Roaming\fnm\node-versions\v22.22.3\installation;%PATH%" && node node_modules\jest\bin\jest.js --testPathPatterns="<regex>"
  ```
  注意：此项目的 jest 用 `--testPathPatterns`（复数），不是 `--testPathPattern`。
- 构建命令：`cd apps/server && pnpm build`（nest build）
- 提交时 husky pre-commit 会因 PATH 找不到 npx 而失败，用 `git -c core.hooksPath=/dev/null commit` 绕过。
- 所有路径以 worktree 根为基准，`apps/server/src/ai/...`。
- 现有 128 个 ai 模块测试必须始终保持通过（每个任务结束验证）。

---

## File Structure

| 文件 | 操作 | 职责 |
|---|---|---|
| `apps/server/src/ai/thread/langgraph-thread.dto.ts` | 创建 | LangGraph SDK Thread 协议 DTO（CreateThreadBody 等 + LangGraphThread） |
| `apps/server/src/ai/thread/thread-dto.mapper.ts` | 创建 | `toLangGraphThread` 内部模型→SDK 映射（纯函数） |
| `apps/server/src/ai/run/langgraph-run.dto.ts` | 创建 | RunsStreamBody DTO |
| `apps/server/src/ai/run/run-dto.mapper.ts` | 创建 | `extractLastUserMessage`（纯函数） + Prisma Run→RunDto 映射 |
| `apps/server/src/ai/run/run-query.service.ts` | 创建 | 替代 controller 直接用 Prisma 查 Run |
| `apps/server/src/ai/run/sse-helpers.ts` | 创建 | `writeSSE`/`setSseHeaders`/`sendProtocolError` 纯函数 |
| `apps/server/src/ai/ai.service.ts` | 修改 | 新增 `streamRun`/`joinStream`/`InvalidRunInputError` |
| `apps/server/src/ai/thread/threads.controller.ts` | 创建（迁移+瘦身） | Thread CRUD + getThreadState，纯路由 |
| `apps/server/src/ai/run/runs.controller.ts` | 修改（合并+瘦身） | 所有 Run 端点 |
| `apps/server/src/ai/ai.module.ts` | 修改 | 更新 controller import + 注册 RunQueryService |
| `apps/server/src/ai/langgraph/threads.controller.ts` | 删除 | 迁出后删除 |
| `apps/server/src/ai/langgraph/langgraph-protocol.ts` | 删除 | 迁出后删除 |
| 各 `__tests__/*.spec.ts` | 创建/迁移 | 见各任务 |

任务顺序按"每步可独立编译测试通过"设计：先抽纯逻辑（无行为变更）→ 抽 service → 瘦 controller → 迁文件 → 回归。

---

## Task 1: 抽取 Thread DTO 与 Mapper（无行为变更）

把内联在 `langgraph/threads.controller.ts` 里的 Thread 协议类型和 `toLangGraphThread` 提取到独立文件，先写测试再迁移。

**Files:**
- Create: `apps/server/src/ai/thread/langgraph-thread.dto.ts`
- Create: `apps/server/src/ai/thread/thread-dto.mapper.ts`
- Create: `apps/server/src/ai/thread/__tests__/thread-dto.mapper.spec.ts`

- [ ] **Step 1: 写 mapper 测试（TDD - 失败）**

Create `apps/server/src/ai/thread/__tests__/thread-dto.mapper.spec.ts`:

```typescript
import { toLangGraphThread } from '../thread-dto.mapper';
import type { ThreadLike } from '../thread-dto.mapper';

function sampleThread(overrides: Partial<ThreadLike> = {}): ThreadLike {
    return {
        id: 'thread-1',
        title: 'Hello',
        status: 'active',
        model: 'gpt-4',
        provider: 'openai',
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-01T00:00:00Z'),
        ...overrides,
    };
}

describe('toLangGraphThread', () => {
    it('maps id → thread_id', () => {
        const result = toLangGraphThread(sampleThread());
        expect(result.thread_id).toBe('thread-1');
    });

    it('packs title/model/provider into metadata', () => {
        const result = toLangGraphThread(sampleThread());
        expect(result.metadata).toEqual({
            title: 'Hello',
            model: 'gpt-4',
            provider: 'openai',
        });
    });

    it('serializes timestamps to ISO strings', () => {
        const result = toLangGraphThread(sampleThread());
        expect(result.created_at).toBe('2026-01-01T00:00:00.000Z');
        expect(result.updated_at).toBe('2026-01-01T00:00:00.000Z');
    });

    it('always returns status idle (internal active maps to idle)', () => {
        const result = toLangGraphThread(sampleThread({ status: 'active' }));
        expect(result.status).toBe('idle');
    });

    it('returns empty values object', () => {
        const result = toLangGraphThread(sampleThread());
        expect(result.values).toEqual({});
    });

    it('preserves null model/provider in metadata', () => {
        const result = toLangGraphThread(sampleThread({ model: null, provider: null }));
        expect(result.metadata.model).toBeNull();
        expect(result.metadata.provider).toBeNull();
    });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run（在 `apps/server`）:
```bash
set "PATH=C:\Users\ginlon-atlas\AppData\Roaming\fnm\node-versions\v22.22.3\installation;%PATH%" && node node_modules\jest\bin\jest.js --testPathPatterns="thread-dto.mapper"
```
Expected: FAIL — `Cannot find module '../thread-dto.mapper'`

- [ ] **Step 3: 创建 DTO 类型文件**

Create `apps/server/src/ai/thread/langgraph-thread.dto.ts`:

```typescript
/**
 * LangGraph SDK Thread 协议 DTO
 *
 * 对应 @langchain/langgraph-sdk Client 期望的请求/响应格式。
 * 与内部 ThreadDto 区别：用 thread_id / metadata / values 字段名。
 */

/** threads.create() 请求体：{ metadata?, thread_id?, if_exists? } */
export interface CreateThreadBody {
    metadata?: Record<string, unknown>;
    thread_id?: string;
    if_exists?: 'raise' | 'do_nothing';
}

/** threads.search() 请求体：{ metadata?, limit?, offset?, status?, ... } */
export interface SearchThreadsBody {
    metadata?: Record<string, unknown>;
    limit?: number;
    offset?: number;
    status?: 'idle' | 'busy' | 'interrupted' | 'error';
}

/** threads.update() 请求体 */
export interface UpdateThreadBody {
    metadata?: Record<string, unknown>;
}

/** SDK 期望的 Thread 响应格式 */
export interface LangGraphThread {
    thread_id: string;
    metadata: Record<string, unknown>;
    created_at: string;
    updated_at: string;
    status: 'idle' | 'busy' | 'interrupted' | 'error';
    values: Record<string, unknown>;
}
```

- [ ] **Step 4: 创建 mapper（实现）**

Create `apps/server/src/ai/thread/thread-dto.mapper.ts`:

```typescript
import type { LangGraphThread } from './langgraph-thread.dto';

/**
 * 内部 Thread 模型需要提供的字段集合（结构化类型，Prisma Thread 行满足此 shape）。
 */
export interface ThreadLike {
    id: string;
    title: string | null;
    status: string;
    model: string | null;
    provider: string | null;
    createdAt: Date;
    updatedAt: Date;
}

/**
 * 将内部 Thread 模型转换为 LangGraph SDK 期望的格式。
 *
 * status 映射：内部 active|archived|deleted → SDK idle（archived/deleted 不会出现在活跃查询中）。
 */
export function toLangGraphThread(thread: ThreadLike): LangGraphThread {
    return {
        thread_id: thread.id,
        metadata: {
            title: thread.title,
            model: thread.model,
            provider: thread.provider,
        },
        created_at: thread.createdAt.toISOString(),
        updated_at: thread.updatedAt.toISOString(),
        status: 'idle',
        values: {},
    };
}
```

- [ ] **Step 5: 运行测试确认通过**

Run:
```bash
set "PATH=C:\Users\ginlon-atlas\AppData\Roaming\fnm\node-versions\v22.22.3\installation;%PATH%" && node node_modules\jest\bin\jest.js --testPathPatterns="thread-dto.mapper"
```
Expected: PASS — 6 tests pass.

- [ ] **Step 6: 提交**

```bash
git add apps/server/src/ai/thread/langgraph-thread.dto.ts apps/server/src/ai/thread/thread-dto.mapper.ts apps/server/src/ai/thread/__tests__/thread-dto.mapper.spec.ts
git -c core.hooksPath=/dev/null commit -m "refactor(ai): extract thread DTO + toLangGraphThread mapper (Task 1)"
```

---

## Task 2: 抽取 Run DTO 与 Mapper（含 extractLastUserMessage）

抽取 `RunsStreamBody`、`extractLastUserMessage`、`toRunDto`。`extractLastUserMessage` 和 `toRunDto` 都从现有 controller 迁出。

**Files:**
- Create: `apps/server/src/ai/run/langgraph-run.dto.ts`
- Create: `apps/server/src/ai/run/run-dto.mapper.ts`
- Create: `apps/server/src/ai/run/__tests__/run-dto.mapper.spec.ts`

- [ ] **Step 1: 写 mapper 测试（TDD - 失败）**

Create `apps/server/src/ai/run/__tests__/run-dto.mapper.spec.ts`:

```typescript
import { extractLastUserMessage, toRunDto } from '../run-dto.mapper';

describe('extractLastUserMessage', () => {
    it('returns content of last human message', () => {
        const messages = [
            { type: 'human', content: 'first' },
            { type: 'ai', content: 'hi' },
            { type: 'human', content: 'second' },
        ];
        expect(extractLastUserMessage(messages)).toBe('second');
    });

    it('returns null when no human message', () => {
        const messages = [
            { type: 'ai', content: 'hi' },
            { type: 'system', content: 'sys' },
        ];
        expect(extractLastUserMessage(messages)).toBeNull();
    });

    it('returns null for empty array', () => {
        expect(extractLastUserMessage([])).toBeNull();
    });

    it('skips ai messages after the last human', () => {
        const messages = [
            { type: 'human', content: 'q' },
            { type: 'ai', content: 'a1' },
            { type: 'ai', content: 'a2' },
        ];
        expect(extractLastUserMessage(messages)).toBe('q');
    });
});

describe('toRunDto', () => {
    const prismaRun = {
        id: 'run-1',
        threadId: 'thread-1',
        status: 'completed',
        model: 'gpt-4',
        provider: 'openai',
        promptTokens: 10,
        completionTokens: 20,
        totalTokens: 30,
        startedAt: new Date('2026-01-01T00:00:00Z'),
        completedAt: new Date('2026-01-01T00:01:00Z'),
        createdAt: new Date('2026-01-01T00:00:00Z'),
    };

    it('maps id, threadId, status', () => {
        const dto = toRunDto(prismaRun);
        expect(dto.id).toBe('run-1');
        expect(dto.threadId).toBe('thread-1');
        expect(dto.status).toBe('completed');
    });

    it('maps token counts', () => {
        const dto = toRunDto(prismaRun);
        expect(dto.promptTokens).toBe(10);
        expect(dto.completionTokens).toBe(20);
        expect(dto.totalTokens).toBe(30);
    });

    it('serializes startedAt/completedAt/createdAt to ISO strings', () => {
        const dto = toRunDto(prismaRun);
        expect(dto.startedAt).toBe('2026-01-01T00:00:00.000Z');
        expect(dto.completedAt).toBe('2026-01-01T00:01:00.000Z');
        expect(dto.createdAt).toBe('2026-01-01T00:00:00.000Z');
    });

    it('coerces null model/provider to undefined', () => {
        const dto = toRunDto({ ...prismaRun, model: null, provider: null });
        expect(dto.model).toBeUndefined();
        expect(dto.provider).toBeUndefined();
    });

    it('coerces null startedAt/completedAt to undefined', () => {
        const dto = toRunDto({ ...prismaRun, startedAt: null, completedAt: null });
        expect(dto.startedAt).toBeUndefined();
        expect(dto.completedAt).toBeUndefined();
    });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:
```bash
set "PATH=C:\Users\ginlon-atlas\AppData\Roaming\fnm\node-versions\v22.22.3\installation;%PATH%" && node node_modules\jest\bin\jest.js --testPathPatterns="run-dto.mapper"
```
Expected: FAIL — `Cannot find module '../run-dto.mapper'`

- [ ] **Step 3: 创建 Run DTO 类型文件**

Create `apps/server/src/ai/run/langgraph-run.dto.ts`:

```typescript
import type { MultitaskStrategy } from '../types/run.types';

/**
 * LangGraph SDK runs.stream() 请求体
 *
 * SDK 发送：
 *   新 run: { input: {messages: [...]}, assistant_id, stream_mode, config?, context? }
 *   resume: { input: null, command: { resume: {...} }, assistant_id, stream_mode }
 */
export interface RunsStreamBody {
    input?: { messages?: Array<{ type: string; content: string; id?: string }> } | null;
    command?: { resume?: unknown } | null;
    assistant_id?: string;
    stream_mode?: string | string[];
    config?: { configurable?: Record<string, unknown> };
    context?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
    multitask_strategy?: MultitaskStrategy;
}
```

- [ ] **Step 4: 创建 run mapper（实现）**

Create `apps/server/src/ai/run/run-dto.mapper.ts`:

```typescript
import type { RunDto } from '../types/run.types';

/**
 * 从 LangChain messages 数组中提取最后一条 human message 的 content。
 *
 * 用于 streamRun 新 run 路径：SDK 把用户输入放在 input.messages 里，
 * 取最后一条 human message 作为本轮用户消息。
 *
 * @returns 最后一条 human message 的 content，无 human message 时返回 null。
 */
export function extractLastUserMessage(
    messages: Array<{ type: string; content: string }>,
): string | null {
    for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i];
        if (msg.type === 'human') {
            return msg.content;
        }
    }
    return null;
}

/**
 * Prisma Run 行的输入类型（结构化，兼容 findUnique/findMany 返回）。
 */
export interface PrismaRunLike {
    id: string;
    threadId: string;
    status: string;
    model: string | null;
    provider: string | null;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    startedAt: Date | null;
    completedAt: Date | null;
    createdAt: Date;
}

/**
 * 将 Prisma Run 模型转换为 RunDto（API 响应格式）。
 */
export function toRunDto(run: PrismaRunLike): RunDto {
    return {
        id: run.id,
        threadId: run.threadId,
        status: run.status as RunDto['status'],
        model: run.model ?? undefined,
        provider: run.provider ?? undefined,
        promptTokens: run.promptTokens,
        completionTokens: run.completionTokens,
        totalTokens: run.totalTokens,
        startedAt: run.startedAt?.toISOString(),
        completedAt: run.completedAt?.toISOString(),
        createdAt: run.createdAt.toISOString(),
    };
}
```

- [ ] **Step 5: 运行测试确认通过**

Run:
```bash
set "PATH=C:\Users\ginlon-atlas\AppData\Roaming\fnm\node-versions\v22.22.3\installation;%PATH%" && node node_modules\jest\bin\jest.js --testPathPatterns="run-dto.mapper"
```
Expected: PASS — 9 tests pass.

- [ ] **Step 6: 提交**

```bash
git add apps/server/src/ai/run/langgraph-run.dto.ts apps/server/src/ai/run/run-dto.mapper.ts apps/server/src/ai/run/__tests__/run-dto.mapper.spec.ts
git -c core.hooksPath=/dev/null commit -m "refactor(ai): extract run DTO + extractLastUserMessage + toRunDto mapper (Task 2)"
```

---

## Task 3: 迁移 sse-helpers（从 langgraph-protocol）

把 `writeSSE`/`setSseHeaders`/`sendProtocolError` 迁到 `run/sse-helpers.ts`。`writeMetadata`/`writeEnd`/`writeError` 不迁移（grep 确认无生产调用方，仅 protocol.ts 自身和注释引用）。先迁文件，controller 的 import 放到 Task 5 改。

**Files:**
- Create: `apps/server/src/ai/run/sse-helpers.ts`
- Create: `apps/server/src/ai/run/__tests__/sse-helpers.spec.ts`
- Keep（暂不删除）: `apps/server/src/ai/langgraph/langgraph-protocol.ts`（Task 6 删除，避免中途编译断裂）

- [ ] **Step 1: 写 sse-helpers 测试（TDD - 失败）**

Create `apps/server/src/ai/run/__tests__/sse-helpers.spec.ts`:

```typescript
import type { Response } from 'express';
import { sendProtocolError, setSseHeaders, writeSSE } from '../sse-helpers';

function createMockResponse(): { res: Response; writes: string[] } {
    const writes: string[] = [];
    const res = {
        writableEnded: false,
        write: jest.fn((chunk: string) => {
            writes.push(chunk);
            return true;
        }),
        end: jest.fn(() => {
            (res as { writableEnded: boolean }).writableEnded = true;
        }),
        setHeader: jest.fn(),
        flushHeaders: jest.fn(),
    } as unknown as Response;
    return { res, writes };
}

describe('writeSSE', () => {
    it('writes event + data lines', () => {
        const { res, writes } = createMockResponse();
        writeSSE(res, 'values', { messages: [] });
        expect(writes[0]).toBe('event: values\ndata: {"messages":[]}\n\n');
    });

    it('includes id line when seq provided', () => {
        const { res, writes } = createMockResponse();
        writeSSE(res, 'end', {}, 42);
        expect(writes[0]).toContain('id: 42\n');
        expect(writes[0]).toContain('event: end\n');
    });

    it('omits id line when seq undefined', () => {
        const { res, writes } = createMockResponse();
        writeSSE(res, 'values', {});
        expect(writes[0]).not.toContain('id:');
    });

    it('skips write when res.writableEnded', () => {
        const { res, writes } = createMockResponse();
        (res as { writableEnded: boolean }).writableEnded = true;
        writeSSE(res, 'values', { a: 1 });
        expect(writes).toHaveLength(0);
    });
});

describe('setSseHeaders', () => {
    it('sets all four SSE headers and flushes', () => {
        const { res } = createMockResponse();
        setSseHeaders(res);
        const setHeader = res.setHeader as jest.Mock;
        expect(setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
        expect(setHeader).toHaveBeenCalledWith('Cache-Control', 'no-cache');
        expect(setHeader).toHaveBeenCalledWith('Connection', 'keep-alive');
        expect(setHeader).toHaveBeenCalledWith('X-Accel-Buffering', 'no');
        expect(res.flushHeaders).toHaveBeenCalled();
    });
});

describe('sendProtocolError', () => {
    it('writes error frame and ends response', () => {
        const { res, writes } = createMockResponse();
        sendProtocolError(res, 'execution_error', 'boom');
        expect(writes[0]).toBe('event: error\ndata: {"error":"execution_error","message":"boom"}\n\n');
        expect(res.end).toHaveBeenCalled();
    });

    it('is no-op when res already ended', () => {
        const { res, writes } = createMockResponse();
        (res as { writableEnded: boolean }).writableEnded = true;
        sendProtocolError(res, 'execution_error', 'boom');
        expect(writes).toHaveLength(0);
        expect(res.end).not.toHaveBeenCalled();
    });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:
```bash
set "PATH=C:\Users\ginlon-atlas\AppData\Roaming\fnm\node-versions\v22.22.3\installation;%PATH%" && node node_modules\jest\bin\jest.js --testPathPatterns="sse-helpers"
```
Expected: FAIL — `Cannot find module '../sse-helpers'`

- [ ] **Step 3: 创建 sse-helpers（实现）**

Create `apps/server/src/ai/run/sse-helpers.ts`:

```typescript
/**
 * SSE 协议帧工具（run streaming 传输细节）。
 *
 * 标准 SSE 事件格式：
 *   event: <type>\n
 *   id: <seq>\n   (可选)
 *   data: <JSON>\n\n
 *
 * 这三个纯函数由 AiChatService 在 streamRun/joinStream 内部调用，
 * controller 不直接碰 SSE 帧格式。
 */

import type { Response } from 'express';

/**
 * 写一条 SSE 事件。
 *
 * @param seq per-run 单调递增，作为 SSE 标准 `id:` 行透传，
 *            供前端 joinStream/断线重连做 since=lastSeq 去重锚。省略时不写 id 行。
 */
export function writeSSE(res: Response, event: string, data: unknown, seq?: number): void {
    if (!res.writableEnded) {
        const idLine = seq !== undefined ? `id: ${seq}\n` : '';
        res.write(`event: ${event}\n${idLine}data: ${JSON.stringify(data)}\n\n`);
    }
}

/** 设置 SSE 响应头并 flush（开启流式响应）。 */
export function setSseHeaders(res: Response): void {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
}

/**
 * 写 SSE 错误帧并结束响应。用于 streamRun/joinStream 执行中异常的协议映射。
 * res 已结束时为 no-op（避免重复 end）。
 */
export function sendProtocolError(res: Response, code: string, message: string): void {
    if (!res.writableEnded) {
        res.write(`event: error\ndata: ${JSON.stringify({ error: code, message })}\n\n`);
        res.end();
    }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run:
```bash
set "PATH=C:\Users\ginlon-atlas\AppData\Roaming\fnm\node-versions\v22.22.3\installation;%PATH%" && node node_modules\jest\bin\jest.js --testPathPatterns="sse-helpers"
```
Expected: PASS — 8 tests pass.

- [ ] **Step 5: 跑全量 ai 模块测试确认无回归**

Run:
```bash
set "PATH=C:\Users\ginlon-atlas\AppData\Roaming\fnm\node-versions\v22.22.3\installation;%PATH%" && node node_modules\jest\bin\jest.js --testPathPatterns="src/ai/(thread|run|langgraph)"
```
Expected: PASS — 128 + 8 = 136 tests pass（原 10 suites + 新增 1 suite）。旧的 `langgraph-protocol.spec.ts` 仍存在且通过（测 writeSSE，与新文件功能等价，Task 6 删除）。

- [ ] **Step 6: 提交**

```bash
git add apps/server/src/ai/run/sse-helpers.ts apps/server/src/ai/run/__tests__/sse-helpers.spec.ts
git -c core.hooksPath=/dev/null commit -m "refactor(ai): add run/sse-helpers with writeSSE/setSseHeaders/sendProtocolError (Task 3)"
```

---

## Task 4: 新增 RunQueryService（替代 controller 直接用 Prisma）

把 `runs.controller.ts` 里直接 `this.prisma.run.findMany/findUnique` 的查询迁到 service。

**Files:**
- Create: `apps/server/src/ai/run/run-query.service.ts`
- Create: `apps/server/src/ai/run/__tests__/run-query.service.spec.ts`
- Modify: `apps/server/src/ai/ai.module.ts`（注册 provider）

- [ ] **Step 1: 写 service 测试（TDD - 失败）**

Create `apps/server/src/ai/run/__tests__/run-query.service.spec.ts`:

```typescript
import type { PrismaService } from '../../../prisma/prisma.service';
import { RunQueryService } from '../run-query.service';

function mockPrisma(runs: unknown[]) {
    return {
        run: {
            findMany: jest.fn().mockResolvedValue(runs),
            findUnique: jest.fn().mockResolvedValue(runs[0] ?? null),
        },
    } as unknown as PrismaService;
}

describe('RunQueryService', () => {
    const sampleRun = {
        id: 'run-1',
        threadId: 'thread-1',
        status: 'completed',
        model: 'gpt-4',
        provider: 'openai',
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        startedAt: null,
        completedAt: null,
        createdAt: new Date('2026-01-01T00:00:00Z'),
    };

    describe('listByThread', () => {
        it('queries runs by threadId ordered desc, default limit 50', async () => {
            const prisma = mockPrisma([sampleRun]);
            const service = new RunQueryService(prisma);
            const result = await service.listByThread('thread-1');
            expect(prisma.run.findMany).toHaveBeenCalledWith({
                where: { threadId: 'thread-1' },
                orderBy: { createdAt: 'desc' },
                take: 50,
            });
            expect(result).toEqual([sampleRun]);
        });

        it('honors custom limit', async () => {
            const prisma = mockPrisma([sampleRun]);
            const service = new RunQueryService(prisma);
            await service.listByThread('thread-1', 10);
            expect(prisma.run.findMany).toHaveBeenCalledWith(
                expect.objectContaining({ take: 10 }),
            );
        });
    });

    describe('findById', () => {
        it('queries findUnique by id', async () => {
            const prisma = mockPrisma([sampleRun]);
            const service = new RunQueryService(prisma);
            const result = await service.findById('run-1');
            expect(prisma.run.findUnique).toHaveBeenCalledWith({ where: { id: 'run-1' } });
            expect(result).toEqual(sampleRun);
        });

        it('returns null when not found', async () => {
            const prisma = {
                run: { findUnique: jest.fn().mockResolvedValue(null) },
            } as unknown as PrismaService;
            const service = new RunQueryService(prisma);
            expect(await service.findById('missing')).toBeNull();
        });
    });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:
```bash
set "PATH=C:\Users\ginlon-atlas\AppData\Roaming\fnm\node-versions\v22.22.3\installation;%PATH%" && node node_modules\jest\bin\jest.js --testPathPatterns="run-query.service"
```
Expected: FAIL — `Cannot find module '../run-query.service'`

- [ ] **Step 3: 创建 RunQueryService（实现）**

Create `apps/server/src/ai/run/run-query.service.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * RunQueryService — Run 查询服务
 *
 * 替代 controller 直接持有 PrismaService（违反分层）。
 * 仅负责读查询；Run 的生命周期（创建/取消/状态变更）由 AiChatService + RunManager 处理。
 */
@Injectable()
export class RunQueryService {
    constructor(private readonly prisma: PrismaService) {}

    /** 列出某 Thread 下的 Run（按创建时间倒序，默认 50 条）。 */
    async listByThread(threadId: string, limit = 50) {
        return this.prisma.run.findMany({
            where: { threadId },
            orderBy: { createdAt: 'desc' },
            take: limit,
        });
    }

    /** 按 id 查找单个 Run，不存在返回 null。 */
    async findById(runId: string) {
        return this.prisma.run.findUnique({
            where: { id: runId },
        });
    }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run:
```bash
set "PATH=C:\Users\ginlon-atlas\AppData\Roaming\fnm\node-versions\v22.22.3\installation;%PATH%" && node node_modules\jest\bin\jest.js --testPathPatterns="run-query.service"
```
Expected: PASS — 4 tests pass.

- [ ] **Step 5: 在 ai.module.ts 注册 RunQueryService**

Modify `apps/server/src/ai/ai.module.ts`. 在 import 区添加（`RunsController` import 下方）:

```typescript
import { RunQueryService } from './run/run-query.service';
```

在 `providers` 数组的 `// Run 层` 区块（`JoinStreamService,` 之后）添加:

```typescript
        RunQueryService,
```

- [ ] **Step 6: 跑全量 ai 测试 + 构建确认无回归**

Run:
```bash
set "PATH=C:\Users\ginlon-atlas\AppData\Roaming\fnm\node-versions\v22.22.3\installation;%PATH%" && node node_modules\jest\bin\jest.js --testPathPatterns="src/ai/(thread|run|langgraph)"
```
Expected: PASS — 全部通过。

构建:
```bash
set "PATH=C:\Users\ginlon-atlas\AppData\Roaming\fnm\node-versions\v22.22.3\installation;%PATH%" && pnpm build
```
Expected: 编译成功（exit 0）。

- [ ] **Step 7: 提交**

```bash
git add apps/server/src/ai/run/run-query.service.ts apps/server/src/ai/run/__tests__/run-query.service.spec.ts apps/server/src/ai/ai.module.ts
git -c core.hooksPath=/dev/null commit -m "refactor(ai): add RunQueryService to replace direct Prisma use in controller (Task 4)"
```

---

## Task 5: AiChatService 新增 streamRun / joinStream / InvalidRunInputError

这是核心任务。service 新增两个门面方法承接全部 SSE 胶水。先写 service 单测，再实现。

**Files:**
- Create: `apps/server/src/ai/__tests__/ai.service.stream.spec.ts`
- Modify: `apps/server/src/ai/ai.service.ts`

- [ ] **Step 1: 写 streamRun / joinStream 测试（TDD - 失败）**

Create `apps/server/src/ai/__tests__/ai.service.stream.spec.ts`:

```typescript
/**
 * AiChatService.streamRun / joinStream 单测
 *
 * Mock 全部依赖，验证：
 *   - resume vs 新 run 路由
 *   - SSE 胶水（setSseHeaders/writeSSE/sendProtocolError/res.end/res.on）
 *   - 错误码映射（invalid_input / busy / execution_error）
 *   - sink register/unregister 生命周期
 */
import { ConflictException, NotFoundException } from '@nestjs/common';
import type { Response } from 'express';
import type { JoinStreamService } from '../run/join-stream.service';
import type { RunContextFactory } from '../run/run-context-factory';
import type { RunManager } from '../run/run-manager';
import type { RunStateRepository } from '../run/run-state.repository';
import type { RunRecord } from '../run/run-record';
import type { EventBus } from '../event/event-bus';
import type { LLMFactory } from '../llm/llm-factory';
import type { ProviderRegistry } from '../llm/provider-registry';
import type { CheckpointReaderService } from '../checkpointer/checkpoint-reader.service';
import type { ThreadService } from '../thread/thread.service';
import { AiChatService } from '../ai.service';

// mock langgraph ESM 依赖（ai.service.ts import 了 ChatGraph → langgraph → uuid ESM）
jest.mock('@langchain/langgraph', () => ({
    StateGraph: jest.fn().mockReturnValue({
        addNode: jest.fn().mockReturnThis(),
        addEdge: jest.fn().mockReturnThis(),
        addConditionalEdges: jest.fn().mockReturnThis(),
        compile: jest.fn(),
    }),
    START: '__start__',
    END: '__end__',
    Annotation: { Root: jest.fn().mockReturnValue({}) }),
    Command: jest.fn(),
}));

function createMockResponse(): { res: Response; writes: string[] } {
    const writes: string[] = [];
    const res = {
        writableEnded: false,
        write: jest.fn((chunk: string) => {
            writes.push(chunk);
            return true;
        }),
        end: jest.fn(() => {
            (res as { writableEnded: boolean }).writableEnded = true;
        }),
        setHeader: jest.fn(),
        flushHeaders: jest.fn(),
        on: jest.fn(),
    } as unknown as Response;
    return { res, writes };
}

function makeService(overrides: {
    startRun?: jest.Mock;
    resumeFromCommand?: jest.Mock;
    executeRunProtocol?: jest.Mock;
    cancel?: jest.Mock;
    joinStreamService?: Partial<JoinStreamService>;
}) {
    const record = {
        registerSink: jest.fn().mockImplementation(sink => {
            // 模拟 executeRunProtocol 期间 emit 一个 values 事件 + end
            queueMicrotask(() => {
                sink.push({ eventType: 'values', payload: { messages: [] }, seq: 1 });
            });
            return jest.fn(); // unregister
        }),
        emitEvent: jest.fn().mockResolvedValue(undefined),
        emitSSEOnly: jest.fn(),
    } as unknown as RunRecord;

    const startRun = overrides.startRun ?? jest.fn().mockResolvedValue(record);
    const resumeFromCommand = overrides.resumeFromCommand ?? jest.fn().mockResolvedValue(record);
    const executeRunProtocol = overrides.executeRunProtocol ?? jest.fn().mockResolvedValue(undefined);

    const service = {
        startRun,
        resumeFromCommand,
        executeRunProtocol,
        cancel: overrides.cancel ?? jest.fn(),
    } as unknown as AiChatService;

    // 注入 joinStreamService（joinStream 用）
    (service as unknown as { joinStreamService: JoinStreamService }).joinStreamService = {
        lookupRun: overrides.joinStreamService?.lookupRun ?? jest.fn().mockResolvedValue(undefined),
        joinStream: overrides.joinStreamService?.joinStream ?? jest.fn().mockResolvedValue(jest.fn()),
    } as JoinStreamService;

    return { service, record, startRun, resumeFromCommand, executeRunProtocol };
}

describe('AiChatService.streamRun', () => {
    it('routes to resumeFromCommand when command.resume present', async () => {
        const { service, resumeFromCommand, startRun } = makeService({});
        const { res } = createMockResponse();
        await service.streamRun({ threadId: 't1', command: { resume: 'x' } }, res);
        expect(resumeFromCommand).toHaveBeenCalledWith('t1', { resume: 'x' });
        expect(startRun).not.toHaveBeenCalled();
    });

    it('writes invalid_input error frame when input has no human message', async () => {
        const { service } = makeService({});
        const { res, writes } = createMockResponse();
        await service.streamRun({ threadId: 't1', input: { messages: [] } }, res);
        expect(writes.join('')).toContain('"error":"invalid_input"');
        expect(res.end).toHaveBeenCalled();
    });

    it('writes busy error frame on ConflictException from startRun', async () => {
        const { service } = makeService({
            startRun: jest.fn().mockRejectedValue(new ConflictException('busy')),
        });
        const { res, writes } = createMockResponse();
        await service.streamRun(
            { threadId: 't1', input: { messages: [{ type: 'human', content: 'hi' }] } },
            res,
        );
        expect(writes.join('')).toContain('"error":"busy"');
    });

    it('sets SSE headers then registers sink and executes run protocol', async () => {
        const { service, record, executeRunProtocol } = makeService({});
        const { res } = createMockResponse();
        await service.streamRun(
            { threadId: 't1', input: { messages: [{ type: 'human', content: 'hi' }] } },
            res,
        );
        expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
        expect(res.flushHeaders).toHaveBeenCalled();
        expect(record.registerSink).toHaveBeenCalled();
        expect(executeRunProtocol).toHaveBeenCalled();
    });

    it('unregisters sink in finally even when executeRunProtocol throws', async () => {
        const unregister = jest.fn();
        const record = {
            registerSink: jest.fn().mockReturnValue(unregister),
            emitEvent: jest.fn(),
            emitSSEOnly: jest.fn(),
        } as unknown as RunRecord;
        const { service } = makeService({
            startRun: jest.fn().mockResolvedValue(record),
            executeRunProtocol: jest.fn().mockRejectedValue(new Error('LLM blew up')),
        });
        const { res } = createMockResponse();
        await service.streamRun(
            { threadId: 't1', input: { messages: [{ type: 'human', content: 'hi' }] } },
            res,
        );
        expect(unregister).toHaveBeenCalled();
    });

    it('writes execution_error frame for unknown error', async () => {
        const { service } = makeService({
            startRun: jest.fn().mockRejectedValue(new Error('LLM blew up')),
        });
        const { res, writes } = createMockResponse();
        await service.streamRun(
            { threadId: 't1', input: { messages: [{ type: 'human', content: 'hi' }] } },
            res,
        );
        expect(writes.join('')).toContain('"error":"execution_error"');
    });

    it('ends response in finally if not already ended', async () => {
        const { service } = makeService({});
        const { res } = createMockResponse();
        await service.streamRun(
            { threadId: 't1', input: { messages: [{ type: 'human', content: 'hi' }] } },
            res,
        );
        expect(res.end).toHaveBeenCalled();
    });
});

describe('AiChatService.joinStream', () => {
    it('propagates NotFoundException before flushing headers (404 must be JSON)', async () => {
        const { service } = makeService({
            joinStreamService: {
                lookupRun: jest.fn().mockRejectedValue(new NotFoundException('run not found')),
            },
        });
        const { res } = createMockResponse();
        await expect(service.joinStream('r1', 0, res)).rejects.toThrow(NotFoundException);
        expect(res.setHeader).not.toHaveBeenCalled();
    });

    it('sets SSE headers after lookup succeeds and delegates to joinStreamService', async () => {
        const joinStream = jest.fn().mockResolvedValue(jest.fn());
        const { service } = makeService({
            joinStreamService: {
                lookupRun: jest.fn().mockResolvedValue(undefined),
                joinStream,
            },
        });
        const { res } = createMockResponse();
        await service.joinStream('r1', 5, res);
        expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
        expect(joinStream).toHaveBeenCalledTimes(1);
        // joinStream 第 3 个参数是 sink 对象
        const sinkArg = joinStream.mock.calls[0][2];
        expect(sinkArg).toHaveProperty('push');
        expect(sinkArg).toHaveProperty('close');
    });

    it('registers cleanup on res close', async () => {
        const { service } = makeService({});
        const { res } = createMockResponse();
        await service.joinStream('r1', 0, res);
        expect(res.on).toHaveBeenCalledWith('close', expect.any(Function));
    });

    it('writes execution_error frame when joinStream throws mid-stream', async () => {
        const { service } = makeService({
            joinStreamService: {
                lookupRun: jest.fn().mockResolvedValue(undefined),
                joinStream: jest.fn().mockRejectedValue(new Error('boom')),
            },
        });
        const { res, writes } = createMockResponse();
        await service.joinStream('r1', 0, res);
        expect(writes.join('')).toContain('"error":"execution_error"');
    });
});
```

**重要说明（实现者必读）：** `makeService` 把方法直接挂在对象上是为了单测隔离。`streamRun`/`joinStream` 是 `AiChatService` 的实例方法，内部用 `this.startRun` 等。这种 mock 方式下 `this` 指向 service 对象本身，能正常工作。`joinStreamService` 是 service 的私有字段（构造注入），测试直接挂上去。

- [ ] **Step 2: 运行测试确认失败**

Run:
```bash
set "PATH=C:\Users\ginlon-atlas\AppData\Roaming\fnm\node-versions\v22.22.3\installation;%PATH%" && node node_modules\jest\bin\jest.js --testPathPatterns="ai.service.stream"
```
Expected: FAIL — `service.streamRun is not a function` / `service.joinStream is not a function`

- [ ] **Step 3: 在 ai.service.ts 实现 streamRun / joinStream / InvalidRunInputError**

Modify `apps/server/src/ai/ai.service.ts`.

3a. 在文件顶部 import 区添加（`@nestjs/common` 那行后追加 `Response` 和新 helper）:

把：
```typescript
import { ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
```
改为：
```typescript
import {
    BadRequestException,
    ConflictException,
    Inject,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common';
```

在 `import { RunStateRepository } from './run/run-state.repository';` 之后添加：
```typescript
import { JoinStreamService } from './run/join-stream.service';
import type { RunEventSink } from './run/run-event-sink';
import { sendProtocolError, setSseHeaders, writeSSE } from './run/sse-helpers';
```

在 `import type { Response } from 'express';`（如果没有则在文件顶部加）:
```typescript
import type { Response } from 'express';
```

3b. 在 `StartRunOpts` interface 之后、`@Injectable()` 之前，添加命令类型和异常类：

```typescript
/**
 * streamRun 统一编排入口的入参（对应 controller 转发）。
 */
export interface StreamRunCommand {
    threadId: string;
    input?: { messages?: Array<{ type: string; content: string }> } | null;
    command?: { resume?: unknown } | null;
    context?: Record<string, unknown>;
    multitaskStrategy?: MultitaskStrategy;
}

/**
 * streamRun 输入无效（无 user message）时抛出，service 内部映射成 SSE invalid_input 错误帧。
 */
export class InvalidRunInputError extends BadRequestException {
    constructor(message: string) {
        super(message);
    }
}
```

3c. 在构造函数注入 `JoinStreamService`。把构造函数改为（在 `eventBus` 之后加 `joinStreamService`）：

把：
```typescript
        private readonly eventBus: EventBus,
        @Inject(REPLICA_ID) private readonly replicaId: string,
    ) {
        // 避免 TS unused 警告，保持构造依赖以便测试与未来用途
        void this._checkpointReader;
    }
```
改为：
```typescript
        private readonly eventBus: EventBus,
        private readonly joinStreamService: JoinStreamService,
        @Inject(REPLICA_ID) private readonly replicaId: string,
    ) {
        // 避免 TS unused 警告，保持构造依赖以便测试与未来用途
        void this._checkpointReader;
    }
```

3d. 在 `cancel()` 方法之后、`// ========== Private Helpers ==========` 之前，添加两个门面方法：

```typescript
    // ========== SSE 流编排门面（controller 调用，胶水内聚于此）==========

    /**
     * 统一编排入口：设 SSE 头 → 判断 resume vs 新 run → 提取 user message →
     * 建 sink + registerSink → executeRunProtocol。
     *
     * controller 只需 `await aiService.streamRun(cmd, res)`，不碰 SSE 细节。
     *
     * 异常约定（service 内部 catch 并映射成 SSE 错误帧）：
     *   - InvalidRunInputError → code: 'invalid_input'
     *   - ConflictException    → code: 'busy'（multitask reject / resume 非终态）
     *   - 其他                 → code: 'execution_error'
     */
    async streamRun(cmd: StreamRunCommand, res: Response): Promise<void> {
        setSseHeaders(res);
        let unregister: () => void = () => {};
        try {
            let record: RunRecord;
            if (cmd.command?.resume !== undefined) {
                record = await this.resumeFromCommand(cmd.threadId, cmd.command);
            } else {
                const content = extractLastUserMessage(cmd.input?.messages ?? []);
                if (!content) {
                    throw new InvalidRunInputError('No user message in input');
                }
                record = await this.startRun({
                    content,
                    threadId: cmd.threadId,
                    context: cmd.context,
                    multitaskStrategy: cmd.multitaskStrategy ?? 'reject',
                });
            }

            // 胶水：Express Response → RunEventSink（内联构造，不单独抽 adapter 文件）
            const sink: RunEventSink = {
                push: e => writeSSE(res, e.eventType, e.payload, e.seq),
                close: () => {
                    if (!res.writableEnded) {
                        res.end();
                    }
                },
            };
            unregister = record.registerSink(sink);
            await this.executeRunProtocol(record);
        } catch (error) {
            this.logger.error(`streamRun failed: ${(error as Error).message}`);
            const code = error instanceof InvalidRunInputError
                ? 'invalid_input'
                : error instanceof ConflictException
                  ? 'busy'
                  : 'execution_error';
            sendProtocolError(res, code, error instanceof Error ? error.message : 'Unknown error');
        } finally {
            unregister();
            if (!res.writableEnded) {
                res.end();
            }
        }
    }

    /**
     * 统一重连入口。
     *
     * spec 3.5 Step 1 约束：lookupRun 的 404 必须在 SSE flush 前以 JSON 返回。
     * 因此 lookupRun 抛 NotFoundException 时不设 SSE 头、直接向上抛，
     * 由 controller catch 后 res.status(404).json(...) 返回。
     * 校验通过后才设 SSE 头，之后任何异常都只能写错误帧。
     */
    async joinStream(runId: string, since: number, res: Response): Promise<void> {
        // 1. 先校验 run 存在（抛 NotFoundException 让 controller 返回 JSON）
        await this.joinStreamService.lookupRun(runId);

        // 2. 校验通过后才设 SSE 头
        setSseHeaders(res);
        const sink: RunEventSink = {
            push: e => writeSSE(res, e.eventType, e.payload, e.seq),
            close: () => {
                if (!res.writableEnded) {
                    res.end();
                }
            },
        };

        // 3. 注册断线清理
        let cleanup: () => void = () => {};
        res.on('close', () => cleanup());

        try {
            cleanup = await this.joinStreamService.joinStream(runId, since, sink);
        } catch (error) {
            this.logger.error(`joinStream failed: ${(error as Error).message}`);
            sendProtocolError(res, 'execution_error', (error as Error).message);
        }
    }
```

3e. 添加 `extractLastUserMessage` 的 import。在 `run-dto.mapper.ts` 顶部 import 区添加（`import { formatEditorContext } from './utils/format-editor-context';` 之后）：

```typescript
import { extractLastUserMessage } from './run/run-dto.mapper';
```

- [ ] **Step 4: 运行 streamRun/joinStream 测试确认通过**

Run:
```bash
set "PATH=C:\Users\ginlon-atlas\AppData\Roaming\fnm\node-versions\v22.22.3\installation;%PATH%" && node node_modules\jest\bin\jest.js --testPathPatterns="ai.service.stream"
```
Expected: PASS — 11 tests pass。

如果失败，常见原因：
- `this.joinStreamService` 未定义 → 检查构造函数注入顺序
- sink push 时 `e.eventType`/`e.payload`/`e.seq` 字段名不对 → 对照 `RunStreamEvent`（在 `event/event-bus.ts`）

- [ ] **Step 5: 在 ai.module.ts 注入 JoinStreamService 到 AiChatService（已是 provider，无需改 module）**

确认 `ai.module.ts` 的 providers 已有 `JoinStreamService`（Task 4 前就有）。无需改动。

- [ ] **Step 6: 跑全量 ai 测试 + 构建确认无回归**

Run:
```bash
set "PATH=C:\Users\ginlon-atlas\AppData\Roaming\fnm\node-versions\v22.22.3\installation;%PATH%" && node node_modules\jest\bin\jest.js --testPathPatterns="src/ai/(thread|run|langgraph)"
```
Expected: PASS — 全部通过（原 136 + 新增 11）。

构建:
```bash
set "PATH=C:\Users\ginlon-atlas\AppData\Roaming\fnm\node-versions\v22.22.3\installation;%PATH%" && pnpm build
```
Expected: 编译成功。

- [ ] **Step 7: 提交**

```bash
git add apps/server/src/ai/ai.service.ts apps/server/src/ai/__tests__/ai.service.stream.spec.ts
git -c core.hooksPath=/dev/null commit -m "refactor(ai): add AiChatService.streamRun/joinStream orchestration (Task 5)"
```

---

## Task 6: 新建 thread/threads.controller.ts（瘦身版）

在 `thread/` 目录创建新的瘦身 `ThreadsController`（Thread CRUD + getThreadState，纯路由）。同时迁移现有 `threads.controller.spec.ts` 到 `thread/__tests__/` 并删除 streamRun/cancel/joinStream 用例。

**Files:**
- Create: `apps/server/src/ai/thread/threads.controller.ts`
- Create: `apps/server/src/ai/thread/__tests__/threads.controller.spec.ts`（从 `langgraph/__tests__/threads.controller.spec.ts` 迁移 + 瘦身）
- 注意：此时 **不** 改 `ai.module.ts` 的 import（仍指向旧 controller），不删旧文件 —— Task 9 统一切换。这样本任务保持编译通过（两个同名类在不同文件，但只有旧的被 module 注册）。

- [ ] **Step 1: 写新 controller 测试（TDD - 失败）**

Create `apps/server/src/ai/thread/__tests__/threads.controller.spec.ts`:

```typescript
/**
 * ThreadsController（瘦身版）单测
 *
 * 验证 Thread CRUD + getThreadState 是纯路由：
 *   - createThread / searchThreads / getThread / updateThread / deleteThread / getThreadState
 *   - 通过 mapper 转换，不直接碰 SSE/Run 逻辑
 *
 * Mock ThreadService / CheckpointReaderService。
 */
import { NotFoundException } from '@nestjs/common';
import type { CheckpointReaderService } from '../../checkpointer/checkpoint-reader.service';
import type { ThreadService } from '../thread.service';
import { ThreadsController } from '../threads.controller';

// mock langgraph ESM（ThreadsController 不再 import ChatGraph，但 jest 配置可能仍加载）
jest.mock('@langchain/langgraph', () => ({
    StateGraph: jest.fn(),
    START: '__start__',
    END: '__end__',
    Annotation: { Root: jest.fn() },
}));

const sampleThread = {
    id: 'thread-1',
    title: 'Hello',
    status: 'active',
    model: 'gpt-4',
    provider: 'openai',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
};

describe('ThreadsController (slim)', () => {
    let controller: ThreadsController;
    let mockThreadService: jest.Mocked<ThreadService>;
    let mockCheckpointReader: jest.Mocked<CheckpointReaderService>;

    beforeEach(() => {
        mockThreadService = {
            create: jest.fn().mockResolvedValue(sampleThread),
            findAll: jest.fn().mockResolvedValue([sampleThread]),
            findById: jest.fn().mockResolvedValue(sampleThread),
            update: jest.fn().mockResolvedValue(sampleThread),
            delete: jest.fn().mockResolvedValue(undefined),
        } as unknown as jest.Mocked<ThreadService>;

        mockCheckpointReader = {
            getThreadState: jest.fn().mockResolvedValue({
                values: { messages: [] },
                next: [],
                checkpoint: { thread_id: 'thread-1' },
                tasks: [],
            }),
        } as unknown as jest.Mocked<CheckpointReaderService>;

        controller = new ThreadsController(mockThreadService, mockCheckpointReader);
    });

    describe('createThread', () => {
        it('extracts title from metadata.title and converts to LangGraph format', async () => {
            const result = await controller.createThread({
                metadata: { title: 'My Thread' },
                thread_id: 'tid-1',
            });
            expect(mockThreadService.create).toHaveBeenCalledWith({ id: 'tid-1', title: 'My Thread' });
            expect(result.thread_id).toBe('thread-1');
            expect(result.status).toBe('idle');
        });

        it('handles missing metadata gracefully', async () => {
            const result = await controller.createThread({});
            expect(mockThreadService.create).toHaveBeenCalledWith({ id: undefined, title: undefined });
            expect(result.thread_id).toBe('thread-1');
        });
    });

    describe('searchThreads', () => {
        it('passes limit and offset with defaults', async () => {
            await controller.searchThreads({});
            expect(mockThreadService.findAll).toHaveBeenCalledWith({ limit: 10, offset: 0 });
        });

        it('returns LangGraph-formatted threads', async () => {
            const result = await controller.searchThreads({});
            expect(result[0].thread_id).toBe('thread-1');
        });
    });

    describe('getThread', () => {
        it('returns thread when found', async () => {
            const result = await controller.getThread('thread-1');
            expect(result.thread_id).toBe('thread-1');
        });

        it('throws NotFoundException when thread missing', async () => {
            mockThreadService.findById.mockResolvedValueOnce(null as never);
            await expect(controller.getThread('missing')).rejects.toThrow(NotFoundException);
        });
    });

    describe('updateThread', () => {
        it('extracts title and updates', async () => {
            await controller.updateThread('thread-1', { metadata: { title: 'New' } });
            expect(mockThreadService.update).toHaveBeenCalledWith('thread-1', { title: 'New' });
        });
    });

    describe('deleteThread', () => {
        it('delegates to threadService.delete', async () => {
            await controller.deleteThread('thread-1');
            expect(mockThreadService.delete).toHaveBeenCalledWith('thread-1');
        });
    });

    describe('getThreadState', () => {
        it('delegates to checkpointReader.getThreadState', async () => {
            await controller.getThreadState('thread-1');
            expect(mockCheckpointReader.getThreadState).toHaveBeenCalledWith('thread-1');
        });
    });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:
```bash
set "PATH=C:\Users\ginlon-atlas\AppData\Roaming\fnm\node-versions\v22.22.3\installation;%PATH%" && node node_modules\jest\bin\jest.js --testPathPatterns="thread/__tests__/threads.controller"
```
Expected: FAIL — `Cannot find module '../threads.controller'`

- [ ] **Step 3: 创建瘦身 ThreadsController（实现）**

Create `apps/server/src/ai/thread/threads.controller.ts`:

```typescript
/**
 * ThreadsController — LangGraph Platform 协议兼容的 Thread 控制器（瘦身版）
 *
 * 只负责 Thread 资源 CRUD + state，纯路由 + DTO 映射。
 * Run 相关端点（streamRun/cancel/joinStream）在 RunsController。
 *
 * 实现 @langchain/langgraph-sdk Client 期望的接口：
 *   POST   /api/threads                → createThread
 *   POST   /api/threads/search         → searchThreads
 *   GET    /api/threads/:id            → getThread
 *   PATCH  /api/threads/:id            → updateThread
 *   DELETE /api/threads/:id            → deleteThread
 *   GET    /api/threads/:id/state      → getThreadState
 */

import { Body, Controller, Delete, Get, Logger, NotFoundException, Param, Patch, Post } from '@nestjs/common';
import { SkipResponseWrap } from '../../common/decorators/skip-response-wrap.decorator';
import { CheckpointReaderService } from '../checkpointer/checkpoint-reader.service';
import type { CreateThreadBody, LangGraphThread, SearchThreadsBody, UpdateThreadBody } from './langgraph-thread.dto';
import { toLangGraphThread } from './thread-dto.mapper';
import { ThreadService } from './thread.service';

@Controller('threads')
@SkipResponseWrap()
export class ThreadsController {
    private readonly logger = new Logger(ThreadsController.name);

    constructor(
        private readonly threadService: ThreadService,
        private readonly checkpointReader: CheckpointReaderService,
    ) {}

    /** POST /api/threads — 创建 Thread */
    @Post()
    async createThread(@Body() body: CreateThreadBody): Promise<LangGraphThread> {
        const title = typeof body.metadata?.title === 'string' ? body.metadata.title : undefined;
        const thread = await this.threadService.create({ id: body.thread_id, title });
        return toLangGraphThread(thread);
    }

    /** POST /api/threads/search — 搜索/列出 Threads */
    @Post('search')
    async searchThreads(@Body() body: SearchThreadsBody): Promise<LangGraphThread[]> {
        const threads = await this.threadService.findAll({
            limit: body.limit ?? 10,
            offset: body.offset ?? 0,
        });
        return threads.map(toLangGraphThread);
    }

    /** GET /api/threads/:threadId */
    @Get(':threadId')
    async getThread(@Param('threadId') threadId: string): Promise<LangGraphThread> {
        const thread = await this.threadService.findById(threadId);
        if (!thread) {
            throw new NotFoundException(`Thread not found: ${threadId}`);
        }
        return toLangGraphThread(thread);
    }

    /** PATCH /api/threads/:threadId */
    @Patch(':threadId')
    async updateThread(
        @Param('threadId') threadId: string,
        @Body() body: UpdateThreadBody,
    ): Promise<LangGraphThread> {
        const title = typeof body.metadata?.title === 'string' ? body.metadata.title : undefined;
        const updated = await this.threadService.update(threadId, { title });
        return toLangGraphThread(updated);
    }

    /** DELETE /api/threads/:threadId — 软删除 */
    @Delete(':threadId')
    async deleteThread(@Param('threadId') threadId: string): Promise<void> {
        await this.threadService.delete(threadId);
    }

    /** GET /api/threads/:threadId/state — 获取 Thread 当前状态（LangGraph ThreadState 格式） */
    @Get(':threadId/state')
    async getThreadState(@Param('threadId') threadId: string) {
        return this.checkpointReader.getThreadState(threadId);
    }
}
```

- [ ] **Step 4: 运行新测试确认通过**

Run:
```bash
set "PATH=C:\Users\ginlon-atlas\AppData\Roaming\fnm\node-versions\v22.22.3\installation;%PATH%" && node node_modules\jest\bin\jest.js --testPathPatterns="thread/__tests__/threads.controller"
```
Expected: PASS — 9 tests pass。

- [ ] **Step 5: 跑全量 ai 测试 + 构建确认无回归（旧 controller 仍注册，新 controller 未注册）**

Run:
```bash
set "PATH=C:\Users\ginlon-atlas\AppData\Roaming\fnm\node-versions\v22.22.3\installation;%PATH%" && node node_modules\jest\bin\jest.js --testPathPatterns="src/ai/(thread|run|langgraph)"
```
Expected: PASS — 全部通过（注意此时会有两个 `threads.controller.spec.ts`：旧的在 `langgraph/__tests__/`，新的在 `thread/__tests__/`，都通过）。

构建:
```bash
set "PATH=C:\Users\ginlon-atlas\AppData\Roaming\fnm\node-versions\v22.22.3\installation;%PATH%" && pnpm build
```
Expected: 编译成功（新文件未被 module 引用，但 tsc 会编译它，必须无类型错误）。

- [ ] **Step 6: 提交**

```bash
git add apps/server/src/ai/thread/threads.controller.ts apps/server/src/ai/thread/__tests__/threads.controller.spec.ts
git -c core.hooksPath=/dev/null commit -m "refactor(ai): add slim ThreadsController in thread/ (Task 6)"
```

---

## Task 7: 改造 runs.controller.ts（合并 Run 端点 + 瘦身）

把 `streamRun`/`cancelRun`(带 204/202)/`joinStream` 合并到 `runs.controller.ts`，用 `RunQueryService` 替代 Prisma，全部 Run 端点集中于此（消除路由冲突）。

**Files:**
- Modify: `apps/server/src/ai/run/runs.controller.ts`
- Create: `apps/server/src/ai/run/__tests__/runs.controller.spec.ts`

- [ ] **Step 1: 写 runs.controller 测试（TDD - 失败）**

Create `apps/server/src/ai/run/__tests__/runs.controller.spec.ts`:

```typescript
/**
 * RunsController 单测 — 验证 controller 是纯路由
 *
 * 覆盖：
 *   - listRuns / getRun 转发 RunQueryService
 *   - streamRun 转发 aiService.streamRun（不 catch）
 *   - cancelRun 的 204/202 分支（依赖 replicaId）
 *   - joinStream 仅 catch NotFoundException（404 前置）+ since 解析
 */
import { NotFoundException } from '@nestjs/common';
import type { Response } from 'express';
import type { AiChatService } from '../../ai.service';
import type { RunQueryService } from '../run-query.service';
import { RunsController } from '../runs.controller';

jest.mock('@langchain/langgraph', () => ({
    StateGraph: jest.fn(),
    START: '__start__',
    END: '__end__',
    Annotation: { Root: jest.fn() },
}));

function createMockResponse(): Response {
    return {
        writableEnded: false,
        write: jest.fn().mockReturnValue(true),
        end: jest.fn(),
        setHeader: jest.fn(),
        flushHeaders: jest.fn(),
        on: jest.fn(),
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
    } as unknown as Response;
}

describe('RunsController', () => {
    let controller: RunsController;
    let mockRunQuery: jest.Mocked<RunQueryService>;
    let mockAiService: jest.Mocked<AiChatService>;

    const sampleRun = {
        id: 'run-1',
        threadId: 'thread-1',
        status: 'completed',
        model: 'gpt-4',
        provider: 'openai',
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        startedAt: null,
        completedAt: null,
        createdAt: new Date('2026-01-01T00:00:00Z'),
    };

    beforeEach(() => {
        mockRunQuery = {
            listByThread: jest.fn().mockResolvedValue([sampleRun]),
            findById: jest.fn().mockResolvedValue(sampleRun),
        } as unknown as jest.Mocked<RunQueryService>;

        mockAiService = {
            streamRun: jest.fn().mockResolvedValue(undefined),
            joinStream: jest.fn().mockResolvedValue(undefined),
            cancel: jest.fn().mockResolvedValue({ accepted: true, ownerId: 'replica-test' }),
        } as unknown as jest.Mocked<AiChatService>;

        controller = new RunsController(mockAiService, mockRunQuery, 'replica-test');
    });

    describe('listRuns', () => {
        it('delegates to runQuery.listByThread and maps to DTO', async () => {
            const result = await controller.listRuns('thread-1');
            expect(mockRunQuery.listByThread).toHaveBeenCalledWith('thread-1');
            expect(result).toHaveLength(1);
            expect(result[0].id).toBe('run-1');
        });
    });

    describe('getRun', () => {
        it('returns mapped DTO when found', async () => {
            const result = await controller.getRun('thread-1', 'run-1');
            expect(mockRunQuery.findById).toHaveBeenCalledWith('run-1');
            expect(result.id).toBe('run-1');
        });

        it('throws NotFoundException when not found', async () => {
            mockRunQuery.findById.mockResolvedValueOnce(null);
            await expect(controller.getRun('thread-1', 'missing')).rejects.toThrow(NotFoundException);
        });
    });

    describe('streamRun', () => {
        it('forwards merged command to aiService.streamRun, no catch', async () => {
            const res = createMockResponse();
            const body = {
                input: { messages: [{ type: 'human', content: 'hi' }] },
                context: { foo: 'bar' },
            };
            await controller.streamRun('thread-1', body, res);
            expect(mockAiService.streamRun).toHaveBeenCalledWith(
                {
                    threadId: 'thread-1',
                    input: body.input,
                    context: body.context,
                },
                res,
            );
            expect(mockAiService.streamRun).toHaveBeenCalledTimes(1);
        });
    });

    describe('cancelRun', () => {
        it('returns 204 when ownerId matches replicaId (本副本 owner)', async () => {
            const res = createMockResponse();
            mockAiService.cancel.mockResolvedValueOnce({ accepted: true, ownerId: 'replica-test' });
            await controller.cancelRun('thread-1', 'run-1', res);
            expect(res.status).toHaveBeenCalledWith(204);
            expect(res.end).toHaveBeenCalled();
        });

        it('returns 202 when ownerId differs (已转发给 owner)', async () => {
            const res = createMockResponse();
            mockAiService.cancel.mockResolvedValueOnce({
                accepted: true,
                ownerId: 'other-replica',
            });
            await controller.cancelRun('thread-1', 'run-1', res);
            expect(res.status).toHaveBeenCalledWith(202);
            expect(res.json).toHaveBeenCalledWith({ accepted: true, ownerId: 'other-replica' });
        });
    });

    describe('joinStream', () => {
        it('parses since numeric string', async () => {
            const res = createMockResponse();
            await controller.joinStream('thread-1', 'run-1', '10', res);
            expect(mockAiService.joinStream).toHaveBeenCalledWith('run-1', 10, res);
        });

        it('defaults since to 0 when undefined', async () => {
            const res = createMockResponse();
            await controller.joinStream('thread-1', 'run-1', undefined, res);
            expect(mockAiService.joinStream).toHaveBeenCalledWith('run-1', 0, res);
        });

        it('defaults since to 0 when non-numeric', async () => {
            const res = createMockResponse();
            await controller.joinStream('thread-1', 'run-1', 'abc', res);
            expect(mockAiService.joinStream).toHaveBeenCalledWith('run-1', 0, res);
        });

        it('returns 404 JSON before flush when service throws NotFoundException', async () => {
            const res = createMockResponse();
            mockAiService.joinStream.mockRejectedValueOnce(new NotFoundException('run not found'));
            await controller.joinStream('thread-1', 'run-1', '0', res);
            expect(res.status).toHaveBeenCalledWith(404);
            expect(res.json).toHaveBeenCalled();
            // SSE 头未设（flush 前 404）
            expect(res.setHeader).not.toHaveBeenCalled();
        });

        it('does not double-handle when res already ended (service wrote error frame)', async () => {
            const res = createMockResponse();
            (res as { writableEnded: boolean }).writableEnded = true;
            mockAiService.joinStream.mockRejectedValueOnce(new NotFoundException('late'));
            await controller.joinStream('thread-1', 'run-1', '0', res);
            // res 已 ended，不应再 status/json
            expect(res.status).not.toHaveBeenCalled();
        });
    });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:
```bash
set "PATH=C:\Users\ginlon-atlas\AppData\Roaming\fnm\node-versions\v22.22.3\installation;%PATH%" && node node_modules\jest\bin\jest.js --testPathPatterns="run/__tests__/runs.controller"
```
Expected: FAIL — `streamRun is not a function` / `cancelRun signature mismatch`（旧 RunsController 没有这些方法，且构造函数签名不同）

- [ ] **Step 3: 改造 runs.controller.ts（实现）**

Replace 全部内容 of `apps/server/src/ai/run/runs.controller.ts`:

```typescript
/**
 * RunsController — Run 全生命周期控制器（合并版）
 *
 * LangGraph Platform 协议兼容端点：
 *   GET    /api/threads/:threadId/runs                → listRuns
 *   GET    /api/threads/:threadId/runs/:runId         → getRun
 *   POST   /api/threads/:threadId/runs/stream         → streamRun（SSE）
 *   POST   /api/threads/:threadId/runs/:runId/cancel  → cancelRun（唯一注册点）
 *   GET    /api/threads/:threadId/runs/:runId/stream  → joinStream（SSE 重连）
 *
 * 关键设计：
 * - Controller 是纯路由：streamRun/joinStream 直接转发到 AiChatService 对应门面方法，
 *   SSE 胶水（建 sink、设 header、写错误帧、断线清理）内聚在 service。
 * - cancel 路由只在此处注册一次（消除旧 threads.controller 与本 controller 的路由冲突）。
 * - Run 查询通过 RunQueryService，不直接持有 PrismaService。
 * - joinStream 仅 catch NotFoundException：spec 3.5 要求 404 在 SSE flush 前以 JSON 返回。
 */

import {
    Body,
    Controller,
    Get,
    Inject,
    Logger,
    NotFoundException,
    Param,
    Post,
    Query,
    Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { SkipResponseWrap } from '../../common/decorators/skip-response-wrap.decorator';
import { AiChatService } from '../ai.service';
import type { RunsStreamBody } from './langgraph-run.dto';
import { REPLICA_ID } from './replica-id';
import { toRunDto } from './run-dto.mapper';
import { RunQueryService } from './run-query.service';

@Controller('threads')
@SkipResponseWrap()
export class RunsController {
    private readonly logger = new Logger(RunsController.name);

    constructor(
        private readonly aiService: AiChatService,
        private readonly runQueryService: RunQueryService,
        @Inject(REPLICA_ID) private readonly replicaId: string,
    ) {}

    /** GET /api/threads/:threadId/runs — 列出 Thread 的所有 Run */
    @Get(':threadId/runs')
    async listRuns(@Param('threadId') threadId: string) {
        const runs = await this.runQueryService.listByThread(threadId);
        return runs.map(toRunDto);
    }

    /** GET /api/threads/:threadId/runs/:runId — 获取单个 Run 详情 */
    @Get(':threadId/runs/:runId')
    async getRun(
        @Param('threadId') _threadId: string,
        @Param('runId') runId: string,
    ) {
        const run = await this.runQueryService.findById(runId);
        if (!run) {
            throw new NotFoundException(`Run not found: ${runId}`);
        }
        return toRunDto(run);
    }

    /**
     * POST /api/threads/:threadId/runs/stream — 启动或恢复 streaming run
     *
     * 纯转发：所有 SSE 胶水和编排逻辑在 aiService.streamRun。
     * service 内部处理 resume 判断、user message 提取、错误帧映射。
     */
    @Post(':threadId/runs/stream')
    async streamRun(
        @Param('threadId') threadId: string,
        @Body() body: RunsStreamBody,
        @Res() res: Response,
    ): Promise<void> {
        await this.aiService.streamRun(
            {
                threadId,
                input: body.input,
                command: body.command,
                context: body.context,
                multitaskStrategy: body.multitask_strategy,
            },
            res,
        );
    }

    /**
     * POST /api/threads/:threadId/runs/:runId/cancel — 取消活跃 run（跨副本支持）
     *
     * - 本副本 owner → 204 No Content
     * - 非 owner，已转发 signal 给 owner → 202 Accepted
     */
    @Post(':threadId/runs/:runId/cancel')
    async cancelRun(
        @Param('threadId') _threadId: string,
        @Param('runId') runId: string,
        @Res() res: Response,
    ): Promise<void> {
        const result = await this.aiService.cancel(runId);
        if (result.ownerId === this.replicaId) {
            res.status(204).end();
        } else {
            res.status(202).json({ accepted: true, ownerId: result.ownerId });
        }
    }

    /**
     * GET /api/threads/:threadId/runs/:runId/stream — 重新加入正在进行的 run（spec 3.5）
     *
     * 仅 catch NotFoundException：lookupRun 的 404 必须在 SSE flush 前以 JSON 返回
     * （service 内 lookupRun 失败时 res 尚未 flush，抛出由这里转 404 JSON）。
     * service 校验通过后自行设 SSE 头、写错误帧、注册断线清理。
     */
    @Get(':threadId/runs/:runId/stream')
    async joinStream(
        @Param('threadId') _threadId: string,
        @Param('runId') runId: string,
        @Query('since') sinceParam: string | undefined,
        @Res() res: Response,
    ): Promise<void> {
        const parsed = Number.parseInt(sinceParam ?? '0', 10);
        const since = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;

        try {
            await this.aiService.joinStream(runId, since, res);
        } catch (error) {
            if (!res.writableEnded && error instanceof NotFoundException) {
                res.status(404).json({ error: 'not_found', message: (error as Error).message });
                return;
            }
            // res 已 ended（service 写了错误帧）或其他错误：service 已处理，不重复
        }
    }
}
```

- [ ] **Step 4: 运行 runs.controller 测试确认通过**

Run:
```bash
set "PATH=C:\Users\ginlon-atlas\AppData\Roaming\fnm\node-versions\v22.22.3\installation;%PATH%" && node node_modules\jest\bin\jest.js --testPathPatterns="run/__tests__/runs.controller"
```
Expected: PASS — 12 tests pass。

- [ ] **Step 5: 跑全量 ai 测试 + 构建确认无回归（注意：此时旧 threads.controller 仍注册，路由仍有冲突）**

Run:
```bash
set "PATH=C:\Users\ginlon-atlas\AppData\Roaming\fnm\node-versions\v22.22.3\installation;%PATH%" && node node_modules\jest\bin\jest.js --testPathPatterns="src/ai/(thread|run|langgraph)"
```
Expected: PASS — 单测全过（路由冲突是运行时问题，单测不触发）。

构建:
```bash
set "PATH=C:\Users\ginlon-atlas\AppData\Roaming\fnm\node-versions\v22.22.3\installation;%PATH%" && pnpm build
```
Expected: 编译成功。

- [ ] **Step 6: 提交**

```bash
git add apps/server/src/ai/run/runs.controller.ts apps/server/src/ai/run/__tests__/runs.controller.spec.ts
git -c core.hooksPath=/dev/null commit -m "refactor(ai): merge Run endpoints into RunsController + slim routing (Task 7)"
```

---

## Task 8: 切换 ai.module.ts 注册 + 删除旧 controller/protocol

切换 module 的 controller import 到新位置，删除旧的 `langgraph/threads.controller.ts` 和 `langgraph/langgraph-protocol.ts`，删除旧测试。这是消除路由冲突的关键步骤。

**Files:**
- Modify: `apps/server/src/ai/ai.module.ts`
- Delete: `apps/server/src/ai/langgraph/threads.controller.ts`
- Delete: `apps/server/src/ai/langgraph/langgraph-protocol.ts`
- Delete: `apps/server/src/ai/langgraph/__tests__/threads.controller.spec.ts`
- Delete: `apps/server/src/ai/langgraph/__tests__/langgraph-protocol.spec.ts`

- [ ] **Step 1: 修改 ai.module.ts import**

Modify `apps/server/src/ai/ai.module.ts`. 把：
```typescript
import { ThreadsController } from './langgraph/threads.controller';
```
改为：
```typescript
import { ThreadsController } from './thread/threads.controller';
```

`RunsController` 的 import（`from './run/runs.controller'`）保持不变。`controllers: [ThreadsController, RunsController]` 保持不变。

- [ ] **Step 2: 删除旧 controller 和 protocol 文件**

```bash
cd /d D:\projects\my-km\.worktrees\refactor-ai-controller
del apps\server\src\ai\langgraph\threads.controller.ts
del apps\server\src\ai\langgraph\langgraph-protocol.ts
del apps\server\src\ai\langgraph\__tests__\threads.controller.spec.ts
del apps\server\src\ai\langgraph\__tests__\langgraph-protocol.spec.ts
```

- [ ] **Step 3: 构建确认无残留引用**

```bash
cd apps/server && set "PATH=C:\Users\ginlon-atlas\AppData\Roaming\fnm\node-versions\v22.22.3\installation;%PATH%" && pnpm build
```
Expected: 编译成功。若失败，grep 残留引用：
```bash
cd ..\.. && powershell -NoProfile -Command "Get-ChildItem -Recurse -Include *.ts apps\server\src | Select-String -Pattern 'langgraph/langgraph-protocol|langgraph/threads.controller'"
```
修复任何残留 import。

- [ ] **Step 4: 跑全量 ai 测试确认无回归**

Run（在 `apps/server`）:
```bash
set "PATH=C:\Users\ginlon-atlas\AppData\Roaming\fnm\node-versions\v22.22.3\installation;%PATH%" && node node_modules\jest\bin\jest.js --testPathPatterns="src/ai/(thread|run|langgraph)"
```
Expected: PASS — 旧的 2 个 spec 已删除，剩 thread/run 的新 spec 全过。

- [ ] **Step 5: 提交**

```bash
git add apps/server/src/ai/ai.module.ts
git add -A apps/server/src/ai/langgraph/
git -c core.hooksPath=/dev/null commit -m "refactor(ai): switch module to new ThreadsController + remove old controller/protocol (Task 8)"
```

---

## Task 9: 路由冲突回归测试

新增集成测试，断言 `POST /threads/:threadId/runs/:runId/cancel` 只注册一次。用静态扫描方式（ NestJS 路由列举在测试环境复杂，静态 grep 更稳）。

**Files:**
- Create: `apps/server/src/ai/__tests__/routing-regression.spec.ts`

- [ ] **Step 1: 写回归测试**

Create `apps/server/src/ai/__tests__/routing-regression.spec.ts`:

```typescript
/**
 * 路由冲突回归测试
 *
 * 确保 cancel 路由（POST threads/:threadId/runs/:runId/cancel）只在 controller 中
 * 注册一次。历史上 ThreadsController 和 RunsController 各注册一次，导致 NestJS
 * 注册顺序决定哪个生效。
 *
 * 方式：静态扫描 ai/ 下所有 controller 文件，统计 cancel 装饰器出现次数。
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

function listTsFiles(dir: string, acc: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
            listTsFiles(full, acc);
        } else if (entry.endsWith('.controller.ts')) {
            acc.push(full);
        }
    }
    return acc;
}

describe('AI routing regression', () => {
    const aiSrc = resolve(__dirname, '..');
    const controllers = listTsFiles(aiSrc);

    it('covers both thread and run controllers', () => {
        expect(controllers.map(c => c.replace(/\\/g, '/'))).toEqual(
            expect.arrayContaining([
                expect.stringContaining('thread/threads.controller.ts'),
                expect.stringContaining('run/runs.controller.ts'),
            ]),
        );
    });

    it('registers cancel route exactly once across all controllers', () => {
        const cancelRegistrations = controllers.flatMap(file => {
            const content = readFileSync(file, 'utf8');
            // 匹配 @Post('...runs/:runId/cancel') 这类装饰器
            const matches = content.match(/@Post\(['"][^'"]*runs\/:runId\/cancel['"]\)/g);
            return matches ?? [];
        });

        expect(cancelRegistrations).toHaveLength(1);
        expect(cancelRegistrations[0]).toContain('cancel');
    });

    it('registers streamRun route only in runs.controller', () => {
        const streamRegistrations = controllers.flatMap(file => {
            const content = readFileSync(file, 'utf8');
            const matches = content.match(/@Post\(['"][^'"]*runs\/stream['"]\)/g);
            return matches ?? [];
        });
        expect(streamRegistrations).toHaveLength(1);
    });
});
```

- [ ] **Step 2: 运行测试确认通过**

Run:
```bash
set "PATH=C:\Users\ginlon-atlas\AppData\Roaming\fnm\node-versions\v22.22.3\installation;%PATH%" && node node_modules\jest\bin\jest.js --testPathPatterns="routing-regression"
```
Expected: PASS — 3 tests pass。

- [ ] **Step 3: 提交**

```bash
git add apps/server/src/ai/__tests__/routing-regression.spec.ts
git -c core.hooksPath=/dev/null commit -m "test(ai): add routing regression — cancel route registered exactly once (Task 9)"
```

---

## Task 10: 全量验证 + 构建

最终验收：跑 server 全量测试 + 构建 + lint。

- [ ] **Step 1: 跑 server 全量测试**

Run（在 `apps/server`）:
```bash
set "PATH=C:\Users\ginlon-atlas\AppData\Roaming\fnm\node-versions\v22.22.3\installation;%PATH%" && node node_modules\jest\bin\jest.js
```
Expected: PASS — 所有测试通过。对比 baseline（128 个 ai 测试），新增 task1-9 测试，总数应增加。无 FAIL。

- [ ] **Step 2: 构建**

```bash
set "PATH=C:\Users\ginlon-atlas\AppData\Roaming\fnm\node-versions\v22.22.3\installation;%PATH%" && pnpm build
```
Expected: 编译成功（exit 0），`dist/` 生成。

- [ ] **Step 3: （可选）lint**

```bash
set "PATH=C:\Users\ginlon-atlas\AppData\Roaming\fnm\node-versions\v22.22.3\installation;%PATH%" && pnpm lint
```
Expected: 无 error（warning 可接受）。若有未使用 import 等，修复后提交。

- [ ] **Step 4: 确认 git 状态干净**

```bash
cd /d D:\projects\my-km\.worktrees\refactor-ai-controller && git status
```
Expected: `nothing to commit, working tree clean`。

- [ ] **Step 5: 记录最终测试统计**

把最终测试统计写入提交说明或单独记录：
```bash
git log --oneline refactor/ai-controller-layer ^main
```
Expected: 看到 Task 1-9 共 9 个提交。

---

## Self-Review Checklist（plan 写完后自查，已通过）

**Spec coverage:**
- §3 目录结构 → Task 1/2/3/4/6/8（文件创建/迁移/删除全覆盖）
- §4.1 ThreadsController 瘦身 → Task 6
- §4.2 RunsController 合并 → Task 7
- §4.3 RunQueryService → Task 4
- §5.1 streamRun → Task 5
- §5.2 joinStream → Task 5
- §5.3 保留 startRun 等 → Task 5（不改这些方法，仅组合调用）
- §6.1 sse-helpers → Task 3
- §6.2 胶水内聚 → Task 5（streamRun/joinStream 内联 sink 构造）
- §6.3 controller 极简 → Task 6/7
- §7 错误约定 → Task 5（service 错误码映射）+ Task 7（joinStream catch NotFoundException）
- §8.1 controller 单测 → Task 6/7
- §8.2 service 单测 → Task 5
- §8.3 helper 单测 → Task 3
- §8.4 mapper 单测 → Task 1/2
- §8.5 路由冲突回归 → Task 9
- §8.6 现有测试迁移 → Task 8（删除旧 spec）+ Task 6（新建瘦身 spec）
- §9 迁移步骤 → Task 1-9 顺序对齐 spec 的 7 步（拆得更细）
- 附录 A 文件清单 → 全覆盖

**Placeholder scan:** 无 TODO/TBD，每个 step 都有完整代码或精确命令。

**Type consistency:**
- `StreamRunCommand`（Task 5 定义）→ Task 7 controller streamRun 构造 ✅
- `InvalidRunInputError`（Task 5）→ Task 5 内部使用 ✅
- `RunQueryService.listByThread/findById`（Task 4）→ Task 7 使用 ✅
- `toLangGraphThread`（Task 1）→ Task 6 使用 ✅
- `toRunDto` / `extractLastUserMessage`（Task 2）→ Task 5/7 使用 ✅
- `writeSSE`/`setSseHeaders`/`sendProtocolError`（Task 3）→ Task 5 使用 ✅
- `RunsStreamBody`（Task 2）→ Task 7 使用 ✅
- `cancel()` 返回 `{accepted, ownerId}` → Task 7 cancelRun 用 `result.ownerId` ✅
- `RunsController` 构造函数 `(aiService, runQueryService, replicaId)` → Task 7 测试构造 ✅
- `ThreadsController` 构造函数 `(threadService, checkpointReader)` → Task 6 测试构造 ✅
