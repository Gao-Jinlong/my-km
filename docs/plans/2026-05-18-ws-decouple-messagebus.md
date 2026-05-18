# Plan: Decouple WsGateway from business logic + fix RoomRouter DI error

**Date**: 2026-05-18
**Branch**: main
**Parent plan**: [2026-05-14-ai-gateway-refactor.md](docs/plan/2026-05-14-ai-gateway-refactor.md)

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| Eng Review | `/plan-eng-review` | Architecture & DI fix (required) | 1 | planning | 3 issues identified |

## Problem Statement

The original AI Gateway refactor plan ([2026-05-14](docs/plan/2026-05-14-ai-gateway-refactor.md)) was largely implemented, but two gaps remain:

1. **WsGateway still knows business logic** — it imports `RoomRouter` and `ToolDispatcher`, maps each WebSocket message type to specific method calls. This violates the design goal: WsGateway should be a pure transport layer.

2. **Runtime DI error** — `Nest can't resolve dependencies of the WsGateway (SocketRegistry, ?, ToolDispatcher)` because `RoomRouter` is `@Injectable()` but not registered in any module's `providers` array.

Root cause: Both problems stem from the same design decision — WsGateway directly depends on AI-layer services instead of using an abstraction.

## Proposed Solution: MessageBus pub/sub

Introduce a lightweight `MessageBus` in the `ws/` module. WsGateway becomes a dumb relay; business logic subscribes by message type.

```
Before (tight coupling):                        After (pub/sub):

┌────────────┐                                  ┌────────────┐
│ WsGateway  │                                  │ WsGateway  │
│            │──imports──▶ RoomRouter            │            │──emit──▶ MessageBus
│            │──imports──▶ ToolDispatcher        │            │◀──subscribe── MessageBus
└────────────┘                                  └──────┬─────┘
       ▲                                               │
       │                                               │ publish/subscribe
       └── direct method calls ───────────────────────┘
                                                 ┌──────┴──────┐
                                                 │ MessageBus  │
                                                 └──────┬──────┘
                                                        │
                                          ┌─────────────┼─────────────┐
                                          │             │             │
                                    ┌─────▼────┐ ┌─────▼────┐ ┌─────▼────┐
                                    │ RoomRouter│ │ToolDispatch│ │ future  │
                                    │(subscribes)│ │(subscribes)│ │ modules │
                                    └──────────┘ └──────────┘ └──────────┘
```

### MessageBus interface

```typescript
interface BusMessage {
    type: string;              // e.g. "create_and_send", "tool_result"
    clientId: string;          // who sent it
    payload: Record<string, unknown>;
}

interface MessageHandler {
    allowedTypes: Set<string>; // which message types this handler cares about
    handle(msg: BusMessage): Promise<void>;
}

class MessageBus {
    subscribe(handler: MessageHandler): () => void;  // returns unsubscribe fn
    publish(msg: BusMessage): Promise<void>;         // fan-out to matching handlers
}
```

### WsGateway (after)

WsGateway has only TWO dependencies: `SocketRegistry` and `MessageBus`. No business imports.

```
onMessage(socket, { type, ...payload }):
    MessageBus.publish({ type, clientId: socket.id, payload })

MessageBus.subscribe (outgoing events from business layer):
    socket.emit(event)
```

### AiModule registration

In `AiModule.onModuleInit` (or a dedicated initializer):

```typescript
// Register RoomRouter as handler for room-level messages
this.messageBus.subscribe({
    allowedTypes: new Set(['create_and_send', 'send_message', 'join', 'stop']),
    handle: (msg) => this.roomRouter.handle(msg),
});

// Register ToolDispatcher for tool results
this.messageBus.subscribe({
    allowedTypes: new Set(['tool_result']),
    handle: (msg) => this.toolDispatcher.deliverResult(...),
});
```

## NOT in scope

- Removing the duplicate `SocketRegistry` from `AiModule.providers` — that's a separate bug, fixing it here risks scope creep. I'll flag it as a concern but not change it.
- Conversation→room rename (already scoped out of the parent plan).

## What already exists

