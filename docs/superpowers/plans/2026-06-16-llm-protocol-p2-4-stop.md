# LLM 对话协议重构 P2-4：stop 信号统一 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 统一 stop 信号语义（spec 3.7）：前端 `stop()` 只调 `POST /runs/:rid/cancel`，**不** abort 本地 fetch、**不**立即清 `isStreaming` —— 等 SSE 自然收到 `end{finish_reason:'cancelled'}` 终态后由 `runStream` 的 `finally` 落定状态。本地 fetch 的 abort 仅保留组件卸载（`dispose`）场景。

**Architecture:** 改动集中在 `LangGraphChatRuntime.stop()`（`apps/web/src/features/ai/langgraph/chat-runtime.ts`）：去掉 `currentAbortController.abort()` 与立即 `isStreaming:false`，只保留 `client.runs.cancel(...)` 调用。`runStream` 的 `for await` 循环继续消费 SSE，直到后端（P1 已实现）的 cancelled 路径写出 `end{cancelled}` 并关闭流，`finally` 块将 `isStreaming` 置 false。后端 cancel→abort→`end{cancelled}`→释放 lease 链路 P1 已完成且有测试覆盖，本阶段**不碰后端**。

**Tech Stack:** vitest（`apps/web`，`pnpm test`）、TypeScript、`@langchain/langgraph-sdk` Client。无新依赖。

**Spec:** `docs/superpowers/specs/2026-06-15-llm-conversation-protocol-design.md` 第 3.7 节（stop 信号统一语义）。后端 cancelled 终态（`executeRunProtocol` 的 aborted 分支写 `end{finish_reason:'cancelled'}`）在 P1 已实现并测试（`ai.service.spec.ts:784-805, 959-968`），本阶段是前端协议对齐。

---

## 关键设计约束（实现时不可违背）

1. **stop() 只调 cancel，不 abort 本地 fetch**（spec 3.7）：去掉 `this.currentAbortController?.abort()`。abort fetch 会断 SSE 流，前端收不到 `end{cancelled}` 终态，违反"取消是有终态的"。
2. **stop() 不立即 isStreaming=false**：当前实现 `stop()` 立即 `updateSnapshot({ isStreaming:false })`，使 UI 在终态到达前就停止。改为等 `runStream` 的 `finally`（SSE 流自然结束）落定 —— 后端 cancel 后写 `end{cancelled}` 并关 SSE，`runStream` 的 `for await` 退出，`finally` 设 `isStreaming:false`。
3. **abort 仅保留 unmount 场景**：`dispose()`（组件卸载）保留 `currentAbortController.abort()`（现状不变），因为 UI 已消失，收不收终态无所谓，但要保证后端 run 继续到终态（PG 留痕）。`stop()`（用户主动）与 `dispose()`（卸载）职责分离。
4. **runId 缺失时不调 cancel**：`stop()` 仍 guard `if (threadId && runId)`（无活跃 run 时 no-op），与现状一致。
5. **本阶段边界**：纯前端。**不**碰后端（P1 cancel 终态已完成+测试）、**不**加"正在停止"UI 状态（spec 5.8 连接态状态机，P2-5/P4）、**不**做跨副本 cancel（P3）。`stop()` 的对外签名 `Promise<void>` 不变。

## File Structure

**修改：**
- `apps/web/src/features/ai/langgraph/chat-runtime.ts` — `stop()` 方法（去 abort + 去立即 isStreaming）
- `apps/web/src/features/ai/langgraph/__tests__/chat-runtime.test.ts` — 新增 `controllableStream` helper + stop 行为测试

**不改：**
- 后端 `ai.service.ts` / `runs.controller.ts` / `run-manager.ts`（P1 cancel 终态已完成）
- `use-langgraph-stream.ts`（`stop` 透传不变）

---

## Task 1: 前端 stop() 统一 + chat-runtime.test TDD

**Files:**
- Modify: `apps/web/src/features/ai/langgraph/__tests__/chat-runtime.test.ts`
- Modify: `apps/web/src/features/ai/langgraph/chat-runtime.ts`

- [ ] **Step 1: 在 spec 顶部加 controllableStream helper（供 stop 测试控制 SSE 时序）**

在 `apps/web/src/features/ai/langgraph/__tests__/chat-runtime.test.ts` 的 `createClient` 函数之后、`describe` 之前，加：

```ts
/**
 * 可控 SSE 流：push 入队事件，close 结束生成器。用于测试 stop() 时 runStream 处于
 * 进行中（stream 未结束）的场景 —— 固定数组的 streamOf 会立刻结束，无法测中途回调。
 */
function controllableStream() {
    const queue: LangGraphStreamEvent[] = [];
    const waiters: Array<() => void> = [];
    let closed = false;
    async function* gen(): AsyncGenerator<LangGraphStreamEvent> {
        for (;;) {
            while (queue.length > 0) {
                yield queue.shift() as LangGraphStreamEvent;
            }
            if (closed) return;
            await new Promise<void>(resolve => waiters.push(resolve));
        }
    }
    return {
        gen,
        push(event: LangGraphStreamEvent) {
            queue.push(event);
            const waiter = waiters.shift();
            if (waiter) waiter();
        },
        close() {
            closed = true;
            const waiter = waiters.shift();
            if (waiter) waiter();
        },
    };
}
```

