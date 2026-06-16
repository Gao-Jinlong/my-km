# LLM 对话协议重构 P2-5：前端连接态状态机 + 完整重连 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 spec 第 5 节前端 Runtime 连接态部分（P2 收尾）：6 态连接状态机（idle/loading/ready/streaming/paused/reconnecting）、`openThread` 三段式（读 state → 查活跃 run → joinStream 续上，解决缺陷 #9）、自动重连（保留已渲染 messages、指数退避、`since=lastSeq`），并补齐后端 SSE `seq` 透传（重连去重锚）。

**Architecture:**
1. **后端 seq 透传**（spec 3.4/3.5）：`writeSSE` 增加 `id:` 行（=seq，SSE 标准 event id）；`emitEvent`/`emitSSEOnly` 已分配 `seq`，只需让 `sseWriter` 回调带上 seq；`streamRun`（owner）与 `joinStream`（重连）两路 SSE 都写 `id:`。
2. **前端 SSE 解析**：新增 `sse-stream.ts`（fetch + ReadableStream + TextDecoder），产出 `AsyncIterable<{event, data, seq?}>`，解析 `event:`/`data:`/`id:` 三类行。`runs.stream`（owner）+ `runs.joinStream`（重连）+ `runs.list`（查活跃 run）均改为自 fetch（SDK 不解析 `id:` 行、不支持自定义 joinStream/list 端点），`threads.create/getState` 与 `runs.cancel` 透传 SDK。
3. **连接态状态机**：`LangGraphChatSnapshot` 增 `connectionPhase` + `lastSeq` 字段（保留扁平 snapshot + 单 Emitter，spec 5.5 的 6-atom 拆分留 P4）。`isStreaming` 派生为 `phase ∈ {streaming, reconnecting}`（hook 消费方零改动）。每收一个带 seq 的事件更新 `lastSeq`。
4. **openThread 三段式**：`phase=loading` → `getState` 渲染历史 → `runs.list` 取首个 `status∈{running,interrupted}` 的 run → 有则 `joinStream?since=0`（`phase=streaming`），无则 `phase=ready`。
5. **自动重连**：SSE 流非用户主动断开（stream 抛错/提前 close，非 cancel）→ `phase=reconnecting`（保留 messages）→ 指数退避 `joinStream?since=lastSeq` → 成功回 `streaming`/`paused`，达上限回 `ready` + error。
6. **paused 态**：`handleToolInterrupt` 进入时 `phase=paused`（保持现状 auto-dispatch），`resumeWithToolResult` 的 `runStream` 回 `streaming`。spec 5.6 interrupt 派生 + 5.8 工具卡片视觉留 P4。

**Tech Stack:** 后端 NestJS + Jest（`apps/server`，`pnpm exec jest`）；前端 React + TypeScript + vitest（`apps/web`，`pnpm exec vitest`）；SSE over fetch（ReadableStream）。无新依赖。

**Spec:** `docs/superpowers/specs/2026-06-15-llm-conversation-protocol-design.md` 第 3.4/3.5 节（seq + joinStream）、5.2（状态机）、5.3（openThread 三段式）、5.4（自动重连）。后端 joinStream 端点（`GET /api/threads/:tid/runs/:rid/stream?since=N`）与 `listRuns`（`GET /api/threads/:tid/runs`）在 P2-3b / 已有 controller 就绪。

---

## 关键设计约束（实现时不可违背）

1. **后端 `writeSSE` 用 SSE 标准 `id:` 行透传 seq**（spec 3.4）：`id: ${seq}\n`。`seq` 为可选第 4 参数（`undefined` 时不写 `id:` 行，向后兼容 `writeMetadata`/`writeEnd`/`writeError` 等无 seq 调用）。
2. **`sseWriter` 回调签名带 seq**：`emitEvent`/`emitSSEOnly` 已构造 `streamEvent{seq,eventType,payload}`，但当前只把 `{event,data}` 传给 `sseWriter`。改为传 `{event, data, seq}`。`setSseWriter` 是唯一改动签名处（仅 1 caller：`threads.controller.ts` streamRun）。
3. **`joinStream` sink 用 `event.seq`**：`RunStreamEvent` 已含 seq，`writeSSE(res, event.eventType, event.payload, event.seq)`。
4. **前端 seq 解析靠自 fetch**：SDK Client 不解析 SSE `id:` 行，故 `runs.stream`/`runs.joinStream` 自 fetch 经 `sse-stream.ts` 解析。`threads.create/getState`/`runs.cancel` 透传 SDK（无需 seq）。
5. **`isStreaming` 派生，非独立存储**：`connectionPhase ∈ {streaming, reconnecting}` 时 `isStreaming=true`。`use-langgraph-stream.ts` 与所有 snapshot 消费方零改动（`...snapshot` 仍含 `isStreaming`）。
6. **重连只补不重渲染**：前端消息投影本就幂等（`values` 全量覆盖、`upsertMessage` 按 id、interrupt 按 `handledToolCallIds` Set），`since=lastSeq` 跳过已收事件；seq 主要保护 `end/error` 不被重复回放误触终态转换。
7. **openThread 首次 `since=0`**：切回进行中对话时前端无 `lastSeq`，全回放 PG（量小可接受），回放期间逐事件建立 `lastSeq`，之后续实时与断线重连均用 `since=lastSeq`。
8. **重连触发条件 = 非用户主动断开**：`stop()` 调 cancel 不触发重连（流会被后端 `end{cancelled}` 正常关闭）；`dispose()`（unmount）不重连。仅 stream 迭代抛错或提前 close（且非 abort 信号）才进 `reconnecting`。
9. **paused 不引入新 UI 交互**：`handleToolInterrupt` 仍 auto-dispatch（现状），仅 `phase=paused` 标记。spec 5.6 interrupt 派生 + 5.7 工具卡片 + 5.8 取消 UI 视觉留 P4。
10. **本阶段边界**：5.5（6-atom 拆分）、5.6（interrupt 派生重写）、5.7（工具卡片视觉）、5.9（编辑器上下文事件驱动）**不做**。`use-langgraph-stream.ts` 返回结构向后兼容（`...snapshot` 含新字段 `connectionPhase`/`lastSeq`，不删旧字段）。

---

## File Structure

**后端修改：**
- `apps/server/src/ai/langgraph/langgraph-protocol.ts` — `writeSSE` 加可选 `seq` → `id:` 行
- `apps/server/src/ai/run/run-record.ts` — `sseWriter` 字段 + `setSseWriter` 签名带 seq；`emitEvent`/`emitSSEOnly` 传 `{event,data,seq}`
- `apps/server/src/ai/langgraph/threads.controller.ts` — streamRun 的 `setSseWriter` 回调 + joinStream sink 传 seq

**后端测试：**
- `apps/server/src/ai/langgraph/__tests__/langgraph-protocol.spec.ts`（新建）— `writeSSE` 含 `id:` 行
- `apps/server/src/ai/langgraph/__tests__/threads.controller.spec.ts`（已有，扩展）— streamRun/joinStream SSE 含 seq

**前端新增：**
- `apps/web/src/features/ai/sdk/sse-stream.ts` — fetch + ReadableStream SSE 解析器（产出 `{event,data,seq?}`）
- `apps/web/src/features/ai/sdk/runtime-http-client.ts` — 实现 `LangGraphRuntimeClient`（runs.stream/joinStream/list 自 fetch，余透传 SDK）
- `apps/web/src/features/ai/sdk/__tests__/sse-stream.test.ts`（新建）
- `apps/web/src/features/ai/sdk/__tests__/runtime-http-client.test.ts`（新建）

**前端修改：**
- `apps/web/src/features/ai/langgraph/types.ts` — `ConnectionPhase` 类型、`LangGraphStreamEvent.seq?`、`LangGraphChatSnapshot.connectionPhase/lastSeq`、`LangGraphRuntimeClient.runs.joinStream/list`
- `apps/web/src/features/ai/langgraph/chat-runtime.ts` — phase 状态机、lastSeq 跟踪、openThread 三段式、自动重连、paused
- `apps/web/src/features/ai/langgraph/runtime-factory.ts` — `createLangGraphRuntimeClient()` 改用 `runtime-http-client`（去掉 `as unknown` 强转）
- `apps/web/src/features/ai/langgraph/__tests__/chat-runtime.test.ts` — phase/三段式/重连/paused 测试

**不改：**
- `apps/web/src/hooks/use-langgraph-stream.ts`（`...snapshot` 自动含新字段，零改动）
- 后端 `JoinStreamService` / `RunStateRepository` / `AiChatService`（P2-3b 已就绪）
- `message-projection.ts`（投影幂等，无需改）

---

## 通用约定（每个 Bash 命令前缀）

> 本仓库 shell PATH 偶发失效，所有 `pnpm`/`node`/`git` 命令前必须先 export PATH。若 fnm multishell id（`12284_1781581532078`）不同，用 `ls /c/Users/ginlon-atlas/AppData/Local/fnm_multishells/` 找到并替换。git 可用全路径 `/c/Program Files/Git/cmd/git.exe -C /d/projects/my-km`。

