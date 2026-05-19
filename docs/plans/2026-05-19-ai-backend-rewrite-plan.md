# Architecture & Execution Plan: AI Backend Rewrite

> Branch: main | Date: 2026-05-19 | Status: DRAFT

## Step 0: Scope Challenge

**Are we solving the right problem?**
The core problem is real: `RoomStateMachineFactory` singleton + `RoomOrchestrator` direct dependency + dual state tracking (`FSM` + `AISessionManager`) = coupling that's hard to test and extend.

**Is "delete and rewrite" the right approach?**
Yes, for these specific reasons:
1. The files to delete (20) are all orchestration/gateway/dispatch/tool layers — the Prisma DB layer (room.service, message.service) and provider layer (4 LLM providers) are clean and independent.
2. The double-create bug (RoomRouter + RoomOrchestrator both calling `factory.create()`) means the current code can't be incrementally fixed without touching all files simultaneously.
3. The callback-based decoupling pattern is a fundamental architectural shift that touches every file in the orchestration path.

**What are we NOT changing?**
- Database layer: `conversation/`, `message/` — pure Prisma CRUD, no changes
- Provider layer: `provider/` — all 4 LLM providers, factory, registry — no changes
- Shared WS infrastructure: `ws/` — `WsGateway`, `MessageBus`, `SocketRegistry` — no changes
- REST API: `ai.controller.ts`, `dto/` — no changes
- LangGraph workflow: `@my-km/langgraph-workflows` package — no changes
- WS protocol: client/server event types remain wire-compatible

**Risk assessment:** Medium. The rewrite eliminates global state and coupling, but the tool-call loop and LangGraph integration are non-trivial. Testing is critical.

---

## Architecture Review

### Current Problems (confirmed from code)

1. **Double-create bug**: `RoomRouter.createAndSend()` calls `stateMachineFactory.create()` (line 41), then `RequestDispatcher.dispatch()` → `RoomOrchestrator.dispatch()` calls `factory.create()` again (line 63). Second call throws because FSM is already `BuildingContext`, not `Done`.

2. **Five repeated `factory.get(roomId)` lookups** in `RoomOrchestrator` callbacks (lines 74, 78, 82, 86, 90) — fragile, breaks if factory doesn't have the room.

3. **`WorkflowExecutor` has `@Optional() private stateMachine: RoomStateMachine | null`** (line 55) — direct dependency on transport-layer FSM, violating DIP.

4. **Dual state tracking**: `AISessionManager` tracks `pending/streaming/waiting_tool/completed/error/aborted` while `RoomStateMachine` tracks `Idle/BuildingContext/Processing/ToolWaiting/ToolExecuting/Done`. They overlap and can drift out of sync.

5. **ToolDispatcher has dual lookup paths** (sessionId + roomId) — legacy complexity from multiple refactors.

### Target Architecture (from design doc)

Three clear layers with clean boundaries:

```
Transport (ws/) → AI Router (ai/gateway/) → Execution (ai/dispatch/ + ai/workflow-runtime/)
```

Key decoupling: `WorkflowCallbacks` interface. Executor knows nothing about FSM. AiMessageRouter builds the callback bridge.

---

## Execution Plan: Phased Delete & Rewrite

### Strategy: Phased rewrite with checkpoint commits

Rather than nuking all 20 files at once (which would break compilation entirely), we'll do it in **5 phases**, each ending with a working, compilable state. Each phase deletes old files and writes their replacements.

### Phase 1: Foundation Types + RoomSession (Delete: 3, Create: 4)

**Goal**: Define new interfaces and replace `RoomStateMachineFactory`.