| Existing | Will we reuse? |
|----------|---------------|
| `SocketRegistry` | Yes — keep in ws/, WsGateway still needs it |
| `RoomRouter` | Yes — but accessed via MessageBus, not direct DI |
| `ToolDispatcher` | Yes — same, via MessageBus |
| `WsGateway` handlers | Replace with generic relay |
| `AiModule` | Add MessageBus injection and handler registration |

## Implementation Steps

### Step 1: Create `ws/message-bus.ts`

```
apps/server/src/ws/message-bus.ts
```

Lightweight in-memory pub/sub. No external dependencies. ~50 lines.

### Step 2: Update `ws/ws-gateway.ts`

Remove `RoomRouter` and `ToolDispatcher` imports. Constructor becomes:
```typescript
constructor(
    private registry: SocketRegistry,
    private messageBus: MessageBus,
) {}
```

Each `@SubscribeMessage` handler becomes:
```typescript
@SubscribeMessage('create_and_send')
async handleCreateAndSend(data: unknown, @ConnectedSocket() client: Socket): Promise<void> {
    this.messageBus.publish({ type: 'create_and_send', clientId: client.id, payload: data });
}
```

Add an outgoing subscription: on init, subscribe to business-layer events (e.g. `text_chunk`, `error`, etc.) and relay to the correct socket.

### Step 3: Update `ws/ws.module.ts`

```typescript
@Module({
    providers: [WsGateway, SocketRegistry, MessageBus],
    exports: [SocketRegistry, MessageBus],
})
```

### Step 4: Register handlers in `ai/ai.module.ts`

Inject `MessageBus`, register `RoomRouter` and `ToolDispatcher` as handlers. Also add `RoomRouter` to providers (fixing the DI error).

### Step 5: Update tests

- Rewrite `ws-gateway.spec.ts` — no more RoomRouter mocks, just MessageBus publish/subscribe verification.
- Add `message-bus.spec.ts` — unit tests for subscribe/publish/unsubscribe.

## Test Framework Detection

Project uses **Jest** (NestJS default). Config at `apps/server/jest.config.ts` or root `jest.config.ts`.

## Coverage diagram (planned changes)

```
CODE PATHS                                          USER FLOWS
[+] ws/message-bus.ts                               [+] Message routing
  ├── subscribe()                                     ├── [GAP] Handler receives matching messages
  ├── publish()                                       ├── [GAP] Handler ignores non-matching types
  │   ├── [GAP] No handlers registered                └── [GAP] Multiple handlers for same type
  │   ├── [GAP] 1 matching handler
  │   └── [GAP] N matching handlers (fan-out)        [+] Error handling
  └── unsubscribe()                                   ├── [GAP] Handler throws → other handlers still run
      ├── [GAP] Unsubscribe existing                   └── [GAP] Handler throws → error logged
      └── [GAP] Unsubscribe already-removed

[+] ws/ws-gateway.ts (refactored)                   [+] WebSocket lifecycle
  ├── handleConnection()                              ├── [TODO] Connect → registry.register
  ├── handleDisconnect()                              ├── [TODO] Disconnect → cleanup + MessageBus notify
  └── @SubscribeMessage handlers                      └── [TODO] Message → publish to bus
      ├── [GAP] publish to MessageBus
      └── [GAP] relay outgoing events to socket

COVERAGE: 0/11 paths tested (new code)  |  All paths need tests
QUALITY: No existing tests for new code paths
```

## Parallelization

Sequential — each step depends on the previous. No parallel lanes.

## Risk assessment

| Risk | Mitigation |
|------|-----------|
| MessageBus adds latency | Negligible — synchronous in-process fan-out |
| Handler errors crash the bus | Wrap each handler in try/catch, log and continue |
| AiModule → WsModule dependency still exists | Acceptable — infrastructure modules are imported by feature modules |
| SocketRegistry duplicate instance in AiModule | Flagged but not fixing in this scope — separate PR |

## Completion criteria

1. `nest start` runs without DI errors
2. All existing WebSocket message types work end-to-end
3. WsGateway has ZERO imports from `ai/` (except shared types like `ServerMessage`)
4. MessageBus has full unit test coverage
5. WsGateway tests verify publish/relay behavior