```bash
export PATH="/usr/bin:/bin:/c/Program Files/Git/cmd:/c/Program Files/Git/usr/bin:/c/Users/ginlon-atlas/AppData/Local/fnm_multishells/12284_1781581532078:/c/Users/ginlon-atlas/AppData/Local/pnpm:$PATH"
```

后续每个 Run 块默认已含此 export，为简洁起见步骤内不再重复，**执行时务必带上**。

---

## Task 1: 后端 writeSSE 透传 seq（id: 行）

**Files:**
- Create: `apps/server/src/ai/langgraph/__tests__/langgraph-protocol.spec.ts`
- Modify: `apps/server/src/ai/langgraph/langgraph-protocol.ts:24-28`

- [ ] **Step 1: 写失败测试（writeSSE 写 id: 行）**

Create `apps/server/src/ai/langgraph/__tests__/langgraph-protocol.spec.ts`:

```ts
import { Response } from 'express';
import { writeSSE } from '../langgraph-protocol';

function mockResponse(): { res: Response; chunks: string[] } {
    const chunks: string[] = [];
    const res = {
        writableEnded: false,
        write: jest.fn((chunk: string) => {
            chunks.push(chunk);
            return true;
        }),
    } as unknown as Response;
    return { res, chunks };
}

describe('writeSSE', () => {
    it('writes event + data without id line when seq is omitted', () => {
        const { res, chunks } = mockResponse();
        writeSSE(res, 'values', { messages: [] });
        expect(chunks).toHaveLength(1);
        expect(chunks[0]).not.toContain('id:');
        expect(chunks[0]).toContain('event: values');
        expect(chunks[0]).toContain('data: {"messages":[]}');
    });

    it('writes id: line with seq when provided', () => {
        const { res, chunks } = mockResponse();
        writeSSE(res, 'end', { finish_reason: 'cancelled' }, 42);
        expect(chunks[0]).toContain('id: 42');
        expect(chunks[0]).toContain('event: end');
        expect(chunks[0]).toContain('data: {"finish_reason":"cancelled"}');
    });

    it('does not write when response already ended', () => {
        const { res, chunks } = mockResponse();
        (res as { writableEnded: boolean }).writableEnded = true;
        writeSSE(res, 'end', {}, 1);
        expect(chunks).toHaveLength(0);
    });
});
```

- [ ] **Step 2: 运行测试，确认 FAIL**

Run:
```bash
cd /d/projects/my-km/apps/server && pnpm exec jest src/ai/langgraph/__tests__/langgraph-protocol.spec.ts --runInBand 2>&1 | tail -15
```
Expected: FAIL —— 测试期望 `id: 42`，当前 `writeSSE` 不写 id 行。

- [ ] **Step 3: 实现 writeSSE seq 透传**

Modify `apps/server/src/ai/langgraph/langgraph-protocol.ts`，替换 `writeSSE`（当前 line 24-28）为：

```ts
/**
 * 写一条 SSE 事件。seq（per-run 单调递增，spec 3.4/3.5）作为 SSE 标准 `id:` 行透传，
 * 供前端 joinStream/断线重连做 since=lastSeq 去重锚。seq 省略时不写 id 行
 * （向后兼容 writeMetadata/writeEnd/writeError 等无 seq 的内部调用）。
 */
export function writeSSE(res: Response, event: string, data: unknown, seq?: number): void {
    if (!res.writableEnded) {
        const idLine = seq !== undefined ? `id: ${seq}\n` : '';
        res.write(`event: ${event}\n${idLine}data: ${JSON.stringify(data)}\n\n`);
    }
}
```

- [ ] **Step 4: 运行测试，确认 PASS**

Run:
```bash
cd /d/projects/my-km/apps/server && pnpm exec jest src/ai/langgraph/__tests__/langgraph-protocol.spec.ts --runInBand 2>&1 | tail -10
```
Expected: PASS —— 3 个测试全绿。

- [ ] **Step 5: 提交**

```bash
cd /d/projects/my-km && git add apps/server/src/ai/langgraph/langgraph-protocol.ts apps/server/src/ai/langgraph/__tests__/langgraph-protocol.spec.ts && git commit -m "feat(ai): writeSSE emits id: line with seq for reconnect anchor (P2-5)"
```

---

## Task 2: 后端 sseWriter 回调 + streamRun/joinStream 透传 seq

**Files:**
- Modify: `apps/server/src/ai/run/run-record.ts:64, 119-121, 163-166, 202-205`
- Modify: `apps/server/src/ai/langgraph/threads.controller.ts:245-247, 311-314`

- [ ] **Step 1: 写失败测试（emitEvent 的 sseWriter 收到 seq）**

先确认 `run-record` 是否有现成测试文件。若 `apps/server/src/ai/run/__tests__/run-record.spec.ts` 不存在，新建；若存在，在其末尾 `describe` 内追加。用以下探测命令确认：

Run:
```bash
ls /d/projects/my-km/apps/server/src/ai/run/__tests__/ 2>&1
```

新建/追加测试（`apps/server/src/ai/run/__tests__/run-record.spec.ts`，若无则 Create 全文，已有则只追加末尾 `it`）：

```ts
import { RunRecord } from '../run-record';
import type { RunContext } from '../run-context';

function makeRecord(): RunRecord {
    const eventStore = { append: jest.fn().mockResolvedValue(undefined) };
    const eventBus = { publish: jest.fn().mockResolvedValue(undefined) };
    const runContext = { eventStore, eventBus } as unknown as RunContext;
    return new RunRecord({
        id: 'run-1',
        threadId: 'thread-1',
        runContext,
        snapshot: {} as never,
    });
}

describe('RunRecord emitEvent seq透传', () => {
    it('sseWriter callback receives seq for emitEvent', async () => {
        const record = makeRecord();
        const seen: Array<{ event: string; data: unknown; seq: number }> = [];
        record.setSseWriter(e => seen.push(e));
        await record.emitEvent({ event: 'values', data: { messages: [] } });
        await record.emitEvent({ event: 'end', data: {} });
        expect(seen[0]).toEqual({ event: 'values', data: { messages: [] }, seq: 0 });
        expect(seen[1]).toEqual({ event: 'end', data: {}, seq: 1 });
    });

    it('sseWriter callback receives seq for emitSSEOnly', () => {
        const record = makeRecord();
        const seen: number[] = [];
        record.setSseWriter(e => seen.push(e.seq));
        record.emitSSEOnly({ event: 'messages', data: { id: 'm-1' } });
        record.emitSSEOnly({ event: 'messages', data: { id: 'm-2' } });
        expect(seen).toEqual([0, 1]);
    });
});
```

- [ ] **Step 2: 运行测试，确认 FAIL**

Run:
```bash
cd /d/projects/my-km/apps/server && pnpm exec jest src/ai/run/__tests__/run-record.spec.ts --runInBand 2>&1 | tail -15
```
Expected: FAIL —— 当前 `sseWriter` 回调只收 `{event, data}`，`e.seq` 为 `undefined`，断言失败。

- [ ] **Step 3: 改 sseWriter 签名 + emitEvent/emitSSEOnly 传 seq**

Modify `apps/server/src/ai/run/run-record.ts`：

(a) 字段声明（line 64 附近）：
```ts
    /** SSE response writer（由 controller 设置，回调带 seq 供 SSE id: 行） */
    private sseWriter?: (event: { event: string; data: unknown; seq: number }) => void;
```

(b) `setSseWriter`（line 119-121）：
```ts
    setSseWriter(writer: (event: { event: string; data: unknown; seq: number }) => void) {
        this.sseWriter = writer;
    }
```

(c) `emitEvent` 内 SSE 推送（原 `if (this.sseWriter) { this.sseWriter(event); }`，line 163-166）：
```ts
        // [1] SSE 即时推（带 seq，供前端 id: 行重连锚）
        if (this.sseWriter) {
            this.sseWriter({ event: event.event, data: event.data, seq });
        }
```

(d) `emitSSEOnly` 内 SSE 推送（原 line 202-205）：
```ts
        // [1] SSE 即时推（带 seq）
        if (this.sseWriter) {
            this.sseWriter({ event: event.event, data: event.data, seq });
        }
```

- [ ] **Step 4: 运行 run-record 测试，确认 PASS**

Run:
```bash
cd /d/projects/my-km/apps/server && pnpm exec jest src/ai/run/__tests__/run-record.spec.ts --runInBand 2>&1 | tail -10
```
Expected: PASS。

- [ ] **Step 5: streamRun 回调 + joinStream sink 传 seq 到 writeSSE**

Modify `apps/server/src/ai/langgraph/threads.controller.ts`：

(a) streamRun 的 `setSseWriter`（line 245-247，当前 `record.setSseWriter(event => { writeSSE(res, event.event, event.data); });`）：
```ts
            // 桥接 writeSSE → record.emitEvent，使 SSE 事件同时写入 EventStore；透传 seq 写 id: 行
            record.setSseWriter(sseEvent => {
                writeSSE(res, sseEvent.event, sseEvent.data, sseEvent.seq);
            });
```