| Action | File |
|--------|------|
| DELETE | `gateway/room-statemachine-factory.ts` |
| DELETE | `gateway/room-statemachine.types.ts` |
| DELETE | `gateway/room-statemachine.ts` |
| CREATE | `gateway/room-session.types.ts` — FSM states, transitions, `RoomSession`, `RoomSessionRegistry`, `WorkflowCallbacks`, `ExecutionCtx` |
| CREATE | `gateway/room-session.ts` — `RoomSession` class (FSM + AbortController + emit) |
| CREATE | `gateway/room-session-registry.ts` — replaces `RoomStateMachineFactory` |
| CREATE | `gateway/room-statemachine.ts` — keep the FSM implementation but simplify (it's now owned by RoomSession, not a standalone injectable) |

**Module changes**: Update `ai.module.ts` — remove `RoomStateMachineFactory` provider, add `RoomSessionRegistry`.

**Checkpoint**: Compiles, but `RoomRouter` and `RoomOrchestrator` still reference old imports. Fix by temporarily stubbing.

### Phase 2: AiMessageRouter Rewrite (Delete: 2, Create: 1)

**Goal**: New message router that builds callback bridges.

| Action | File |
|--------|------|
| DELETE | `gateway/ai-message-router.ts` |
| DELETE | `gateway/room-router.ts` |
| CREATE | `gateway/ai-message-router.ts` — unified router: `createAndSend`, `sendMessage`, `joinRoom`, `stop`, `onClientDisconnect`, `deliverToolResult`. Builds callbacks bridge. |

**Key change**: `AiMessageRouter` now owns the callback bridge construction. Instead of delegating to `RoomRouter`, it directly calls `RoomService` → `RoomSessionRegistry.create()` → `RequestDispatcher.dispatch()`.

**Checkpoint**: `ai.module.ts` updated. `RoomRouter` removed. `AiMessageRouter` self-subscribes to MessageBus as before.

### Phase 3: RequestDispatcher + AISessionManager consolidation (Delete: 3, Create: 2)

**Goal**: Merge concurrency protection into `RoomSessionRegistry`, simplify dispatcher.

| Action | File |
|--------|------|
| DELETE | `dispatch/request-dispatcher.ts` |
| DELETE | `dispatch/rate-limiter.guard.ts` |
| DELETE | `session/ai-session-manager.ts` |
| DELETE | `session/ai-session.types.ts` |
| CREATE | `dispatch/request-dispatcher.ts` — simplified: rate limit → create Executor → execute. Uses `RoomSessionRegistry` for concurrency guard. |
| CREATE | `dispatch/rate-limiter.guard.ts` — keep (rate limiting is independent concern) |

**Note**: `AISessionManager`'s concurrency guard and heartbeat are absorbed into `RoomSessionRegistry`. The `AISession` type and status tracking (`pending/streaming/waiting_tool`) are eliminated — `RoomSession` with FSM states replaces it.

**Checkpoint**: No more `AISessionManager` references. `RoomOrchestrator` still references it — will be fixed in Phase 4.

### Phase 4: Executor + RoomOrchestrator Rewrite (Delete: 2, Create: 3)

**Goal**: Per-execution Executor, callback-decoupled orchestrator.

| Action | File |
|--------|------|
| DELETE | `workflow-runtime/room-orchestrator.ts` |
| DELETE | `workflow-runtime/workflow-executor.ts` |
| DELETE | `workflow-runtime/workflow.types.ts` |
| CREATE | `workflow-runtime/executor.types.ts` — `ExecutionCtx`, `WorkflowCallbacks` (move from gateway) |
| CREATE | `workflow-runtime/executor.ts` — `Executor` class (per-execution instance). Constructor takes `ExecutionCtx`, `execute()` runs LLM loop. |
| CREATE | `workflow-runtime/orchestrator.ts` — thin orchestrator: delegates to `RequestDispatcher`, no FSM dependency. |

**Key changes**:
- `Executor` is NOT a NestJS singleton. `RequestDispatcher` creates `new Executor(ctx)` per request.
- `Executor` depends on `MessageService`, `GraphRegistry`, `LLMResolver`, `ToolDispatcher`, `ToolRouter` — injected via constructor factory or passed in `ExecutionCtx`.
- All `_emit*` methods use callbacks only — no `stateMachine` fallback.

**NestJS DI consideration**: Since `Executor` is per-execution (not a singleton), it can't use `@Injectable()` constructor injection. Two options:
- **Option A (chosen)**: `Executor` takes a `Dependencies` object in its constructor containing all the services it needs. `RequestDispatcher` builds this from its own injected dependencies.
- **Option B**: Use a factory pattern (`ExecutorFactory.create(deps, ctx)`).

### Phase 5: ToolDispatcher Cleanup + Module Wiring (Delete: 1, Rewrite: 1)

**Goal**: Simplify ToolDispatcher, wire everything together.

| Action | File |
|--------|------|
| REWRITE | `tools/tool.dispatcher.ts` — simplify: remove dual lookup paths, only use roomId-based waiting sessions. Remove `waitForResults` (sessionId path), keep `waitForResultsByRoom`. |
| DELETE | `session/` directory (if not already deleted in Phase 3) |

**Module wiring**: Final `ai.module.ts` cleanup:
- Remove: `RoomStateMachineFactory`, `AISessionManager`, `RoomRouter`
- Add: `RoomSessionRegistry`
- Keep: All providers, `AiMessageRouter`, `RequestDispatcher`, `RoomOrchestrator`, `WorkflowExecutor` → `Executor`

---

## File Inventory

### Phase 1: Foundation (types + RoomSession)

```
DELETE apps/server/src/ai/gateway/room-statemachine-factory.ts
DELETE apps/server/src/ai/gateway/room-statemachine.types.ts
DELETE apps/server/src/ai/gateway/room-statemachine.ts

CREATE apps/server/src/ai/gateway/room-session.types.ts
CREATE apps/server/src/ai/gateway/room-session.ts
CREATE apps/server/src/ai/gateway/room-session-registry.ts
CREATE apps/server/src/ai/gateway/room-statemachine.ts    # simplified FSM
```

### Phase 2: AiMessageRouter Rewrite

```
DELETE apps/server/src/ai/gateway/ai-message-router.ts
DELETE apps/server/src/ai/gateway/room-router.ts

CREATE apps/server/src/ai/gateway/ai-message-router.ts    # unified router
```

### Phase 3: Dispatch + Session consolidation

```
DELETE apps/server/src/ai/dispatch/request-dispatcher.ts
DELETE apps/server/src/ai/dispatch/rate-limiter.guard.ts
DELETE apps/server/src/ai/session/ai-session-manager.ts
DELETE apps/server/src/ai/session/ai-session.types.ts

CREATE apps/server/src/ai/dispatch/request-dispatcher.ts  # simplified
CREATE apps/server/src/ai/dispatch/rate-limiter.guard.ts  # keep (rate limiting is independent)
```

### Phase 4: Executor + Orchestrator

```
DELETE apps/server/src/ai/workflow-runtime/room-orchestrator.ts
DELETE apps/server/src/ai/workflow-runtime/workflow-executor.ts
DELETE apps/server/src/ai/workflow-runtime/workflow.types.ts

CREATE apps/server/src/ai/workflow-runtime/executor.types.ts
CREATE apps/server/src/ai/workflow-runtime/executor.ts
CREATE apps/server/src/ai/workflow-runtime/orchestrator.ts
```

### Phase 5: ToolDispatcher + Module wiring

```
REWRITE apps/server/src/ai/tools/tool.dispatcher.ts

DELETE apps/server/src/ai/session/                    # remove directory if empty
UPDATE  apps/server/src/ai/ai.module.ts               # final wiring
```

### Summary: Files affected

| Phase | Delete | Create/Rewrite | Net change |
|-------|--------|----------------|------------|
| 1 | 3 | 4 | +1 |
| 2 | 2 | 1 | -1 |
| 3 | 4 | 2 | -2 |
| 4 | 3 | 3 | 0 |
| 5 | 1 dir | 1 rewrite + 1 update | -1 dir |
| **Total** | **13 files** | **11 files** | **-2 files** |

---

## Test Plan

### Unit Tests

| Component | Test cases |
|-----------|-----------|
| `RoomSession` | FSM transitions (all valid + invalid), abort, isActive |
| `RoomSessionRegistry` | create/get/destroy, concurrency guard (reject duplicate active), destroyByClientId, stale cleanup |
| `RoomStateMachine` | All state transitions from matrix, emit events, abort signal |
| `Executor` | execute() happy path, tool call loop, abort during execution, error handling, callbacks fired |
| `RequestDispatcher` | rate limit blocks, dispatch success, dispatch failure cleanup |
| `AiMessageRouter` | createAndSend flow, sendMessage flow, joinRoom, stop, toolResult delivery, disconnect cleanup |
| `ToolDispatcher` | deliverResult, waitForResultsByRoom, timeout, cancelWaiting |

### Integration Tests

| Scenario | Path |
|----------|------|
| Happy path | `create_and_send` → `created` → `text_chunk` × N → `done` |
| Tool call (auto) | `create_and_send` → `text_chunk` → `tool_call` (auto) → `text_chunk` → `done` |
| Tool call (needs confirmation) | `create_and_send` → `tool_call` (confirm) → wait → `tool_result` → `text_chunk` → `done` |
| Abort | `create_and_send` → `stop` → `done` (finishReason: stopped) |
| Rate limit | Rapid `create_and_send` → second blocked with `RATE_LIMITED` error |
| Concurrency | Same room, two messages → second rejected with conflict error |
| Room not found | `send_message` to invalid room → error |
| Disconnect mid-execution | Client disconnect → session aborted → cleanup |

### Test file locations

```
CREATE apps/server/src/ai/gateway/__tests__/room-session.spec.ts
CREATE apps/server/src/ai/gateway/__tests__/room-session-registry.spec.ts
CREATE apps/server/src/ai/gateway/__tests__/room-statemachine.spec.ts
CREATE apps/server/src/ai/workflow-runtime/__tests__/executor.spec.ts
CREATE apps/server/src/ai/dispatch/__tests__/request-dispatcher.spec.ts
CREATE apps/server/src/ai/gateway/__tests__/ai-message-router.spec.ts
CREATE apps/server/src/ai/tools/__tests__/tool-dispatcher.spec.ts
```

---

## Performance Considerations

1. **Executor instance are lightweight**: No heavy initialization — just receives deps and context. GC handles cleanup.

2. **RoomSessionRegistry cleanup**: Instead of per-session heartbeat (every 2 min), use periodic scan every 5 min for stale `Done` sessions. Active sessions without heartbeat will be aborted after configurable timeout (e.g., 10 min).

3. **Graph caching**: `WorkflowExecutor` had a `graphCache` Map. Keep this in `Executor` as a static cache or pass via `Dependencies` — compilation is expensive.

4. **ToolDispatcher waiting sessions**: Use `Map<string, WaitingSession>` keyed by `roomId:nonce` — cleanup on resolution/timeout. No memory leak risk.

5. **Rate limiter**: Keep sliding window. Consider moving to Redis for multi-instance deployment (future).

---

## Dependency Injection Strategy

Since `Executor` is per-execution (not a NestJS singleton), it needs dependencies passed explicitly:

```typescript
// executor.types.ts
export interface ExecutorDependencies {
  messageService: MessageService;
  graphRegistry: GraphRegistry;
  llmResolver: LLMResolver;
  toolDispatcher: ToolDispatcher;
  toolRouter: ToolRouter;
}

// executor.ts
export class Executor {
  constructor(
    private ctx: ExecutionCtx,
    private deps: ExecutorDependencies,
  ) {}
  async execute(): Promise<void> { ... }
}

// request-dispatcher.ts
export class RequestDispatcher {
  constructor(
    private roomSessionRegistry: RoomSessionRegistry,
    private messageService: MessageService,
    private graphRegistry: GraphRegistry,
    private llmResolver: LLMResolver,
    private toolDispatcher: ToolDispatcher,
    private toolRouter: ToolRouter,
    private socketRegistry: SocketRegistry,
    private rateLimiter: AiRateLimiter,
  ) {}

  async dispatch(ctx: DispatchContext): Promise<void> {
    // ...
    const executor = new Executor(executionCtx, {
      messageService: this.messageService,
      graphRegistry: this.graphRegistry,
      llmResolver: this.llmResolver,
      toolDispatcher: this.toolDispatcher,
      toolRouter: this.toolRouter,
    });
    await executor.execute();
  }
}
```

This keeps `Executor` testable (mock `ExecutorDependencies`) while avoiding NestJS singleton state.

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| LangGraph stream behavior changes | Low | High | Keep the existing `graph.stream()` call pattern identical |
| Tool call loop edge cases | Medium | High | Exhaustive unit tests for Executor tool loop |
| Callback bridge misses an event | Medium | Medium | Test every callback path with mocks |
| Concurrent request race condition | Low | High | `RoomSessionRegistry.create()` throws on duplicate active — test this |
| Memory leak in RoomSessionRegistry | Low | Medium | Periodic stale session cleanup + test |
| WS protocol incompatibility | Low | High | Keep `ai-ws-events.types.ts` unchanged — wire-format stable |

---

## Open Decisions

1. **Should `ai-ws-events.types.ts` be touched?** → No. Wire protocol is stable. Only internal architecture changes.

2. **Should `GraphRegistry` and `LLMResolver` change?** → No. They work correctly. `Executor` will use them via dependencies.

3. **Should rate limiter be kept as-is?** → Yes. Independent concern, works correctly.

4. **Should ToolRegistry/ToolRouter be rewritten?** → `ToolRouter` stays. `ToolRegistry` stays. Only `ToolDispatcher` simplifies (remove dual lookup).

5. **Executor as `new Executor()` vs factory?** → `new Executor(ctx, deps)` is simpler and more idiomatic. Factory pattern adds indirection without benefit here.