- [ ] **Step 2: 写失败测试（stop 行为，spec 3.7）**

在 `describe('LangGraphChatRuntime')` 末尾（最后一个 `it` 之后、闭合 `});` 之前）加：

```ts
    it('stop() posts cancel without aborting the fetch and waits for the SSE terminal', async () => {
        const cs = controllableStream();
        const client: LangGraphRuntimeClient = {
            threads: {
                create: vi.fn(async () => ({ thread_id: 'thread-1' })),
                getState: vi.fn(),
            },
            runs: {
                stream: vi.fn(() => cs.gen()),
                cancel: vi.fn(async () => {}),
            },
        };
        const runtime = new LangGraphChatRuntime({
            client,
            toolExecutor: { dispatch: vi.fn() },
        });

        // 启动 runStream（不 await —— stream pending，runStream 仍在 for await）
        const runPromise = runtime.sendMessage('Hello');
        cs.push({ event: 'metadata', data: { run_id: 'run-1', thread_id: 'thread-1' } });
        cs.push({
            event: 'values',
            data: { messages: [{ id: 'ai-1', type: 'ai', content: 'Hi' }] },
        });

        // 等 runStream 进入 streaming 态
        await vi.waitFor(() => expect(runtime.getSnapshot().isStreaming).toBe(true));
        expect(runtime.getSnapshot().runId).toBe('run-1');

        // stop()：spec 3.7 —— 只调 cancel，不 abort、不立即清 isStreaming
        await runtime.stop();
        expect(client.runs.cancel).toHaveBeenCalledWith('thread-1', 'run-1', false);
        expect(runtime.getSnapshot().isStreaming).toBe(true); // 仍 streaming，等 SSE 终态

        // SSE 推 end{cancelled} 并关闭流 → runStream finally 落定 isStreaming=false
        cs.push({ event: 'end', data: { finish_reason: 'cancelled' } });
        cs.close();
        await vi.waitFor(() => expect(runtime.getSnapshot().isStreaming).toBe(false));

        await runPromise; // stream 结束，runStream resolve
    });
```

- [ ] **Step 3: 运行测试，确认 FAIL**

Run:
```bash
export PATH="/usr/bin:/bin:/c/Program Files/Git/cmd:/c/Program Files/Git/usr/bin:/c/Users/ginlon-atlas/AppData/Local/fnm_multishells/12284_1781581532078:/c/Users/ginlon-atlas/AppData/Local/pnpm:$PATH"; cd /d/projects/my-km/apps/web && pnpm exec vitest run src/features/ai/langgraph/__tests__/chat-runtime.test.ts 2>&1 | tail -20
```
Expected: FAIL —— 新 stop 测试失败。原因：当前 `stop()` 立即 `updateSnapshot({ isStreaming:false })`，所以 `expect(isStreaming).toBe(true)` 在 stop 后断言失败（实际 false）。确认测试在等实现。

（NOTE on PATH: this shell session has a reset PATH that drops node/pnpm/git/coreutils. Always prefix the export above for any Bash command in this branch. If the fnm multishell id `12284_...` differs, find it via `ls /c/Users/ginlon-atlas/AppData/Local/fnm_multishells/` and substitute.）

- [ ] **Step 4: 实现 stop() 统一（去 abort + 去立即 isStreaming）**

在 `apps/web/src/features/ai/langgraph/chat-runtime.ts`，替换 `stop()` 方法（当前 line 103-109）为：

```ts
    async stop(): Promise<void> {
        // spec 3.7：只调 cancel，不 abort 本地 fetch、不立即清 isStreaming。
        // 后端 cancel → abort → 写 end{finish_reason:'cancelled'} 并关 SSE，
        // runStream 的 for await 收到流结束 → finally 落定 isStreaming=false。
        // 本地 abort 仅保留 unmount（dispose）场景。
        if (this.snapshot.threadId && this.snapshot.runId) {
            await this.client.runs.cancel(this.snapshot.threadId, this.snapshot.runId, false);
        }
    }
```

（删除原 `this.currentAbortController?.abort();` 与 `this.updateSnapshot({ isStreaming: false, interrupt: null });` 两行。`dispose()` 的 abort 保持不变。）

- [ ] **Step 5: 运行测试，确认 PASS**