(b) joinStream 的 sink.push（line 311-314，当前 `push: (event: RunStreamEvent) => { writeSSE(res, event.eventType, event.payload); },`）：
```ts
            push: (event: RunStreamEvent) => {
                writeSSE(res, event.eventType, event.payload, event.seq);
            },
```

- [ ] **Step 6: 后端 AI 全量回归**

Run:
```bash
cd /d/projects/my-km/apps/server && pnpm exec jest src/ai --runInBand 2>&1 | tail -8
```
Expected: PASS —— 含新增 langgraph-protocol/run-record 测试，原 18 suites/240 passed 基线不破（总数 +2 suites）。若 `threads.controller.spec.ts` 有断言 SSE 内容的用例需同步更新（搜 `event:`/`data:` 字面量断言），按报错调整。

- [ ] **Step 7: 提交**

```bash
cd /d/projects/my-km && git add apps/server/src/ai/run/run-record.ts apps/server/src/ai/langgraph/threads.controller.ts apps/server/src/ai/run/__tests__/run-record.spec.ts && git commit -m "feat(ai): thread seq through sseWriter to SSE id: line (P2-5)"
```

---

## Task 3: 前端 SSE 解析器 sse-stream.ts

**Files:**
- Create: `apps/web/src/features/ai/sdk/sse-stream.ts`
- Create: `apps/web/src/features/ai/sdk/__tests__/sse-stream.test.ts`

- [ ] **Step 1: 写失败测试（解析 event/data/id 行）**

Create `apps/web/src/features/ai/sdk/__tests__/sse-stream.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { fetchSSE } from '../sse-stream';

/** 用给定 SSE 文本块构造一个伪 ReadableStream Response。 */
function mockSSEResponse(chunks: string[], ok = true, status = 200): Response {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
        start(controller) {
            for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
            controller.close();
        },
    });
    return {
        ok,
        status,
        body: stream,
    } as Response;
}

describe('fetchSSE', () => {
    it('parses event / data / id lines and yields {event, data, seq}', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            mockSSEResponse([
                'event: metadata\nid: 0\ndata: {"run_id":"run-1"}\n\n',
                'event: values\nid: 1\ndata: {"messages":[]}\n\n',
            ]),
        );

        const events = [];
        for await (const e of fetchSSE('http://x/api', {})) events.push(e);

        expect(events).toEqual([
            { event: 'metadata', data: { run_id: 'run-1' }, seq: 0 },
            { event: 'values', data: { messages: [] }, seq: 1 },
        ]);
    });

    it('handles multi-line data and missing id (seq undefined)', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            mockSSEResponse(['data: {"a":1}\ndata: {"b":2}\n\n']),
        );
        const events = [];
        for await (const e of fetchSSE('http://x', {})) events.push(e);
        expect(events).toEqual([{ event: 'message', data: { a: 1 }, seq: undefined }]);
        // 注：本解析器 data 多行时取首行 JSON；后端 writeSSE 单行 data，此用例验证不崩溃。
    });

    it('handles chunks split across read boundaries', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            mockSSEResponse(['event: met', 'adata\nid: 0\ndata: {"x":1}\n\n']),
        );
        const events = [];
        for await (const e of fetchSSE('http://x', {})) events.push(e);
        expect(events).toEqual([{ event: 'metadata', data: { x: 1 }, seq: 0 }]);
    });

    it('throws on non-ok response', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockSSEResponse([], false, 500));
        await expect(fetchSSE('http://x', {}).next()).rejects.toThrow(/500/);
    });

    it('passes Accept header and init through', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockSSEResponse(['data: {}\n\n']));
        const ac = new AbortController();
        await fetchSSE('http://x', { method: 'POST', body: '{}', signal: ac.signal }).next();
        expect(fetchSpy).toHaveBeenCalledWith(
            'http://x',
            expect.objectContaining({
                method: 'POST',
                headers: expect.objectContaining({ Accept: 'text/event-stream' }),
                signal: ac.signal,
            }),
        );
    });
});

afterEach(() => vi.restoreAllMocks());
```

**注：** Step 1 的 "handles multi-line data" 用例简化为只取首行 JSON。若你实现时选择拼接多行 data（更标准），请同步调整此用例断言为拼接结果。两种皆可，**实现与测试保持一致即可**。

- [ ] **Step 2: 运行测试，确认 FAIL**

Run:
```bash
cd /d/projects/my-km/apps/web && pnpm exec vitest run src/features/ai/sdk/__tests__/sse-stream.test.ts 2>&1 | tail -15
```
Expected: FAIL —— `sse-stream.ts` 不存在，import 报错。

- [ ] **Step 3: 实现 sse-stream.ts**

Create `apps/web/src/features/ai/sdk/sse-stream.ts`:

```ts
/**
 * SSE 解析器：fetch + ReadableStream + TextDecoder，产出 { event, data, seq? }。
 *
 * 用于 owner 的 runs.stream（POST）与重连的 runs.joinStream（GET）。SDK Client 不解析
 * SSE 标准 `id:` 行，故需自 fetch 以拿到 seq（spec 3.4/3.5 重连去重锚）。
 *
 * 解析规则（SSE 规范子集）：
 *   - 以空行（\n\n）分隔事件块
 *   - `event:` 行 → event 名（默认 'message'）
 *   - `data:` 行 → data（JSON.parse，失败保留原字符串）
 *   - `id:` 行 → seq（parseInt，NaN 时忽略）
 */

export interface ParsedSSEEvent {
    event: string;
    data: unknown;
    seq?: number;
}

export async function* fetchSSE(
    url: string,
    init: RequestInit,
): AsyncGenerator<ParsedSSEEvent> {
    const res = await fetch(url, {
        ...init,
        headers: { Accept: 'text/event-stream', ...(init.headers ?? {}) },
    });
    if (!res.ok || !res.body) {
        throw new Error(`SSE request failed: ${res.status}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    try {
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const blocks = buffer.split('\n\n');
            buffer = blocks.pop() ?? '';
            for (const block of blocks) {
                const parsed = parseSSEBlock(block);
                if (parsed) yield parsed;
            }
        }
        if (buffer.trim()) {
            const parsed = parseSSEBlock(buffer);
            if (parsed) yield parsed;
        }
    } finally {
        reader.releaseLock();
    }
}

function parseSSEBlock(block: string): ParsedSSEEvent | null {
    let event = 'message';
    let dataStr = '';
    let seq: number | undefined;

    for (const line of block.split('\n')) {
        if (line.startsWith('event:')) {
            event = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
            dataStr += line.slice(5).trim();
        } else if (line.startsWith('id:')) {
            const n = Number.parseInt(line.slice(3).trim(), 10);
            if (Number.isFinite(n)) seq = n;
        }
    }

    if (dataStr === '' && event === 'message' && seq === undefined) return null;

    let data: unknown = dataStr;
    if (dataStr) {
        try {
            data = JSON.parse(dataStr);
        } catch {
            data = dataStr;
        }
    }
    return { event, data, seq };
}
```

- [ ] **Step 4: 运行测试，确认 PASS**

Run:
```bash
cd /d/projects/my-km/apps/web && pnpm exec vitest run src/features/ai/sdk/__tests__/sse-stream.test.ts 2>&1 | tail -12
```
Expected: PASS —— 5 个测试全绿。若 "multi-line data" 用例失败，按 Step 1 注调整该用例断言以匹配实现（实现单行取首行）。

- [ ] **Step 5: 提交**

```bash
cd /d/projects/my-km && git add apps/web/src/features/ai/sdk/sse-stream.ts apps/web/src/features/ai/sdk/__tests__/sse-stream.test.ts && git commit -m "feat(ai): add fetch-based SSE parser with seq (id line) (P2-5)"
```

---

## Task 4: 前端类型扩展（ConnectionPhase / snapshot / client 契约）

**Files:**
- Modify: `apps/web/src/features/ai/langgraph/types.ts`

- [ ] **Step 1: 扩展 types.ts**

Modify `apps/web/src/features/ai/langgraph/types.ts`：

(a) 顶部加 `ConnectionPhase` + `LangGraphRunSummary` 类型（在 `LangGraphRawMessage` 之前）：

```ts
/** spec 5.2 连接态状态机六态 */
export type ConnectionPhase =
    | 'idle'
    | 'loading'
    | 'ready'
    | 'streaming'
    | 'paused'
    | 'reconnecting';

