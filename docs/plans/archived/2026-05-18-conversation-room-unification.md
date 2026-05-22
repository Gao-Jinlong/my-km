# Plan: conversation → room full rename (wire protocol + DB + frontend)

**Date**: 2026-05-18
**Branch**: main
**Parent plans**:
- [2026-05-14-ai-gateway-refactor.md](docs/plans/2026-05-14-ai-gateway-refactor.md) (design doc)
- [2026-05-18-ws-decouple-messagebus.md](docs/plan/2026-05-18-ws-decouple-messagebus.md) (latest implementation)

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| Eng Review | `/plan-eng-review` | Full terminology unification (required) | 1 | planning | 6 issues, 1 critical gap |

## Step 0: Scope Challenge

### 1. What existing code already partially solves this?

The 2026-05-14 design doc (decision #9) deferred `conversation→room` to a separate PR. Currently:
- **RoomRouter, RoomStateMachine, RoomStateMachineFactory** — superficial "room" naming with `conversationId` internals
- **ConversationStateMachine (old)** — dead singleton FSM, superseded by RoomStateMachine
- **All other code** — uniformly uses `conversation` across backend, frontend, Prisma, and wire protocol

### 2. Full rename scope (per user choice B)

This rename spans **~50 files** across backend, frontend, Prisma schema, and wire protocol:

**Wire protocol** (`ai-ws-events.types.ts`):
- `conversationId` → `roomId` in ClientMessage/ServerMessage discriminated unions
- `CONVERSATION_NOT_FOUND` → `ROOM_NOT_FOUND`, `CONVERSATION_BUSY` → `ROOM_BUSY`

**Backend** (`apps/server/src/ai/`):
- `ConversationService` → `RoomService`, `ConversationOrchestrator` → `RoomOrchestrator`
- All `conversationId` params/variables → `roomId`
- `conversation-statemachine.types.ts` → `room-statemachine.types.ts` (enum `RoomState`, type `RoomFSM`)
- `conversation.service.ts` → `room.service.ts`, `conversation.types.ts` → `room.types.ts`
- `conversation-state.ts` → `room-state.ts`
- REST API paths: `/ai/conversations` → `/ai/rooms`
- DTOs, controller, message service, session types, connection types — all renamed

**Prisma** (`packages/prisma/prisma/schema.prisma`):
- `Conversation` model → `Room`
- `Message.conversationId` → `Message.roomId`
- FK relation: `conversation` → `room`

**Frontend** (`apps/web/src/`):
- `WSClientService.joinConversation` → `joinRoom`, all `conversationId` → `roomId`
- `conversation-api.ts` → `room-api.ts`, REST paths updated
- `ai-harness` types, `conversation-state.ts` → `room-state.ts`
- All consumer files that reference `conversationId` → `roomId`

### 3. Complexity check

~50 files across 3 packages (server, web, prisma). This triggers the complexity smell but is purely mechanical — no behavioral change, no new abstractions. The risk is deployment coordination, not code complexity.

### 4. Distribution check

Breaking changes to wire protocol require **coordinated deployment**: backend must deploy first (or simultaneously) with frontend. Prisma migration must run before backend starts.

### 5. Completeness check

Full rename = 10/10 completeness. Every occurrence of the concept gets the correct name.

### 6. Search check

No new patterns — pure mechanical rename.

## Section 1: Architecture review

### Issue 1: Prisma migration is the most risky step (confidence: 9/10)

Renaming `Conversation` → `Room` and `Message.conversationId` → `Message.roomId` in the Prisma schema generates a migration that:
- Renames the `Conversation` table to `Room`
- Renames the `conversationId` column in `Message` to `roomId`
- Updates all foreign key constraints

On PostgreSQL, `ALTER TABLE RENAME` is metadata-only (instant) for table renames. Column renames with FK constraints may require a brief lock.

**Recommendation**: Run `pnpm prisma migrate dev` locally to generate and verify the migration SQL, review it, then use `pnpm prisma migrate deploy` in production.

### Issue 2: Wire protocol breaking change (confidence: 10/10)

`ClientMessage` and `ServerMessage` in `ai-ws-events.types.ts` use `conversationId`. Frontend sends/receives these over WebSocket. If backend expects `roomId` but frontend still sends `conversationId`, messages will fail.

**Deployment order**: Prisma migration → Backend deploy → Frontend deploy. Zero-downtime requires feature flag or backward compatibility (accept both `conversationId` and `roomId` temporarily).

**Recommendation**: For now, accept coordinated deployment. If zero-downtime is needed later, add backward compatibility to the MessageBus handler.

### Issue 3: Old ConversationStateMachine is dead code (confidence: 9/10)

`ConversationStateMachine` (conversation-statemachine.ts) — singleton FSM with no consumers. AiModule routes through RoomRouter via MessageBus instead.

**Recommendation**: Delete. The new name will be `RoomStateMachine` (keeping the RoomStateMachine class, just renaming from the current name — no conflict).

### Issue 4: ConnectionManager is dead code (confidence: 7/10)

Registered in AiModule but never used by WsGateway. Design doc said remove it.

**Recommendation**: Delete.

### Issue 5: `conversation-statemachine.types.ts` name collision after rename (confidence: 8/10)

The original `conversation-statemachine.ts` will be deleted. `room-statemachine.ts` (current RoomStateMachine) needs to be renamed. The types file should also be renamed:

- `conversation-statemachine.types.ts` → `room-statemachine.types.ts`
- `ConversationState` → `RoomState`
- `ConversationFSM` → `RoomFSM`

But `conversation-statemachine.types.ts` is imported by many files. Renaming it means updating all imports.

**Recommendation**: Rename file + all types. This is a mechanical change.

### Issue 6: RoomRouter.joinRoom misnamed (confidence: 8/10)

`joinRoom(conversationId, emit)` queries and emits history — doesn't actually join. After rename this becomes `joinRoom(roomId, emit)` which is even more misleading (the method name implies joining a room, but it just emits history).

**Recommendation**: Rename to `emitHistory(roomId, emit)`.

## Section 2: Code quality review

No issues beyond the rename scope. All other code is clean. The rename itself is a quality improvement — it eliminates the dual-naming confusion.

## Section 3: Test review

### Coverage diagram

```
CODE PATHS                                            USER FLOWS
[+] RoomStateMachine (already exists)                 [+] Room lifecycle
  ├── receiveMessage()                                  ├── [★★  TESTED] create room — conversation-router.spec.ts
  ├── contextReady()                                    ├── [GAP]     join existing room
  ├── textChunk()                                       └── [GAP]     send message to existing room
  ├── toolCall()
  │   ├── [GAP] requiresConfirmation=true
  │   └── [GAP] requiresConfirmation=false
  ├── toolResult()
  ├── toolDone()
  ├── llmDone()
  ├── stop()
  ├── error()
  └── _transition()
      ├── [GAP] valid transition
      └── [GAP] invalid transition (throws)

[+] RoomStateMachineFactory                           [+] Factory lifecycle
  ├── create()                                          ├── [★★  TESTED] create new FSM
  │   ├── [GAP] room already active (throws)            └── [GAP]     create duplicate (should throw)
  │   └── [GAP] stale Done session cleanup
  ├── get()
  │   ├── [GAP] exists
  │   └── [GAP] not found (returns null)
  ├── destroy()
  │   └── [GAP] destroy + cleanup
  └── destroyByClientId()
      ├── [GAP] has sessions
      └── [GAP] no sessions (no-op)

[+] RoomRouter (already exists)                       [+] Message routing
  ├── createAndSend()                                   ├── [★★  TESTED] create new + send
  ├── sendMessage()                                     └── [GAP]     send to non-existent room
  │   ├── [GAP] room found
  │   └── [GAP] room not found (error)
  ├── emitHistory() (renamed from joinRoom)
  │   ├── [GAP] room found + history
  │   └── [GAP] room not found (error)
  ├── stop()
  │   └── [GAP] FSM exists
  └── onClientDisconnect()
      └── [GAP] cleanup on disconnect

[+] Prisma migration (Conversation → Room)            [N/A]
  └── [GAP] Verify migration SQL is correct

[+] REST API (/ai/conversations → /ai/rooms)          [N/A]
  └── [GAP] Update controller + frontend API client

COVERAGE: ~60% of code paths have tests  |  GAPS: 18 missing test cases
QUALITY: ★★★:0 ★★:5  |  GAPS: 18 (all unit test level)
```

### REGRESSION RULE

All rename changes are mechanical — no behavior change. Tests should pass after rename. The one exception is the Prisma migration: if the generated migration SQL is incorrect, data could be lost. Must review the SQL before applying.

## Section 4: Performance review

No performance concerns. Pure rename, no data processing change.

## Failure modes

| Failure mode | Covered by test? | Error handling? | User impact |
|-------------|-----------------|----------------|-------------|
| Prisma migration wrong SQL | No — manual review required | N/A | Data loss if applied incorrectly |
| Backend expects `roomId` but frontend sends `conversationId` | No — integration test gap | TypeScript catches it | WebSocket messages fail silently |
| Frontend deploy before backend | No — deployment order issue | N/A | WebSocket connection breaks |
| Import path broken after rename | Yes — TypeScript compiler | N/A | Build fails (safe failure) |
| REST API path mismatch | Yes — frontend API client calls will fail | HTTP error | AI features break |

**Critical gap**: No integration test verifies the full WebSocket message flow with `roomId`. The gap exists before and after the rename.

## NOT in scope

- Adding backward compatibility for wire protocol (accept both `conversationId` and `roomId`)
- Feature flags for gradual rollout
- Zero-downtime deployment support

## What already exists

| Existing | Purpose | Reuse or Rebuild? |
|----------|---------|-------------------|
| `room-statemachine.ts` | Per-room FSM instance | Keep, rename types |
| `room-statemachine-factory.ts` | FSM lifecycle management | Keep, rename types |
| `room-router.ts` | Business orchestration | Keep, rename method + types |
| `conversation-statemachine.types.ts` | State enum, transitions, FSM interface | Rename to `room-statemachine.types.ts` |
| `conversation-statemachine.ts` (old) | Singleton FSM (dead code) | Delete |
| `ConnectionManager` | Connection tracking (dead code) | Delete |

## Implementation Steps

### Phase 1: Prisma schema + migration

**Step 1.1**: Rename Prisma model
- `packages/prisma/prisma/schema.prisma`: `Conversation` → `Room`, `Message.conversationId` → `Message.roomId`, relation `conversation` → `room`

**Step 1.2**: Generate and review migration
- Run `pnpm prisma migrate dev --name rename_conversation_to_room`
- Review the generated SQL in the migration file
- Verify: table rename, column rename, FK updates are correct

### Phase 2: Backend types + wire protocol

**Step 2.1**: Rename wire protocol types
- `ai/gateway/ai-ws-events.types.ts`: all `conversationId` → `roomId`, `CONVERSATION_NOT_FOUND` → `ROOM_NOT_FOUND`, `CONVERSATION_BUSY` → `ROOM_BUSY`

**Step 2.2**: Rename state machine types
- Rename file: `conversation-statemachine.types.ts` → `room-statemachine.types.ts`
- `ConversationState` → `RoomState`, `ConversationFSM` → `RoomFSM`, `StateTransition` → `RoomStateTransition`
- Update all imports

### Phase 3: Backend services

**Step 3.1**: Delete dead code
- Delete `ai/gateway/conversation-statemachine.ts` and its test
- Delete `ai/connection/` directory (connection-manager.ts, connection.types.ts)
- Update `ai.module.ts`: remove imports and provider registrations

**Step 3.2**: Rename conversation service
- Rename files: `conversation.service.ts` → `room.service.ts`, `conversation.types.ts` → `room.types.ts`, `conversation-state.ts` → `room-state.ts`
- `ConversationService` → `RoomService`, all `conversationId` → `roomId` in params and types
- Update all imports across: ai.controller.ts, ai.module.ts, request-dispatcher.ts, room-router.ts

**Step 3.3**: Rename orchestrator
- `workflow-runtime/conversation-orchestrator.ts` → `room-orchestrator.ts`
- `ConversationOrchestrator` → `RoomOrchestrator`, all `conversationId` → `roomId`
- Update imports: ai.module.ts, request-dispatcher.ts

**Step 3.4**: Update remaining backend files
- `ai.controller.ts`: REST paths `/ai/conversations` → `/ai/rooms`, all variables `conversationId` → `roomId`, body/query types renamed
- `ai.module.ts`: update all imports and references
- `message.service.ts`: `findByConversationId` → `findByRoomId`, `buildLLMHistory` params `conversationId` → `roomId`
- `request-dispatcher.ts`: `DispatchContext.conversationId` → `roomId`
- `ai-session.types.ts`: `conversationId` → `roomId`
- `send-message.dto.ts`: `conversationId` → `roomId`
- `connection.types.ts`: delete (part of Step 3.1)
- `workflow-executor.ts`: any `conversationId` → `roomId`
- `workflow.types.ts`: any `conversationId` → `roomId`
- `tool-router.ts`: any `conversationId` → `roomId`
- `tool.dispatcher.ts`: any `conversationId` → `roomId`
- `ai-session-manager.ts`: any `conversationId` → `roomId`
- `ws/ws-gateway.ts`: any `conversationId` → `roomId` in comments/references
- `ws/message-bus.ts`: any references updated

### Phase 4: Backend tests

**Step 4.1**: Rename test files
- `__tests__/room-statemachine-factory.spec.ts` → `__tests__/room-statemachine-factory.spec.ts` (keep name, update internal types)
- `__tests__/room-router.spec.ts` → `__tests__/room-router.spec.ts` (keep name, update internal types)
- Delete `__tests__/conversation-statemachine.spec.ts`

**Step 4.2**: Update all test files
- `ai/__tests__/ai.controller.spec.ts`
- `ai/dispatch/__tests__/request-dispatcher.spec.ts`
- `ai/tools/__tests__/tool-router.spec.ts`
- `ws/__tests__/ws-gateway.spec.ts`
- `ai/gateway/__tests__/ws-gateway.spec.ts`
- `ai/gateway/__tests__/room-statemachine-factory.spec.ts`
- `ai/gateway/__tests__/room-router.spec.ts`
- `ai/workflow-runtime/__tests__/workflow-executor-callbacks.spec.ts`
- All: `conversationId` → `roomId`

### Phase 5: Frontend

**Step 5.1**: Rename API client
- `features/ai/api/conversation-api.ts` → `room-api.ts`
- `ConversationRecord` → `RoomRecord`
- REST paths `/ai/conversations` → `/ai/rooms`
- `conversationId` params → `roomId`
- `listConversations` → `listRooms`, `createConversation` → `createRoom`, etc.

**Step 5.2**: Update WS client
- `platform/ws-client/ws-client.service.ts`: `joinConversation` → `joinRoom`, `sendJoin(conversationId)` → `joinRoom(roomId)`, all `conversationId` → `roomId`

**Step 5.3**: Update AI harness
- `features/ai/harness/conversation-state.ts` → `room-state.ts`
- `features/ai/harness/ai-harness.service.ts`: all `conversationId` → `roomId`
- `features/ai/harness/index.ts`: update exports
- `hooks/use-ai-harness.ts`: all `conversationId` → `roomId`

**Step 5.4**: Update types and stores
- `features/ai/types/ai.types.ts`: all `conversationId` → `roomId`
- `stores/workspace-store.ts`: any `conversationId` references → `roomId`

**Step 5.5**: Update frontend tests
- `platform/ws-client/__tests__/ws-client-protocol.test.ts`
- `features/ai/harness/__tests__/harness.test.ts`
- `features/ai/harness/__tests__/harness-recovery.test.ts`
- `features/ai/harness/__tests__/conversation-state-rollback.test.ts`
- `features/ai/harness/__tests__/harness-rollback.test.ts`
- `features/ai/types/__tests__/ai-types.test.ts`

### Phase 6: Verify

**Step 6.1**: Prisma
- `pnpm prisma generate` — verify types compile

**Step 6.2**: Backend
- `pnpm --filter server build` — verify compilation
- `pnpm --filter server test` — verify all tests pass

**Step 6.3**: Frontend
- `pnpm --filter web build` — verify compilation
- `pnpm --filter web test` — verify all tests pass

## Parallelization

| Step | Modules touched | Depends on |
|------|----------------|------------|
| Phase 1: Prisma | packages/prisma/ | — |
| Phase 2: Backend types | ai/gateway/ types | Phase 1 |
| Phase 3: Backend services | ai/ services, ws/ | Phase 2 |
| Phase 4: Backend tests | ai/__tests__, ws/__tests__ | Phase 3 |
| Phase 5: Frontend | apps/web/src/ | — (can run in parallel with Phase 1-4) |
| Phase 6: Verify | — | Phase 4, 5 |

**Lanes**:
- Lane A: Phase 1 → Phase 2 → Phase 3 → Phase 4 (backend chain)
- Lane B: Phase 5 (frontend, independent of backend chain until Phase 6)
- Lane C: Phase 6 (depends on both A and B)

Launch A + B in parallel. Then C.

## Completion summary

- Step 0: Scope Challenge — scope accepted as full rename (B)
- Architecture Review: 6 issues found (Prisma migration risk, wire protocol break, 2 dead code items, type name collision, method rename)
- Code Quality Review: 0 issues beyond rename scope
- Test Review: diagram produced, 18 gaps identified, 0 new tests required (mechanical rename)
- Performance Review: 0 issues found
- NOT in scope: written (backward compatibility, zero-downtime deploy)
- What already exists: written
- TODOS.md updates: 0 items
- Failure modes: 1 critical gap (no integration test for WebSocket `roomId` flow)
- Outside voice: not yet run
- Parallelization: 3 lanes, 2 parallel (A+B) / 1 sequential (C)
- Lake Score: 10/10 — full rename, complete coverage

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| Eng Review | `/plan-eng-review` | Full terminology unification (required) | 1 | planning | 6 issues, 1 critical gap |

- **UNRESOLVED**: 0
- **VERDICT**: ENG PLANNING — ready to implement pending user approval