Run:
```bash
export PATH="/usr/bin:/bin:/c/Program Files/Git/cmd:/c/Program Files/Git/usr/bin:/c/Users/ginlon-atlas/AppData/Local/fnm_multishells/12284_1781581532078:/c/Users/ginlon-atlas/AppData/Local/pnpm:$PATH"; cd /d/projects/my-km/apps/web && pnpm exec vitest run src/features/ai/langgraph/__tests__/chat-runtime.test.ts 2>&1 | tail -12
```
Expected: PASS —— 原有 4 个测试 + 新增 1 个 stop 测试 = 5 个全绿。

- [ ] **Step 6: 提交**

```bash
export PATH="/usr/bin:/bin:/c/Program Files/Git/cmd:/c/Program Files/Git/usr/bin:/c/Users/ginlon-atlas/AppData/Local/fnm_multishells/12284_1781581532078:/c/Users/ginlon-atlas/AppData/Local/pnpm:$PATH"
cd /d/projects/my-km && git add apps/web/src/features/ai/langgraph/chat-runtime.ts apps/web/src/features/ai/langgraph/__tests__/chat-runtime.test.ts && git commit -m "feat(ai): unify stop signal to cancel-only (no local abort) (P2-4)"
```

---

## Task 2: 前后端回归 + type-check + 构建

**Files:**（无产品代码改动，仅验证）

- [ ] **Step 1: 前端全量 vitest**

Run:
```bash
export PATH="/usr/bin:/bin:/c/Program Files/Git/cmd:/c/Program Files/Git/usr/bin:/c/Users/ginlon-atlas/AppData/Local/fnm_multishells/12284_1781581532078:/c/Users/ginlon-atlas/AppData/Local/pnpm:$PATH"; cd /d/projects/my-km/apps/web && pnpm exec vitest run 2>&1 | tail -12
```
Expected: PASS —— 所有 web 测试绿（含 chat-runtime.test 5 个）。确认 stop() 改动未破坏其他前端测试（sendMessage/interrupt 等）。

- [ ] **Step 2: 前端 type-check**

Run:
```bash
export PATH="/usr/bin:/bin:/c/Program Files/Git/cmd:/c/Program Files/Git/usr/bin:/c/Users/ginlon-atlas/AppData/Local/fnm_multishells/12284_1781581532078:/c/Users/ginlon-atlas/AppData/Local/pnpm:$PATH"; cd /d/projects/my-km/apps/web && pnpm run type-check 2>&1 | tail -6
```
Expected: 通过（tsc 无错）。`currentAbortController` 仍被 `runStream`/`dispose` 使用，不应有 unused 警告。

- [ ] **Step 3: 后端回归（确认未受影响）**

Run:
```bash
export PATH="/usr/bin:/bin:/c/Program Files/Git/cmd:/c/Program Files/Git/usr/bin:/c/Users/ginlon-atlas/AppData/Local/fnm_multishells/12284_1781581532078:/c/Users/ginlon-atlas/AppData/Local/pnpm:$PATH"; cd /d/projects/my-km/apps/server && pnpm exec jest src/ai --runInBand 2>&1 | tail -6
```
Expected: PASS —— 后端 18 suites / 240 passed / 1 skipped（P2-3b 基线），确认前端改动未触碰后端。`ai.service.spec` 的 cancelled/cancel 测试仍绿。

- [ ] **Step 4:（无额外提交）**

Task 2 是纯验证，无代码改动。若 Step 1-3 全绿则 Task 2 完成，无需 commit。

---

## 验收标准（本阶段）

- [ ] `stop()` 只调 `client.runs.cancel(threadId, runId, false)`，不 `currentAbortController.abort()`、不立即 `isStreaming:false`
- [ ] `dispose()` 仍 abort（unmount 场景保留）
- [ ] chat-runtime.test 新增 stop 测试：stop 后 `isStreaming` 仍 true，SSE 终态（流关闭）后 `isStreaming:false`
- [ ] 后端 cancel→`end{cancelled}` 链路（P1）未被改动，测试仍绿
- [ ] 前端 vitest + type-check + 后端 jest 全绿

## 本阶段不做（留给后续）

- "正在停止" UI 状态（spec 5.8，连接态状态机 P2-5/P4）—— stop 后到 SSE end 之间 UI 仍显示 streaming
- 跨副本 cancel（非 owner 副本收到 cancel 需经 Redis 信号转发给 owner，spec 6.4 P3）
- SSE 心跳（spec 3.9）
- cancel 端点的 user 隔离（spec 6.2，P5）

## 如何验证 stop 终态语义（部署级，非 CI）

单测用 controllableStream 验证 stop() 不 abort + 等 SSE 终态。端到端验证需真实后端：
1. 发起 run（POST /runs/stream，AI 生成中）。
2. 调 stop() → POST /runs/:rid/cancel。
3. 前端 SSE 应继续收到后续 token（若 LLM 还在产出）直到 `end{finish_reason:'cancelled'}`，然后 UI 停止。
4. PG Run.status = cancelled，lease 已释放。