/** runs.list 返回的 run 摘要（后端 RunDto 子集，前端只关心 id + status） */
export interface LangGraphRunSummary {
    id: string;
    status: string;
}
```

(b) `LangGraphStreamEvent` 加 `seq`（当前 line 38-42）：

```ts
export interface LangGraphStreamEvent {
    id?: string;
    event: string;
    data: unknown;
    /** per-run 单调递增序号，重连去重锚（spec 3.5，后端 SSE id: 行透传） */
    seq?: number;
}
```

(c) `LangGraphChatSnapshot` 加 `connectionPhase` + `lastSeq`（当前 line 28-36）：

```ts
export interface LangGraphChatSnapshot {
    messages: LangGraphChatMessage[];
    isStreaming: boolean;
    isLastMessageStreaming: boolean;
    error: string | null;
    threadId: string | null;
    runId: string | null;
    interrupt: LangGraphToolInterrupt | null;
    /** spec 5.2 连接态 */
    connectionPhase: ConnectionPhase;
    /** 最近一次确认的 seq，重连 since=lastSeq 锚（spec 5.3/5.4） */
    lastSeq: number;
}
```

(d) `LangGraphRuntimeClient` 加 `runs.joinStream` + `runs.list`（当前 line 54-67）：

```ts
export interface LangGraphRuntimeClient {
    threads: {
        create(): Promise<{ thread_id: string }>;
        getState?(threadId: string): Promise<{ values?: { messages?: LangGraphRawMessage[] } }>;
    };
    runs: {
        stream(
            threadId: string,
            assistantId: string,
            payload?: LangGraphRunsStreamPayload,
        ): AsyncIterable<LangGraphStreamEvent>;
        /** GET /api/threads/:tid/runs/:rid/stream?since —— 回放 + 续实时（spec 3.5） */
        joinStream(
            threadId: string,
            runId: string,
            since?: number,
        ): AsyncIterable<LangGraphStreamEvent>;
        /** GET /api/threads/:tid/runs —— 列 run（查活跃 run，spec 5.3） */
        list(threadId: string): Promise<LangGraphRunSummary[]>;
        cancel(threadId: string, runId: string, wait?: boolean, action?: string): Promise<void>;
    };
}
```

- [ ] **Step 2: type-check 确认类型改动不破坏现有引用**

Run:
```bash
cd /d/projects/my-km/apps/web && pnpm run type-check 2>&1 | tail -15
```
Expected: 出现 `runtime-factory.ts`（`createLangGraphRuntimeClient` 返回的 client 缺 `joinStream`/`list`）+ `chat-runtime.ts`（snapshot 缺 `connectionPhase`/`lastSeq`）相关错误。这些由 Task 5/6/7 修复。**记录但暂不修复**，确认错误仅来自本 task 新增的必填字段（无其他意外破坏）。

- [ ] **Step 3: 提交**

```bash
cd /d/projects/my-km && git add apps/web/src/features/ai/langgraph/types.ts && git commit -m "feat(ai): add ConnectionPhase/lastSeq + client joinStream/list contract (P2-5)"
```

---

## Task 5: 前端 runtime-http-client（自 fetch stream/joinStream/list）

**Files:**
- Create: `apps/web/src/features/ai/sdk/runtime-http-client.ts`
- Create: `apps/web/src/features/ai/sdk/__tests__/runtime-http-client.test.ts`
- Modify: `apps/web/src/features/ai/langgraph/runtime-factory.ts`

- [ ] **Step 1: 写失败测试（joinStream/list/stream 自 fetch）**

Create `apps/web/src/features/ai/sdk/__tests__/runtime-http-client.test.ts`:

```ts
import { describe, expect, it, vi, afterEach } from 'vitest';
import { createLangGraphRuntimeClient } from '../runtime-http-client';
import type { LangGraphStreamEvent } from '../../langgraph/types';

function sseBody(blocks: string[]): Response {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
        start(c) {
            for (const b of blocks) c.enqueue(encoder.encode(b));
            c.close();
        },
    });
    return { ok: true, status: 200, body: stream } as Response;
}

function jsonBody(data: unknown): Response {
    return {
        ok: true,
        status: 200,
        body: null,
        json: async () => data,
    } as Response;
}

describe('runtime-http-client', () => {
    afterEach(() => vi.restoreAllMocks());

    it('list GETs /threads/:tid/runs and returns summaries', async () => {
        const fetchSpy = vi
            .spyOn(globalThis, 'fetch')
            .mockResolvedValue(jsonBody([{ id: 'run-1', status: 'running' }]));
        const client = createLangGraphRuntimeClient();
        const runs = await client.runs.list('thread-1');
        expect(runs).toEqual([{ id: 'run-1', status: 'running' }]);
        expect(fetchSpy).toHaveBeenCalledWith(
            expect.stringContaining('/threads/thread-1/runs'),
            expect.objectContaining({ method: 'GET' }),
        );
    });

    it('joinStream GETs stream endpoint with since query', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            sseBody(['event: values\nid: 5\ndata: {"messages":[]}\n\n']),
        );
        const client = createLangGraphRuntimeClient();
        const events: LangGraphStreamEvent[] = [];
        for await (const e of client.runs.joinStream('thread-1', 'run-1', 5)) events.push(e);
        expect(events).toEqual([{ event: 'values', data: { messages: [] }, seq: 5 }]);
        expect(fetchSpy).toHaveBeenCalledWith(
            expect.stringContaining('/threads/thread-1/runs/run-1/stream?since=5'),
            expect.any(Object),
        );
    });

    it('stream POSTs runs/stream and maps payload to body', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            sseBody(['event: end\nid: 0\ndata: {}\n\n']),
        );
        const client = createLangGraphRuntimeClient();
        const events: LangGraphStreamEvent[] = [];
        for await (const e of client.runs.stream('thread-1', 'default', {
            input: { messages: [{ type: 'human', content: 'hi' }] },
            multitaskStrategy: 'reject',
        })) events.push(e);
        expect(events).toEqual([{ event: 'end', data: {}, seq: 0 }]);
        const [, init] = fetchSpy.mock.calls[0];
        expect(init).toMatchObject({
            method: 'POST',
            body: JSON.stringify({
                input: { messages: [{ type: 'human', content: 'hi' }] },
                multitask_strategy: 'reject',
            }),
        });
    });

    it('cancel POSTs the cancel endpoint', async () => {
        const fetchSpy = vi
            .spyOn(globalThis, 'fetch')
            .mockResolvedValue({ ok: true, status: 200 } as Response);
        const client = createLangGraphRuntimeClient();
        await client.runs.cancel('thread-1', 'run-1', false);
        expect(fetchSpy).toHaveBeenCalledWith(
            expect.stringContaining('/threads/thread-1/runs/run-1/cancel'),
            expect.objectContaining({ method: 'POST' }),
        );
    });
});
```

- [ ] **Step 2: 运行测试，确认 FAIL**

Run:
```bash
cd /d/projects/my-km/apps/web && pnpm exec vitest run src/features/ai/sdk/__tests__/runtime-http-client.test.ts 2>&1 | tail -15
```
Expected: FAIL —— `runtime-http-client.ts` 不存在。

- [ ] **Step 3: 实现 runtime-http-client.ts**

Create `apps/web/src/features/ai/sdk/runtime-http-client.ts`:

```ts
/**
 * LangGraph Runtime HTTP Client —— 实现 LangGraphRuntimeClient。
 *
 * - runs.stream（POST /runs/stream，owner 发起）、runs.joinStream（GET /runs/:rid/stream，重连）、
 *   runs.list（GET /runs）、runs.cancel（POST /runs/:rid/cancel）：自 fetch（list/cancel JSON，stream/joinStream 经 sse-stream 解析拿 seq）。
 * - threads.create / threads.getState：透传 @langchain/langgraph-sdk Client（无需 seq）。
 *
 * 替代 runtime-factory 旧实现里 `createLangGraphClient() as unknown as LangGraphRuntimeClient`
 * 的强转 —— 旧实现无法提供 joinStream/list/seq。
 */
import { createLangGraphClient, LANGGRAPH_API_URL } from './langgraph-client';
import { fetchSSE } from './sse-stream';
import type { Client } from '@langchain/langgraph-sdk';
import type {
    LangGraphRuntimeClient,
    LangGraphRunsStreamPayload,
    LangGraphRunSummary,
    LangGraphStreamEvent,
} from '../langgraph/types';

export function createLangGraphRuntimeClient(): LangGraphRuntimeClient {
    const sdk: Client = createLangGraphClient();
    const base = LANGGRAPH_API_URL.replace(/\/$/, '');

    return {
        threads: {
            create: () => sdk.threads.create(),
            getState: (threadId: string) => sdk.threads.getState(threadId),
        },
        runs: {
            stream: (threadId, _assistantId, payload) =>
                streamRunHttp(base, threadId, payload),
            joinStream: (threadId, runId, since) =>
                joinStreamHttp(base, threadId, runId, since),
            list: (threadId: string) => listRunsHttp(base, threadId),
            cancel: async (threadId, runId, _wait, _action) => {
                // 后端 POST /api/threads/:tid/runs/:rid/cancel（无 body，忽略 wait/action）
                const res = await fetch(`${base}/threads/${threadId}/runs/${runId}/cancel`, {
                    method: 'POST',
                });
                if (!res.ok) throw new Error(`cancel failed: ${res.status}`);
            },
        },
    };
}

async function* streamRunHttp(
    base: string,
    threadId: string,
    payload?: LangGraphRunsStreamPayload,
): AsyncGenerator<LangGraphStreamEvent> {
    const body = toRunsStreamBody(payload);
    yield* fetchSSE(`${base}/threads/${threadId}/runs/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: payload?.signal,
    });
}

async function* joinStreamHttp(
    base: string,
    threadId: string,
    runId: string,
    since?: number,
): AsyncGenerator<LangGraphStreamEvent> {
    const query = since !== undefined ? `?since=${since}` : '';
    yield* fetchSSE(`${base}/threads/${threadId}/runs/${runId}/stream${query}`, {
        method: 'GET',
    });
}

async function listRunsHttp(base: string, threadId: string): Promise<LangGraphRunSummary[]> {
    const res = await fetch(`${base}/threads/${threadId}/runs`, { method: 'GET' });
    if (!res.ok) throw new Error(`listRuns failed: ${res.status}`);
    const runs = (await res.json()) as Array<{ id: string; status: string }>;
    return runs.map(r => ({ id: r.id, status: r.status }));
}

/** 前端 payload（camelCase）→ 后端 RunsStreamBody（snake_case multitask_strategy） */
function toRunsStreamBody(payload?: LangGraphRunsStreamPayload): Record<string, unknown> {
    const body: Record<string, unknown> = {};
    if (payload?.input !== undefined) body.input = payload.input;
    if (payload?.command !== undefined) body.command = payload.command;
    if (payload?.context !== undefined) body.context = payload.context;
    if (payload?.multitaskStrategy !== undefined) {
        body.multitask_strategy = payload.multitaskStrategy;
    }
    return body;
}
```

- [ ] **Step 4: 运行测试，确认 PASS**

Run:
```bash
cd /d/projects/my-km/apps/web && pnpm exec vitest run src/features/ai/sdk/__tests__/runtime-http-client.test.ts 2>&1 | tail -12
```
Expected: PASS —— 3 个测试全绿。

- [ ] **Step 5: runtime-factory 切换到 http client（去 as unknown 强转）**

Modify `apps/web/src/features/ai/langgraph/runtime-factory.ts`，替换 import 与 `createLangGraphRuntimeClient`（当前 line 1, 13, 22-25）：

import 行改：
```ts
import { createLangGraphRuntimeClient } from '@/features/ai/sdk/runtime-http-client';
```
删除原 `import { createLangGraphClient } from '@/features/ai/sdk/langgraph-client';`（若仅此处用；若其他地方仍用则保留）。

删除原 `createLangGraphRuntimeClient` 函数（line 22-25，即 `const client = createLangGraphClient(); return client as unknown as LangGraphRuntimeClient;`），改为直接 re-export：
```ts
export { createLangGraphRuntimeClient } from '@/features/ai/sdk/runtime-http-client';
```
并删除 `import type { LangGraphRuntimeClient } from './types';`（若不再被 factory 使用）。

> **执行注意：** 先 `grep -n "createLangGraphClient\|LangGraphRuntimeClient" apps/web/src/features/ai/langgraph/runtime-factory.ts` 确认改动后无未使用 import（否则 type-check 报 unused）。runtime-factory 最终仅保留 `createDefaultLangGraphChatRuntime` + re-export `createLangGraphRuntimeClient`。

- [ ] **Step 6: 提交**

```bash
cd /d/projects/my-km && git add apps/web/src/features/ai/sdk/runtime-http-client.ts apps/web/src/features/ai/sdk/__tests__/runtime-http-client.test.ts apps/web/src/features/ai/langgraph/runtime-factory.ts && git commit -m "feat(ai): http runtime client with joinStream/list/stream+seq (P2-5)"
```

---

## Task 6: connectionPhase 状态机骨架 + lastSeq 跟踪 + isStreaming 派生

**Files:**
- Modify: `apps/web/src/features/ai/langgraph/chat-runtime.ts`
- Modify: `apps/web/src/features/ai/langgraph/__tests__/chat-runtime.test.ts`

本 task 引入 `connectionPhase` 字段 + `isStreaming` 派生 + `lastSeq` 跟踪，**先不接 openThread 三段式 / 重连**（Task 7/8），仅让现有 `sendMessage`/`runStream` 路径驱动 phase（ready→streaming→ready），保证现有测试通过。

- [ ] **Step 1: 写失败测试（phase 随 runStream 转换 + lastSeq 跟踪）**

在 `apps/web/src/features/ai/langgraph/__tests__/chat-runtime.test.ts` 的 `describe('LangGraphChatRuntime')` 末尾（闭合 `});` 之前）追加：

```ts
    it('tracks connectionPhase: ready → streaming → ready through runStream', async () => {
        const client = createClient([
            [
                { event: 'metadata', data: { run_id: 'run-1', thread_id: 'thread-1' } },
                { event: 'values', data: { messages: [{ id: 'ai-1', type: 'ai', content: 'Hi' }] } },
                { event: 'end', data: {} },
            ],
        ]);
        const runtime = new LangGraphChatRuntime({ client, toolExecutor: { dispatch: vi.fn() } });

        expect(runtime.getSnapshot().connectionPhase).toBe('idle');
        expect(runtime.getSnapshot().lastSeq).toBe(0);

        const promise = runtime.sendMessage('Hi');
        await vi.waitFor(() => expect(runtime.getSnapshot().connectionPhase).toBe('streaming'));
        expect(runtime.getSnapshot().isStreaming).toBe(true); // 派生：streaming → true
        await promise;

        expect(runtime.getSnapshot().connectionPhase).toBe('ready');
        expect(runtime.getSnapshot().isStreaming).toBe(false);
    });

    it('updates lastSeq from inbound events carrying seq', async () => {
        const client: LangGraphRuntimeClient = {
            threads: { create: vi.fn(async () => ({ thread_id: 'thread-1' })), getState: vi.fn() },
            runs: {
                stream: async function* () {
                    yield { event: 'metadata', data: { run_id: 'run-1' }, seq: 0 };
                    yield { event: 'values', data: { messages: [] }, seq: 3 };
                    yield { event: 'end', data: {}, seq: 5 };
                },
                joinStream: async function* () {},
                list: vi.fn(async () => []),
                cancel: vi.fn(async () => {}),
            },
        };
        const runtime = new LangGraphChatRuntime({ client, toolExecutor: { dispatch: vi.fn() } });
        await runtime.sendMessage('Hi');
        expect(runtime.getSnapshot().lastSeq).toBe(5);
    });
```

同时更新现有测试里对初始 snapshot 的隐式假设（若有断言 `isStreaming` 初值仍为 `false` 则无需改）。`SERVER_SNAPSHOT`（use-langgraph-stream.ts）缺 `connectionPhase`/`lastSeq` —— Task 9 统一处理；本 task 测试直接用 `LangGraphChatRuntime`，不经过 hook，故暂不影响。

- [ ] **Step 2: 运行测试，确认 FAIL**

Run:
```bash
cd /d/projects/my-km/apps/web && pnpm exec vitest run src/features/ai/langgraph/__tests__/chat-runtime.test.ts 2>&1 | tail -15
```
Expected: FAIL —— `connectionPhase` 为 `undefined`（snapshot 未含字段），`lastSeq` 未更新。

- [ ] **Step 3: 实现 phase 状态机骨架 + lastSeq 跟踪**

Modify `apps/web/src/features/ai/langgraph/chat-runtime.ts`：

(a) import 加 `ConnectionPhase`（line 5-13 的 type import 块）：
```ts
import type {
    ConnectionPhase,
    LangGraphChatRuntimeApi,
    LangGraphChatRuntimeOptions,
    LangGraphChatSnapshot,
    LangGraphRawMessage,
    LangGraphRunsStreamPayload,
    LangGraphStreamEvent,
    LangGraphToolInterrupt,
} from './types';
```

(b) `EMPTY_SNAPSHOT` 加两字段（line 17-25）：
```ts
const EMPTY_SNAPSHOT: LangGraphChatSnapshot = {
    messages: [],
    isStreaming: false,
    isLastMessageStreaming: false,
    error: null,
    threadId: null,
    runId: null,
    interrupt: null,
    connectionPhase: 'idle',
    lastSeq: 0,
};
```

(c) `updateSnapshot` 改为按 `connectionPhase` 派生 `isStreaming`（替换当前 line 277-290）：
```ts
    private updateSnapshot(patch: Partial<LangGraphChatSnapshot>): void {
        const nextPhase = patch.connectionPhase ?? this.snapshot.connectionPhase;
        const nextMessages = patch.messages ?? this.snapshot.messages;
        const nextLastSeq = patch.lastSeq ?? this.snapshot.lastSeq;
        const nextIsStreaming =
            patch.isStreaming ?? (nextPhase === 'streaming' || nextPhase === 'reconnecting');
        this.snapshot = {
            ...this.snapshot,
            ...patch,
            connectionPhase: nextPhase,
            lastSeq: nextLastSeq,
            messages: nextMessages,
            isStreaming: nextIsStreaming,
            isLastMessageStreaming:
                nextIsStreaming &&
                nextMessages.length > 0 &&
                nextMessages[nextMessages.length - 1].role === 'ai',
        };
        this._onDidChange.fire();
    }
```

(d) 新增 `setPhase` 助手 + `trackSeq` 助手（放在 `updateSnapshot` 之后）：
```ts
    private setPhase(phase: ConnectionPhase): void {
        this.updateSnapshot({ connectionPhase: phase });
    }

    /** 记录入站事件的 seq（单调取大），作为重连 since 锚（spec 5.3/5.4） */
    private trackSeq(seq: number | undefined): void {
        if (seq !== undefined && seq > this.snapshot.lastSeq) {
            this.updateSnapshot({ lastSeq: seq });
        }
    }
```

(e) `runStream` 用 phase 驱动（替换当前 line 132-162）：
```ts
    private async runStream(
        threadId: string,
        payload: Omit<LangGraphRunsStreamPayload, 'streamMode' | 'signal'>,
    ): Promise<void> {
        const abortController = new AbortController();
        this.currentAbortController = abortController;
        this.setPhase('streaming');
        this.updateSnapshot({ error: null });

        try {
            const stream = this.client.runs.stream(threadId, this.assistantId, {
                ...payload,
                streamMode: STREAM_MODE,
                signal: abortController.signal,
            });

            for await (const event of stream) {
                await this.handleStreamEvent(event);
            }
            // 流正常结束（end/error 事件已处理 phase）—— 若仍是 streaming，落 ready
            if (this.snapshot.connectionPhase === 'streaming') {
                this.setPhase('ready');
            }
        } catch (error) {
            if (!abortController.signal.aborted) {
                this.updateSnapshot({
                    error: error instanceof Error ? error.message : String(error),
                });
            }
            if (this.snapshot.connectionPhase !== 'paused') {
                this.setPhase('ready');
            }
        } finally {
            if (this.currentAbortController === abortController) {
                this.currentAbortController = null;
            }
        }
    }
```

(f) `handleStreamEvent` 入口 trackSeq（替换当前 line 164-188，在 switch 前加 trackSeq；end/error 事件驱动 phase）：
```ts
    private async handleStreamEvent(event: LangGraphStreamEvent): Promise<void> {
        this.trackSeq(event.seq);
        switch (event.event) {
            case 'metadata':
                this.handleMetadata(event.data);
                return;
            case 'values':
                this.handleValues(event.data);
                return;
            case 'messages/partial':
            case 'messages/complete':
                this.handleMessageList(event.data);
                return;
            case 'messages':
                this.handleMessagesEvent(event.data);
                return;
            case 'tasks':
                await this.handleTaskEvent(event.data);
                return;
            case 'error':
                this.handleProtocolError(event.data);
                this.setPhase('ready');
                return;
            case 'end':
                this.setPhase('ready');
                return;
            default:
                return;
        }
    }
```

> **注意：** 原代码 `runStream` 的 finally 有 `this.updateSnapshot({ isStreaming: false, interrupt: null })`。新版改为 phase 驱动（streaming→ready）。但 interrupt 清空时机变化：原在 finally 清 `interrupt:null`。新版改为 phase=ready 时清 interrupt —— 在 `setPhase('ready')` 处补 `updateSnapshot({ interrupt: null })`，或保留 finally 清 interrupt。

(g) 修正：`setPhase('ready')` 顺便清 interrupt（避免遗留）。把 runStream 里两处 `this.setPhase('ready')` 与 handleStreamEvent 的 end/error 落 ready 改为统一调新私有方法：
```ts
    private finishRun(): void {
        this.updateSnapshot({ connectionPhase: 'ready', interrupt: null });
    }
```
然后把上面 (e)(f) 中所有 `this.setPhase('ready')` 替换为 `this.finishRun()`。

- [ ] **Step 4: 运行测试，确认 PASS**

Run:
```bash
cd /d/projects/my-km/apps/web && pnpm exec vitest run src/features/ai/langgraph/__tests__/chat-runtime.test.ts 2>&1 | tail -15
```
Expected: PASS —— 含原有 5 个 + 新增 2 个 phase/lastSeq 测试。

> **若现有 "stop() ... waits for SSE terminal" 测试失败**：该测试断言 `end{cancelled}` 后 `isStreaming:false`。新版 end 事件 → `finishRun()` → phase=ready → isStreaming 派生 false，应仍通过。若失败检查 `finishRun` 是否在 end 分支被调。

- [ ] **Step 5: 提交**

```bash
cd /d/projects/my-km && git add apps/web/src/features/ai/langgraph/chat-runtime.ts apps/web/src/features/ai/langgraph/__tests__/chat-runtime.test.ts && git commit -m "feat(ai): connectionPhase state machine + lastSeq tracking (P2-5)"
```

---

## Task 7: openThread 三段式（getState → list 活跃 run → joinStream）

**Files:**
- Modify: `apps/web/src/features/ai/langgraph/chat-runtime.ts`（`openThread`，当前 line 56-69）
- Modify: `apps/web/src/features/ai/langgraph/__tests__/chat-runtime.test.ts`

- [ ] **Step 1: 写失败测试（三段式：无活跃 run → ready；有活跃 run → joinStream streaming）**

在 `chat-runtime.test.ts` 末尾 `describe` 内追加：

```ts
    it('openThread: no active run → loading → ready', async () => {
        const client: LangGraphRuntimeClient = {
            threads: {
                create: vi.fn(),
                getState: vi.fn(async () => ({
                    values: { messages: [{ id: 'h-1', type: 'human', content: 'old' }] },
                })),
            },
            runs: {
                stream: async function* () {},
                joinStream: async function* () {},
                list: vi.fn(async () => [{ id: 'run-old', status: 'completed' }]),
                cancel: vi.fn(),
            },
        };
        const runtime = new LangGraphChatRuntime({ client, toolExecutor: { dispatch: vi.fn() } });

        await runtime.openThread('thread-1');

        expect(client.threads.getState).toHaveBeenCalledWith('thread-1');
        expect(client.runs.list).toHaveBeenCalledWith('thread-1');
        expect(runtime.getSnapshot().messages).toEqual([
            expect.objectContaining({ id: 'h-1', content: 'old' }),
        ]);
        expect(runtime.getSnapshot().connectionPhase).toBe('ready');
        expect(runtime.getSnapshot().threadId).toBe('thread-1');
    });

    it('openThread: active running run → joinStream since=0 → streaming', async () => {
        const joinEvents = [
            { event: 'metadata', data: { run_id: 'run-live', thread_id: 'thread-1' }, seq: 0 },
            { event: 'values', data: { messages: [{ id: 'ai-1', type: 'ai', content: 'live' }] }, seq: 2 },
        ];
        const client: LangGraphRuntimeClient = {
            threads: {
                create: vi.fn(),
                getState: vi.fn(async () => ({ values: { messages: [] } })),
            },
            runs: {
                stream: async function* () {},
                joinStream: vi.fn(async function* () {
                    for (const e of joinEvents) yield e;
                }),
                list: vi.fn(async () => [{ id: 'run-live', status: 'running' }]),
                cancel: vi.fn(),
            },
        };
        const runtime = new LangGraphChatRuntime({ client, toolExecutor: { dispatch: vi.fn() } });

        await runtime.openThread('thread-1');

        expect(client.runs.joinStream).toHaveBeenCalledWith('thread-1', 'run-live', 0);
        expect(runtime.getSnapshot().runId).toBe('run-live');
        expect(runtime.getSnapshot().lastSeq).toBe(2);
        // joinStream 流结束（无 end 事件）→ 终态落 ready（run 已不在 streaming）
        expect(runtime.getSnapshot().connectionPhase).toBe('ready');
    });
```

- [ ] **Step 2: 运行测试，确认 FAIL**

Run:
```bash
cd /d/projects/my-km/apps/web && pnpm exec vitest run src/features/ai/langgraph/__tests__/chat-runtime.test.ts 2>&1 | tail -15
```
Expected: FAIL —— 当前 `openThread` 不调 `runs.list`/`joinStream`，phase 不会变 ready（保持 idle/loading）。

- [ ] **Step 3: 实现 openThread 三段式**

Modify `apps/web/src/features/ai/langgraph/chat-runtime.ts`，替换 `openThread`（当前 line 56-69）：

```ts
    async openThread(threadId: string): Promise<void> {
        this.currentAbortController?.abort();
        this.handledToolCallIds.clear();
        this.updateSnapshot({
            ...EMPTY_SNAPSHOT,
            threadId,
            connectionPhase: 'loading',
        });

        // [1] 读 checkpoint，渲染历史消息（spec 5.3）
        const state = await this.client.threads.getState?.(threadId);
        const messages = state?.values?.messages;
        if (Array.isArray(messages)) {
            this.setMessages(messages);
        }

        // [2] 查活跃 run（status ∈ {running, interrupted}）
        const runs = await this.client.runs.list(threadId);
        const active = runs.find(
            r => r.status === 'running' || r.status === 'interrupted',
        );

        // [3] 有活跃 run → joinStream?since=0 回放+续实时；无 → ready
        if (active) {
            this.updateSnapshot({ runId: active.id });
            await this.joinActiveStream(threadId, active.id, 0);
        } else {
            this.setPhase('ready');
        }
    }
```

并新增 `joinActiveStream` 私有方法（放在 `runStream` 之后；它消费 joinStream，沿用 handleStreamEvent，终态落 ready）：

```ts
    /**
     * 消费 joinStream（openThread 三段式 / 自动重连）。沿用 handleStreamEvent 处理事件 +
     * trackSeq。流结束（无 end 事件，如 run 已终止或 SSE close）→ finishRun 落 ready。
     * 流抛错（网络断）→ 抛出交由调用方（重连逻辑，Task 8）处理。
     */
    private async joinActiveStream(
        threadId: string,
        runId: string,
        since: number,
    ): Promise<void> {
        this.setPhase('streaming');
        const stream = this.client.runs.joinStream(threadId, runId, since);
        try {
            for await (const event of stream) {
                await this.handleStreamEvent(event);
            }
            if (this.snapshot.connectionPhase === 'streaming') {
                this.finishRun();
            }
        } catch (error) {
            // 重连场景由调用方（autoReconnect）捕获并退避重试；此处重抛
            throw error;
        }
    }
```

- [ ] **Step 4: 运行测试，确认 PASS**

Run:
```bash
cd /d/projects/my-km/apps/web && pnpm exec vitest run src/features/ai/langgraph/__tests__/chat-runtime.test.ts 2>&1 | tail -12
```
Expected: PASS —— 新增 2 个三段式测试 + 既有测试全绿。

- [ ] **Step 5: 提交**

```bash
cd /d/projects/my-km && git add apps/web/src/features/ai/langgraph/chat-runtime.ts apps/web/src/features/ai/langgraph/__tests__/chat-runtime.test.ts && git commit -m "feat(ai): openThread three-phase (state → active run → joinStream) (P2-5)"
```

---

## Task 8: 自动重连（reconnecting 态 + 指数退避 + since=lastSeq）

**Files:**
- Modify: `apps/web/src/features/ai/langgraph/chat-runtime.ts`
- Modify: `apps/web/src/features/ai/langgraph/__tests__/chat-runtime.test.ts`

- [ ] **Step 1: 写失败测试（stream 抛错 → reconnecting → 重试 joinStream since=lastSeq → 成功）**

在 `chat-runtime.test.ts` 末尾追加：

```ts
    it('auto-reconnects on joinStream error with exponential backoff and since=lastSeq', async () => {
        // 首次 joinStream 抛错（网络断），第二次成功续上
        let joinCall = 0;
        const client: LangGraphRuntimeClient = {
            threads: { create: vi.fn(), getState: vi.fn(async () => ({ values: {} })) },
            runs: {
                stream: async function* () {},
                joinStream: vi.fn(async function* (tid, rid, since) {
                    joinCall += 1;
                    if (joinCall === 1) throw new Error('network drop');
                    // 第二次：补续事件，seq 从 lastSeq 之后
                    yield { event: 'values', data: { messages: [{ id: 'ai-2', type: 'ai', content: 'more' }] }, seq: since ?? 0 };
                    yield { event: 'end', data: {}, seq: (since ?? 0) + 1 };
                }),
                list: vi.fn(async () => [{ id: 'run-live', status: 'running' }]),
                cancel: vi.fn(),
            },
        };
        const runtime = new LangGraphChatRuntime({ client, toolExecutor: { dispatch: vi.fn() } });

        await runtime.openThread('thread-1'); // 首次 joinStream since=0 抛错 → 触发重连

        // 重连成功后最终落 ready（收到 end）
        await vi.waitFor(() => expect(runtime.getSnapshot().connectionPhase).toBe('ready'));
        expect(joinCall).toBe(2);
        // 第二次 joinStream 用 since=lastSeq（首次无事件，lastSeq=0）
        expect(client.runs.joinStream).toHaveBeenLastCalledWith('thread-1', 'run-live', 0);
    });
```

> **退避时序：** 重连间隔为指数退避。为避免测试真实等待，实现里退避延迟需可注入或足够小（≤10ms 起步）。测试用 `vi.waitFor` 容忍异步。若实现用 `vi.useFakeTimers`，测试需配合 `vi.advanceTimersByTimeAsync` —— **推荐实现用真实 setTimeout 但首延 ≤ 10ms**（简单、测试快）。

- [ ] **Step 2: 运行测试，确认 FAIL**

Run:
```bash
cd /d/projects/my-km/apps/web && pnpm exec vitest run src/features/ai/langgraph/__tests__/chat-runtime.test.ts 2>&1 | tail -15
```
Expected: FAIL —— 当前 `joinActiveStream` 抛错后无重连，openThread reject，phase 卡 loading/streaming。

- [ ] **Step 3: 实现自动重连**

Modify `apps/web/src/features/ai/langgraph/chat-runtime.ts`：

(a) 类顶部加重连配置常量（在 `STREAM_MODE` 之后）：
```ts
const RECONNECT_BASE_DELAY_MS = 10; // 起步延迟（小值便于测试/本地）
const RECONNECT_MAX_DELAY_MS = 5000;
const RECONNECT_MAX_ATTEMPTS = 5;
```

(b) 新增 `autoReconnect` 私有方法（放在 `joinActiveStream` 之后）：
```ts
    /**
     * 自动重连（spec 5.4）：joinStream 抛错（网络断，非用户 stop）→ phase=reconnecting
     * （保留已渲染 messages）→ 指数退避重试 joinStream?since=lastSeq → 成功回 streaming；
     * 达上限 → ready + error。
     */
    private async autoReconnect(threadId: string, runId: string): Promise<void> {
        for (let attempt = 0; attempt < RECONNECT_MAX_ATTEMPTS; attempt += 1) {
            this.setPhase('reconnecting');
            const delay = Math.min(
                RECONNECT_BASE_DELAY_MS * 2 ** attempt,
                RECONNECT_MAX_DELAY_MS,
            );
            await sleep(delay);
            try {
                await this.joinActiveStream(threadId, runId, this.snapshot.lastSeq);
                return; // 重连成功（joinActiveStream 已落 ready/streaming）
            } catch {
                // 继续退避重试
            }
        }
        // 达上限：放弃，落 ready + error
        this.updateSnapshot({
            connectionPhase: 'ready',
            interrupt: null,
            error: '连接断开，可重试',
        });
    }
```

(c) 顶层加 `sleep` helper（文件底部 `isRawMessage` 之后）：
```ts
function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}
```

(d) `openThread` 的 [3] 分支改用 `autoReconnect` 包装（替换 Task 7 step 3 的 `await this.joinActiveStream(...)`）：
```ts
        if (active) {
            this.updateSnapshot({ runId: active.id });
            try {
                await this.joinActiveStream(threadId, active.id, 0);
            } catch {
                await this.autoReconnect(threadId, active.id);
            }
        } else {
            this.setPhase('ready');
        }
```

> **注：** owner 的 `runStream`（sendMessage/resume 路径）网络断也应收敛到重连。为控制范围，本 task 先把 openThread→joinStream 路径接入重连；`runStream` 的 SSE 断开重连作为后续增强（见"本阶段不做"）。若要 `runStream` 也重连，在其 catch 分支（非 abort）调 `autoReconnect(threadId, runId)` —— 可选，**默认不做**（owner 断线概率低，且 runStream 重连语义需 runId 已知，sendMessage 首帧 metadata 前无 runId）。

- [ ] **Step 4: 运行测试，确认 PASS**

Run:
```bash
cd /d/projects/my-km/apps/web && pnpm exec vitest run src/features/ai/langgraph/__tests__/chat-runtime.test.ts 2>&1 | tail -12
```
Expected: PASS —— 含重连测试。

- [ ] **Step 5: 提交**

```bash
cd /d/projects/my-km && git add apps/web/src/features/ai/langgraph/chat-runtime.ts apps/web/src/features/ai/langgraph/__tests__/chat-runtime.test.ts && git commit -m "feat(ai): auto-reconnect with backoff and since=lastSeq (P2-5)"
```

---

## Task 9: paused 态（interrupt 期间 phase 标记）

**Files:**
- Modify: `apps/web/src/features/ai/langgraph/chat-runtime.ts`（`handleToolInterrupt`，当前 line 244-253）
- Modify: `apps/web/src/features/ai/langgraph/__tests__/chat-runtime.test.ts`

- [ ] **Step 1: 写失败测试（interrupt → paused，resume → streaming）**

在 `chat-runtime.test.ts` 末尾追加：

```ts
    it('enters paused phase during tool interrupt and returns to streaming on resume', async () => {
        const dispatch = vi.fn(async () => ({ success: true }));
        const client = createClient([
            [
                { event: 'metadata', data: { run_id: 'run-1', thread_id: 'thread-1' } },
                {
                    event: 'tasks',
                    data: {
                        id: 'task-1',
                        name: 'tools',
                        input: {},
                        triggers: [],
                        interrupts: [
                            {
                                id: 'i-1',
                                value: {
                                    tool_call_id: 'tc-1',
                                    tool_name: 'file_ops',
                                    args: { operation: 'create', path: 'a.km' },
                                },
                            },
                        ],
                    },
                },
            ],
            [
                { event: 'metadata', data: { run_id: 'run-2', thread_id: 'thread-1' } },
                { event: 'values', data: { messages: [{ id: 'ai-2', type: 'ai', content: 'Done' }] } },
                { event: 'end', data: {} },
            ],
        ]);
        const runtime = new LangGraphChatRuntime({ client, toolExecutor: { dispatch } });

        const phases: string[] = [];
        const sub = runtime.subscribe(() => phases.push(runtime.getSnapshot().connectionPhase));

        await runtime.sendMessage('Create note');

        // 至少出现过 paused（interrupt 期间）与最终 ready
        expect(phases).toContain('paused');
        expect(runtime.getSnapshot().connectionPhase).toBe('ready');
        sub.dispose();
    });
```

- [ ] **Step 2: 运行测试，确认 FAIL**

Run:
```bash
cd /d/projects/my-km/apps/web && pnpm exec vitest run src/features/ai/langgraph/__tests__/chat-runtime.test.ts 2>&1 | tail -12
```
Expected: FAIL —— 当前 `handleToolInterrupt` 不设 phase，phases 不含 'paused'。

- [ ] **Step 3: 实现 paused 标记**

Modify `apps/web/src/features/ai/langgraph/chat-runtime.ts`，替换 `handleToolInterrupt`（当前 line 244-253）：

```ts
    private async handleToolInterrupt(interrupt: LangGraphToolInterrupt): Promise<void> {
        if (this.handledToolCallIds.has(interrupt.toolCallId)) {
            return;
        }
        this.handledToolCallIds.add(interrupt.toolCallId);
        // spec 5.2：interrupt 期间 phase=paused（标记，保持 auto-dispatch；5.6 派生留 P4）
        this.updateSnapshot({ interrupt, connectionPhase: 'paused' });

        const result = await this.toolExecutor.dispatch(interrupt.toolName, interrupt.input);
        await this.resumeWithToolResult(interrupt.toolCallId, result);
    }
```

> `resumeWithToolResult` → `runStream` → `setPhase('streaming')`，故 resume 后自然回 streaming。`isStreaming` 在 paused 时为 false（派生：paused ∉ {streaming, reconnecting}）—— 符合 spec 5.2（paused 待用户操作，非生成中）。

- [ ] **Step 4: 运行测试，确认 PASS**

Run:
```bash
cd /d/projects/my-km/apps/web && pnpm exec vitest run src/features/ai/langgraph/__tests__/chat-runtime.test.ts 2>&1 | tail -12
```
Expected: PASS —— 含 paused 测试 + 既有 interrupt 测试（"executes task interrupts"、"does not execute twice"）仍绿（它们断言 dispatch 次数，不受 phase 影响）。

- [ ] **Step 5: 提交**

```bash
cd /d/projects/my-km && git add apps/web/src/features/ai/langgraph/chat-runtime.ts apps/web/src/features/ai/langgraph/__tests__/chat-runtime.test.ts && git commit -m "feat(ai): paused phase during tool interrupt (P2-5)"
```

---

## Task 10: hook 兼容 + 全量回归 + type-check + 构建

**Files:**
- Modify: `apps/web/src/hooks/use-langgraph-stream.ts`（`SERVER_SNAPSHOT` 补新字段）

- [ ] **Step 1: 补 SERVER_SNAPSHOT 字段**

Modify `apps/web/src/hooks/use-langgraph-stream.ts`，`SERVER_SNAPSHOT`（line 23-31）加两字段：

```ts
const SERVER_SNAPSHOT: LangGraphChatSnapshot = {
    messages: [],
    isStreaming: false,
    isLastMessageStreaming: false,
    error: null,
    threadId: null,
    runId: null,
    interrupt: null,
    connectionPhase: 'idle',
    lastSeq: 0,
};
```

> hook 其余逻辑零改动（`...snapshot` 自动含 `connectionPhase`/`lastSeq`；`UseLangGraphStreamReturn extends LangGraphChatSnapshot` 自动含新字段）。

- [ ] **Step 2: 前端全量 vitest**

Run:
```bash
cd /d/projects/my-km/apps/web && pnpm exec vitest run 2>&1 | tail -15
```
Expected: PASS —— 新增 sse-stream/runtime-http-client/chat-runtime 全绿。**已知预存失败**（welcome/AutoSaveService/platform command/monitor/file-system + editor block-lexical-converter type-check，main 基线即存在，与 P2-5 无关）除外。确认无新增失败。

- [ ] **Step 3: 前端 type-check**

Run:
```bash
cd /d/projects/my-km/apps/web && pnpm run type-check 2>&1 | tail -15
```
Expected: 仅预存的 editor block-lexical-converter 错误（main 基线即有）。确认无 P2-5 引入的新类型错误（`connectionPhase`/`lastSeq`/`joinStream`/`list`/`finishRun`/`autoReconnect` 等符号均解析）。

- [ ] **Step 4: 后端 AI 全量回归**

Run:
```bash
cd /d/projects/my-km/apps/server && pnpm exec jest src/ai src/config --runInBand 2>&1 | tail -8
```
Expected: PASS —— P2-3b 基线 18 suites/240 passed + Task 1/2 新增（langgraph-protocol + run-record 测试）。确认 SSE seq 透传未破坏 threads.controller.spec / ai.service.spec。

- [ ] **Step 5: 前端 build**

Run:
```bash
cd /d/projects/my-km/apps/web && pnpm run build 2>&1 | tail -15
```
Expected: 成功（或仅预存 type-check 错误若 build 含 tsc 则需先确认 P2-5 不引入新错）。`build-out.txt` 为旧产物可忽略。

- [ ] **Step 6: 提交（hook 兼容）**

```bash
cd /d/projects/my-km && git add apps/web/src/hooks/use-langgraph-stream.ts && git commit -m "feat(ai): hook SERVER_SNAPSHOT includes connectionPhase/lastSeq (P2-5)"
```

---

## 验收标准（本阶段）

- [ ] 后端 `writeSSE` 写 SSE 标准 `id: ${seq}` 行；`emitEvent`/`emitSSEOnly` 的 `sseWriter` 回调收 `{event,data,seq}`；`streamRun` + `joinStream` 两路 SSE 透传 seq
- [ ] 前端 `sse-stream.ts` 解析 `event:`/`data:`/`id:` 行，产出 `{event,data,seq?}`，处理跨 chunk 边界、非 ok 抛错
- [ ] `runtime-http-client.ts` 实现 `LangGraphRuntimeClient`：`runs.stream`（POST）/`joinStream`（GET ?since）/`list`（GET）自 fetch + 解析 seq；`threads.create/getState`/`runs.cancel` 透传 SDK；`runtime-factory` 去 `as unknown` 强转
- [ ] `connectionPhase` 6 态状态机：`idle→loading→(ready|streaming)`、`streaming→(ready|paused|reconnecting)`、`paused→streaming`、`reconnecting→(streaming|ready)`
- [ ] `isStreaming` 派生（`phase∈{streaming,reconnecting}`），hook 与 snapshot 消费方零改动
- [ ] `lastSeq` 随入站事件 seq 单调更新；`openThread` 首次 `since=0`，重连 `since=lastSeq`
- [ ] `openThread` 三段式：getState 渲染历史 → `runs.list` 取首个 `running/interrupted` → 有则 `joinStream?since=0`、无则 ready（解决缺陷 #9）
- [ ] 自动重连：joinStream 抛错 → `reconnecting`（保留 messages）→ 指数退避重试 → 成功回 streaming / 达上限 ready+error
- [ ] `paused`：`handleToolInterrupt` 进入 paused，`resumeWithToolResult`→`runStream` 回 streaming
- [ ] 前端 vitest（P2-5 新增 + chat-runtime 全绿）+ type-check（无新错）+ 后端 jest（src/ai src/config 绿）+ build 通过

## 本阶段不做（留给后续）

- **spec 5.5（6-atom 拆分）**：snapshot 仍为扁平 + 单 Emitter，留 P4
- **spec 5.6（interrupt 派生重写）**：interrupt 仍存储 + Set 去重，paused 仅 phase 标记，留 P4
- **spec 5.7（工具卡片视觉）**：design-first，需先补 Pencil 设计稿
- **spec 5.8（取消的 UI 终态视觉"正在停止/已停止"）**：phase 仍只到 ready
- **spec 5.9（编辑器上下文事件驱动）**：1s 轮询不动
- **owner `runStream`（sendMessage/resume）的 SSE 断开重连**：本阶段仅 openThread→joinStream 路径接重连；runStream 断线重连需 runId 已知（首帧 metadata 前），留后续
- **跨副本 cancel 转发**（spec 6.4，P3）、SSE 心跳（spec 3.9）、cancel 端点 user 隔离（spec 6.2，P5）
- **listRuns 的 traceparent/auth 注入**：http client 用默认 fetch；若部署需 auth header，在 runtime-http-client 统一加（后续）

## 如何验证完整重连（部署级，非 CI）

单测用 mock client/stream 覆盖三段式 + 重连。端到端验证需真实后端：
1. 发起 run（POST /runs/stream），AI 生成中刷新页面（触发 openThread）→ 应自动 joinStream 接上正在跑的 run，看到实时 token（缺陷 #9 修复）。
2. 生成中模拟断网（DevTools Network offline）→ 断线条（reconnecting）→ 恢复网络 → 自动重连续上，messages 不丢失重复。
3. 后端 SSE 抓包确认 `id: ${seq}` 行存在；前端 DevTools Network → EventStream 看到 seq。
4. interrupt（工具确认）期间 phase=paused，输入框可用性符合预期（isStreaming=false）。
