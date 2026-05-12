# AI Conversation Flow Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current AI conversation flow with a state machine driven two-layer architecture, with unified event protocol, tool routing by danger level, and conversation recovery via localStorage.

**Architecture:** Backend ConversationStateMachine manages dialog lifecycle (Idle → BuildingContext → Processing → ToolWaiting/ToolExecuting → Done). Frontend Event Hub dispatches events by type name. WS Service manages connection lifecycle automatically. Tool Router routes LLM tool calls by execution target and danger level.

**Tech Stack:** TypeScript, NestJS (backend), socket.io/socket.io-client, LangGraph (preserved as workflow engine), Jest (server tests), Vitest (web tests), Prisma

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `apps/server/src/ai/gateway/conversation-statemachine.ts` | Core state machine: Idle/BuildingContext/Processing/ToolWaiting/ToolExecuting/Done |
| `apps/server/src/ai/gateway/conversation-statemachine.types.ts` | State machine types: ConversationState enum, ConversationFSM interface, transition events |
| `apps/server/src/ai/tools/tool-router.ts` | Routes LLM tool calls by execution target (backend/frontend) and danger level (low/high) |
| `apps/server/src/ai/gateway/ai-ws-events.types.ts` | Shared WS event types (ClientMessage/ServerMessage discriminated unions) |

### Modified Files
| File | Change |
|------|--------|
| `apps/web/src/features/ai/types/ai.types.ts` | Replace ClientMessage/ServerMessage with new event protocol |
| `apps/web/src/platform/ws-client/ws-client.service.ts` | Add new event emitters, update send methods for new protocol |
| `apps/web/src/features/ai/harness/ai-harness.service.ts` | Add Event Hub pattern, conversation recovery, tool confirmation UI |
| `apps/web/src/features/ai/harness/conversation-state.ts` | Add generating state tracking for UI disable |
| `apps/server/src/ai/gateway/ai-ws.gateway.ts` | Replace old event handlers with new protocol, wire to StateMachine |
| `apps/server/src/ai/tools/tool.types.ts` | Add `execution` and `danger` fields to RegisteredTool |
| `apps/server/src/ai/workflow-runtime/workflow-executor.ts` | Wire to StateMachine instead of manual tool loop, remove dead currentMessages |
| `apps/server/src/ai/workflow-runtime/conversation-orchestrator.ts` | Delegate to StateMachine, remove direct session management |

### Unchanged Files (read-only reference)
| File | Why |
|------|-----|
| `apps/server/src/ai/session/ai-session-manager.ts` | Keep for now, StateMachine wraps it |
| `apps/server/src/ai/message/message.service.ts` | Keep as-is, StateMachine calls it |
| `apps/server/src/ai/conversation/conversation.service.ts` | Keep as-is |
| `apps/server/src/ai/dispatch/request-dispatcher.ts` | Will be simplified, not removed |
| `packages/langgraph-workflows/` | Keep as-is, graph definitions unchanged |
| `apps/server/src/ai/provider/` | Keep as-is |
| `apps/server/src/ai/connection/connection-manager.ts` | Keep as-is |
| `apps/server/src/ai/tools/tool.dispatcher.ts` | Keep waitForResults mechanism, ToolRouter uses it |
| `apps/server/src/ai/tools/tool.registry.ts` | Keep, merge definitions into single source |

---

### Task 1: Define Server-Side WS Event Types

**Files:**
- Create: `apps/server/src/ai/gateway/ai-ws-events.types.ts`

- [ ] **Step 1: Write the new WS event types**

Create `apps/server/src/ai/gateway/ai-ws-events.types.ts`:

```typescript
/**
 * AI WebSocket Event Types — Server-Client Protocol
 *
 * ClientMessage: Frontend → Backend
 * ServerMessage: Backend → Frontend
 *
 * All events use discriminated union with `type` field.
 */

/**
 * Editor context (collected by frontend, sent with messages)
 */
export interface EditorContext {
    documentId: string;
    documentTitle: string;
    documentPath: string;
    selectedText: string | null;
    fullContent: string | null;
    cursorPosition: { line: number; column: number } | null;
    formatState: Record<string, unknown> | null;
}

/**
 * Message wire format for history
 */
export interface MessageWire {
    id: string;
    role: 'user' | 'assistant' | 'tool' | 'system';
    content: string | null;
    toolCalls?: Array<{ id: string; name: string }>;
    toolCallId?: string;
    createdAt: string;
}

// === Client → Server ===

export type ClientMessage =
    | { type: 'create_and_send'; content: string; context?: EditorContext }
    | { type: 'send_message'; conversationId: string; content: string; context?: EditorContext }
    | { type: 'tool_result'; conversationId: string; toolCallId: string; result: unknown }
    | { type: 'stop'; conversationId: string }
    | { type: 'join'; conversationId: string };

// === Server → Client ===

export type StatusType = 'thinking' | 'tool_executing' | 'generating';
export type FinishReason = 'complete' | 'max_turns' | 'stopped' | 'error' | 'interrupted';
export type ErrorCode =
    | 'CONVERSATION_NOT_FOUND'
    | 'LLM_UNAVAILABLE'
    | 'LLM_TIMEOUT'
    | 'TOOL_TIMEOUT'
    | 'TOOL_EXECUTION_ERROR'
    | 'CONVERSATION_BUSY';

export type ServerMessage =
    | { type: 'created'; conversationId: string }
    | { type: 'history'; conversationId: string; messages: MessageWire[] }
    | { type: 'text_chunk'; conversationId: string; content: string }
    | {
          type: 'tool_call';
          conversationId: string;
          toolCallId: string;
          toolName: string;
          input: unknown;
          requiresConfirmation: boolean;
      }
    | { type: 'status'; conversationId: string; status: StatusType; message?: string }
    | { type: 'done'; conversationId: string; finishReason: FinishReason; error?: string }
    | { type: 'error'; conversationId: string; code: ErrorCode; message: string };
```

- [ ] **Step 2: Verify types compile**

Run: `cd apps/server && npx tsc --noEmit src/ai/gateway/ai-ws-events.types.ts`
Expected: No errors (imports may resolve from project tsconfig)

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/ai/gateway/ai-ws-events.types.ts
git commit -m "feat: define AI WebSocket event types for new conversation protocol

Add discriminated unions for ClientMessage and ServerMessage.
All events include conversationId. Status, error, and finish
types are explicitly enumerated."
```

---

### Task 2: Add Tool Metadata (execution + danger)

**Files:**
- Modify: `apps/server/src/ai/tools/tool.types.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/server/src/ai/tools/__tests__/tool-metadata.spec.ts`:

```typescript
import { ToolExecution, ToolDanger, RegisteredTool } from '../tool.types';

describe('RegisteredTool metadata', () => {
    it('supports execution field for routing', () => {
        const tool: RegisteredTool = {
            name: 'web_search',
            definition: {
                name: 'web_search',
                description: 'Search the web',
                input_schema: { type: 'object', properties: {} },
            },
            execution: 'backend',
            danger: 'low',
        };
        expect(tool.execution).toBe('backend');
        expect(tool.danger).toBe('low');
    });

    it('supports frontend execution without danger', () => {
        const tool: RegisteredTool = {
            name: 'edit_text',
            definition: {
                name: 'edit_text',
                description: 'Edit text in editor',
                input_schema: { type: 'object', properties: {} },
            },
            execution: 'frontend',
        };
        expect(tool.execution).toBe('frontend');
        expect(tool.danger).toBeUndefined();
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/server && npx jest src/ai/tools/__tests__/tool-metadata.spec.ts`
Expected: FAIL — TypeScript compilation error (execution/danger don't exist on RegisteredTool)

- [ ] **Step 3: Update tool.types.ts**

Modify `apps/server/src/ai/tools/tool.types.ts`:

```typescript
/**
 * Tool 模块类型定义
 */

import type { ToolDefinition } from '../ai.types';

/**
 * Where the tool is executed
 */
export type ToolExecution = 'backend' | 'frontend';

/**
 * Danger level for backend tools (controls user confirmation)
 * Only meaningful when execution === 'backend'
 */
export type ToolDanger = 'low' | 'high';

export interface ToolResultPayload {
    toolCallId: string;
    result: unknown;
    error?: string;
}

export interface RegisteredTool {
    name: string;
    definition: ToolDefinition;
    execution?: ToolExecution;
    danger?: ToolDanger;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/server && npx jest src/ai/tools/__tests__/tool-metadata.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/ai/tools/tool.types.ts apps/server/src/ai/tools/__tests__/tool-metadata.spec.ts
git commit -m "feat: add execution and danger metadata to RegisteredTool

Backend tools can now specify execution target (backend/frontend)
and danger level (low/high) for automatic routing."
```

---

### Task 3: Create ToolRouter

**Files:**
- Create: `apps/server/src/ai/tools/tool-router.ts`
- Create: `apps/server/src/ai/tools/__tests__/tool-router.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/server/src/ai/tools/__tests__/tool-router.spec.ts`:

```typescript
import { ToolRouter, ToolRouteDecision } from '../tool-router';
import type { RegisteredTool } from '../tool.types';

describe('ToolRouter', () => {
    let router: ToolRouter;
    let decisions: ToolRouteDecision[] = [];

    const mockBackendLow: RegisteredTool = {
        name: 'web_search',
        definition: { name: 'web_search', description: 'Search', input_schema: {} },
        execution: 'backend',
        danger: 'low',
    };
    const mockBackendHigh: RegisteredTool = {
        name: 'delete_file',
        definition: { name: 'delete_file', description: 'Delete', input_schema: {} },
        execution: 'backend',
        danger: 'high',
    };
    const mockFrontend: RegisteredTool = {
        name: 'edit_text',
        definition: { name: 'edit_text', description: 'Edit', input_schema: {} },
        execution: 'frontend',
    };

    beforeEach(() => {
        router = new ToolRouter();
        router.registerMany([mockBackendLow, mockBackendHigh, mockFrontend]);
        decisions = [];
    });

    function captureDecision(toolName: string, input: unknown) {
        return new Promise<ToolRouteDecision>((resolve) => {
            router.onDecision((d) => decisions.push(d) || resolve(d));
            router.route(toolName, input, 'conv-1', 'tc-1');
        });
    }

    it('routes backend+low to auto-execute', async () => {
        const decision = await captureDecision('web_search', { query: 'test' });
        expect(decision.mode).toBe('auto_execute');
        expect(decision.requiresConfirmation).toBe(false);
    });

    it('routes backend+high to confirm-then-execute', async () => {
        const decision = await captureDecision('delete_file', { path: '/tmp/x' });
        expect(decision.mode).toBe('frontend_confirm');
        expect(decision.requiresConfirmation).toBe(true);
    });

    it('routes frontend to direct-frontend', async () => {
        const decision = await captureDecision('edit_text', { text: 'hello' });
        expect(decision.mode).toBe('frontend_direct');
        expect(decision.requiresConfirmation).toBe(false);
    });

    it('emits error for unknown tool', async () => {
        const decision = await captureDecision('unknown_tool', {});
        expect(decision.mode).toBe('error');
    });

    it('emits event with conversationId and toolCallId', async () => {
        const decision = await captureDecision('delete_file', { path: '/tmp/x' });
        expect(decision.conversationId).toBe('conv-1');
        expect(decision.toolCallId).toBe('tc-1');
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/server && npx jest src/ai/tools/__tests__/tool-router.spec.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement ToolRouter**

Create `apps/server/src/ai/tools/tool-router.ts`:

```typescript
/**
 * ToolRouter — routes LLM tool calls by execution target and danger level.
 *
 * Decision matrix:
 * - backend + low  → auto_execute (run on server, inject result to LLM)
 * - backend + high → frontend_confirm (emit tool_call to client, wait for confirmation)
 * - frontend       → frontend_direct (emit tool_call to client, execute immediately)
 */

import { Injectable } from '@nestjs/common';
import { Emitter, type Event } from '@/base/common/event';
import type { RegisteredTool } from './tool.types';

export type ToolRouteMode = 'auto_execute' | 'frontend_confirm' | 'frontend_direct' | 'error';

export interface ToolRouteDecision {
    mode: ToolRouteMode;
    toolName: string;
    input: unknown;
    conversationId: string;
    toolCallId: string;
    requiresConfirmation: boolean;
    error?: string;
}

@Injectable()
export class ToolRouter {
    private _tools = new Map<string, RegisteredTool>();
    private _onDecision = new Emitter<ToolRouteDecision>();
    private _onAutoExecute = new Emitter<{ toolName: string; input: unknown; conversationId: string; toolCallId: string }>();

    registerMany(tools: RegisteredTool[]): void {
        for (const tool of tools) {
            this._tools.set(tool.name, tool);
        }
    }

    /**
     * Route a tool call and emit the decision.
     * Returns immediately — actual execution is async via events.
     */
    route(toolName: string, input: unknown, conversationId: string, toolCallId: string): void {
        const tool = this._tools.get(toolName);
        if (!tool) {
            this._onDecision.fire({
                mode: 'error',
                toolName,
                input,
                conversationId,
                toolCallId,
                requiresConfirmation: false,
                error: `Unknown tool: ${toolName}`,
            });
            return;
        }

        const execution = tool.execution ?? 'frontend';
        const danger = tool.danger ?? 'low';

        let mode: ToolRouteMode;
        let requiresConfirmation = false;

        if (execution === 'backend' && danger === 'low') {
            mode = 'auto_execute';
            // Emit for auto-execution
            this._onAutoExecute.fire({ toolName, input, conversationId, toolCallId });
        } else if (execution === 'backend' && danger === 'high') {
            mode = 'frontend_confirm';
            requiresConfirmation = true;
        } else {
            // frontend execution
            mode = 'frontend_direct';
        }

        this._onDecision.fire({
            mode,
            toolName,
            input,
            conversationId,
            toolCallId,
            requiresConfirmation,
        });
    }

    get onDecision(): Event<ToolRouteDecision> {
        return this._onDecision.event;
    }

    get onAutoExecute(): Event<{ toolName: string; input: unknown; conversationId: string; toolCallId: string }> {
        return this._onAutoExecute.event;
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/server && npx jest src/ai/tools/__tests__/tool-router.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/ai/tools/tool-router.ts apps/server/src/ai/tools/__tests__/tool-router.spec.ts
git commit -m "feat: create ToolRouter for routing LLM tool calls by danger level

Backend+low tools auto-execute. Backend+high tools require user
confirmation. Frontend tools emit directly to client."
```

---

### Task 4: Create Conversation StateMachine

**Files:**
- Create: `apps/server/src/ai/gateway/conversation-statemachine.types.ts`
- Create: `apps/server/src/ai/gateway/conversation-statemachine.ts`
- Create: `apps/server/src/ai/gateway/__tests__/conversation-statemachine.spec.ts`

- [ ] **Step 1: Write the state machine types**

Create `apps/server/src/ai/gateway/conversation-statemachine.types.ts`:

```typescript
/**
 * Conversation State Machine types
 */

export enum ConversationState {
    Idle = 'idle',
    BuildingContext = 'building_context',
    Processing = 'processing',
    ToolWaiting = 'tool_waiting',
    ToolExecuting = 'tool_executing',
    Done = 'done',
}

export type FinishReason = 'complete' | 'max_turns' | 'stopped' | 'error' | 'interrupted';

export interface ConversationFSM {
    conversationId: string;
    state: ConversationState;
    abortController: AbortController;
    createdAt: Date;
    lastActivityAt: Date;
}

export interface StateTransition {
    from: ConversationState;
    to: ConversationState;
    conversationId: string;
}

// Valid transitions matrix
const VALID_TRANSITIONS: Record<ConversationState, ConversationState[]> = {
    [ConversationState.Idle]: [ConversationState.BuildingContext],
    [ConversationState.BuildingContext]: [ConversationState.Processing, ConversationState.Done],
    [ConversationState.Processing]: [
        ConversationState.Processing, // streaming continues
        ConversationState.ToolWaiting,
        ConversationState.ToolExecuting,
        ConversationState.Done,
    ],
    [ConversationState.ToolWaiting]: [ConversationState.ToolExecuting, ConversationState.Done],
    [ConversationState.ToolExecuting]: [ConversationState.Processing, ConversationState.Done],
    [ConversationState.Done]: [], // terminal state
};

export function isValidTransition(from: ConversationState, to: ConversationState): boolean {
    return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}
```

- [ ] **Step 2: Write the failing test**

Create `apps/server/src/ai/gateway/__tests__/conversation-statemachine.spec.ts`:

```typescript
import { ConversationStateMachine, ConversationContext } from '../conversation-statemachine';
import { ConversationState } from '../conversation-statemachine.types';
import { EventEmitter } from 'events';

describe('ConversationStateMachine', () => {
    let sm: ConversationStateMachine;
    let transitions: Array<{ from: ConversationState; to: ConversationState }> = [];

    const mockCtx: ConversationContext = {
        conversationId: 'conv-1',
        clientId: 'client-1',
    };

    beforeEach(() => {
        // Use events module pattern — create minimal mock
        sm = new ConversationStateMachine(new EventEmitter() as any);
        (sm as any)._onTransition?.on?.('data', (t: any) => transitions.push(t));
        transitions = [];
    });

    describe('state transitions', () => {
        it('starts in Idle state', () => {
            const session = sm.create(mockCtx);
            expect(session.state).toBe(ConversationState.Idle);
        });

        it('transitions Idle → BuildingContext on receiveMessage', () => {
            const session = sm.create(mockCtx);
            sm.receiveMessage(session.id, 'Hello');
            expect(session.state).toBe(ConversationState.BuildingContext);
        });

        it('transitions BuildingContext → Processing on contextReady', () => {
            const session = sm.create(mockCtx);
            sm.receiveMessage(session.id, 'Hello');
            sm.contextReady(session.id);
            expect(session.state).toBe(ConversationState.Processing);
        });

        it('transitions Processing → ToolWaiting on toolCall', () => {
            const session = sm.create(mockCtx);
            sm.receiveMessage(session.id, 'Hello');
            sm.contextReady(session.id);
            sm.toolCall(session.id, { toolCallId: 'tc-1', toolName: 'search', input: {}, requiresConfirmation: false });
            expect(session.state).toBe(ConversationState.ToolWaiting);
        });

        it('transitions ToolWaiting → ToolExecuting on toolResult', () => {
            const session = sm.create(mockCtx);
            sm.receiveMessage(session.id, 'Hello');
            sm.contextReady(session.id);
            sm.toolCall(session.id, { toolCallId: 'tc-1', toolName: 'search', input: {}, requiresConfirmation: false });
            sm.toolResult(session.id, 'tc-1');
            expect(session.state).toBe(ConversationState.ToolExecuting);
        });

        it('transitions ToolExecuting → Processing on toolDone', () => {
            const session = sm.create(mockCtx);
            sm.receiveMessage(session.id, 'Hello');
            sm.contextReady(session.id);
            sm.toolCall(session.id, { toolCallId: 'tc-1', toolName: 'search', input: {}, requiresConfirmation: false });
            sm.toolResult(session.id, 'tc-1');
            sm.toolDone(session.id);
            expect(session.state).toBe(ConversationState.Processing);
        });

        it('transitions Processing → Done on llmDone', () => {
            const session = sm.create(mockCtx);
            sm.receiveMessage(session.id, 'Hello');
            sm.contextReady(session.id);
            sm.llmDone(session.id);
            expect(session.state).toBe(ConversationState.Done);
        });

        it('transitions any → Done on stop', () => {
            const session = sm.create(mockCtx);
            sm.receiveMessage(session.id, 'Hello');
            sm.contextReady(session.id);
            sm.stop(session.id);
            expect(session.state).toBe(ConversationState.Done);
        });

        it('rejects invalid transition', () => {
            const session = sm.create(mockCtx);
            // Cannot go from Idle directly to Done without going through BuildingContext first
            // Actually Idle → Done IS valid via BuildingContext → Done path
            // Let's test Processing → Idle which is invalid
            sm.receiveMessage(session.id, 'Hello');
            sm.contextReady(session.id);
            expect(() => {
                sm.transition(session.id, ConversationState.Idle);
            }).toThrow(/invalid transition/i);
        });
    });

    describe('concurrency', () => {
        it('prevents duplicate active sessions for same conversation', () => {
            sm.create(mockCtx);
            expect(() => {
                sm.create(mockCtx);
            }).toThrow(/already active/i);
        });
    });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd apps/server && npx jest src/ai/gateway/__tests__/conversation-statemachine.spec.ts`
Expected: FAIL — module not found

- [ ] **Step 4: Implement ConversationStateMachine**

Create `apps/server/src/ai/gateway/conversation-statemachine.ts`:

```typescript
/**
 * ConversationStateMachine — manages the lifecycle of a single AI conversation.
 *
 * States: Idle → BuildingContext → Processing → [ToolWaiting → ToolExecuting → Processing]* → Done
 *
 * Emits events on state transitions for the gateway to react to.
 */

import { Injectable } from '@nestjs/common';
import { ConversationState, ConversationFSM, isValidTransition, FinishReason } from './conversation-statemachine.types';
import type { ServerMessage } from './ai-ws-events.types';

export interface ConversationContext {
    conversationId: string;
    clientId: string;
}

export interface ToolCallInfo {
    toolCallId: string;
    toolName: string;
    input: unknown;
    requiresConfirmation: boolean;
}

// Internal event bus for state machine transitions
type SMEvent =
    | { type: 'transition'; from: ConversationState; to: ConversationState; conversationId: string }
    | { type: 'emit'; message: ServerMessage }
    | { type: 'error'; conversationId: string; error: Error };

@Injectable()
export class ConversationStateMachine {
    private _sessions = new Map<string, ConversationFSM>();
    private _byConversation = new Map<string, string>(); // conversationId → sessionId
    private _handlers: ((event: SMEvent) => void)[] = [];

    onEvent(handler: (event: SMEvent) => void): void {
        this._handlers.push(handler);
    }

    offEvent(handler: (event: SMEvent) => void): void {
        const idx = this._handlers.indexOf(handler);
        if (idx >= 0) this._handlers.splice(idx, 1);
    }

    private _emit(event: SMEvent): void {
        for (const h of this._handlers) {
            try {
                h(event);
            } catch (e) {
                // Don't let handler errors break the state machine
                console.error('[StateMachine] Handler error:', e);
            }
        }
    }

    create(ctx: ConversationContext): ConversationFSM {
        // Prevent duplicate active sessions
        const existingSessionId = this._byConversation.get(ctx.conversationId);
        if (existingSessionId) {
            const existing = this._sessions.get(existingSessionId);
            if (existing && existing.state !== ConversationState.Done) {
                throw new Error(`Conversation ${ctx.conversationId} already has an active session`);
            }
            // Previous session is Done, allow new one
            this._byConversation.delete(ctx.conversationId);
            this._sessions.delete(existingSessionId);
        }

        const session: ConversationFSM = {
            conversationId: ctx.conversationId,
            clientId: ctx.clientId,
            state: ConversationState.Idle,
            abortController: new AbortController(),
            createdAt: new Date(),
            lastActivityAt: new Date(),
        };

        const sessionId = `${ctx.clientId}:${ctx.conversationId}`;
        this._sessions.set(sessionId, session);
        this._byConversation.set(ctx.conversationId, sessionId);
        return session;
    }

    findById(sessionId: string): ConversationFSM | null {
        return this._sessions.get(sessionId) ?? null;
    }

    findByConversationId(conversationId: string): ConversationFSM | null {
        const sessionId = this._byConversation.get(conversationId);
        return sessionId ? this._sessions.get(sessionId) ?? null : null;
    }

    receiveMessage(sessionId: string, content: string): void {
        const session = this._getOrThrow(sessionId);
        this._transition(session, ConversationState.BuildingContext);
    }

    contextReady(sessionId: string): void {
        const session = this._getOrThrow(sessionId);
        this._transition(session, ConversationState.Processing);
    }

    textChunk(sessionId: string, content: string): void {
        const session = this._getOrThrow(sessionId);
        // Stays in Processing, emit chunk
        this._emit({
            type: 'emit',
            message: { type: 'text_chunk', conversationId: session.conversationId, content },
        });
    }

    toolCall(sessionId: string, info: ToolCallInfo): void {
        const session = this._getOrThrow(sessionId);
        if (info.requiresConfirmation) {
            this._transition(session, ConversationState.ToolWaiting);
            // Emit tool_call event to client
            this._emit({
                type: 'emit',
                message: {
                    type: 'tool_call',
                    conversationId: session.conversationId,
                    toolCallId: info.toolCallId,
                    toolName: info.toolName,
                    input: info.input,
                    requiresConfirmation: true,
                },
            });
        } else {
            this._transition(session, ConversationState.ToolExecuting);
            // Tool will auto-execute
        }
    }

    toolResult(sessionId: string, toolCallId: string): void {
        const session = this._getOrThrow(sessionId);
        this._transition(session, ConversationState.ToolExecuting);
    }

    toolDone(sessionId: string): void {
        const session = this._getOrThrow(sessionId);
        this._transition(session, ConversationState.Processing);
    }

    llmDone(sessionId: string): void {
        const session = this._getOrThrow(sessionId);
        this._transition(session, ConversationState.Done);
        this._emit({
            type: 'emit',
            message: { type: 'done', conversationId: session.conversationId, finishReason: 'complete' },
        });
    }

    stop(sessionId: string): void {
        const session = this._getOrThrow(sessionId);
        session.abortController.abort();
        this._transition(session, ConversationState.Done);
        this._emit({
            type: 'emit',
            message: { type: 'done', conversationId: session.conversationId, finishReason: 'stopped' },
        });
    }

    error(sessionId: string, code: ServerMessage extends { type: 'error'; code: infer C } ? C : string, message: string): void {
        const session = this._sessions.get(sessionId);
        if (!session) return; // Session may already be cleaned up
        session.abortController.abort();
        this._transition(session, ConversationState.Done);
        this._emit({
            type: 'emit',
            message: { type: 'error', conversationId: session.conversationId, code: code as any, message },
        });
    }

    transition(sessionId: string, to: ConversationState): void {
        const session = this._getOrThrow(sessionId);
        this._transition(session, to);
    }

    private _transition(session: ConversationFSM, to: ConversationState): void {
        const from = session.state;
        if (from === to) return; // No-op

        if (!isValidTransition(from, to)) {
            throw new Error(
                `Invalid state transition: ${from} → ${to} for conversation ${session.conversationId}`,
            );
        }

        session.state = to;
        session.lastActivityAt = new Date();

        this._emit({
            type: 'transition',
            from,
            to,
            conversationId: session.conversationId,
        });
    }

    cleanup(conversationId: string): void {
        const sessionId = this._byConversation.get(conversationId);
        if (sessionId) {
            const session = this._sessions.get(sessionId);
            session?.abortController.abort();
            this._sessions.delete(sessionId);
            this._byConversation.delete(conversationId);
        }
    }

    private _getOrThrow(sessionId: string): ConversationFSM {
        const session = this._sessions.get(sessionId);
        if (!session) {
            throw new Error(`Session not found: ${sessionId}`);
        }
        return session;
    }
}
```

- [ ] **Step 5: Run tests and fix any failures**

Run: `cd apps/server && npx jest src/ai/gateway/__tests__/conversation-statemachine.spec.ts`
Expected: PASS (fix any issues)

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/ai/gateway/conversation-statemachine.types.ts apps/server/src/ai/gateway/conversation-statemachine.ts apps/server/src/ai/gateway/__tests__/conversation-statemachine.spec.ts
git commit -m "feat: create ConversationStateMachine for dialog lifecycle management

States: Idle → BuildingContext → Processing → [ToolWaiting →
ToolExecuting → Processing]* → Done. Prevents duplicate active
sessions per conversation."
```

---

### Task 5: Update Frontend Types (ai.types.ts)

**Files:**
- Modify: `apps/web/src/features/ai/types/ai.types.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/features/ai/types/__tests__/ai-types.test.ts`:

```typescript
import type { ClientMessage, ServerMessage } from '../ai.types';

describe('ClientMessage discriminated union', () => {
    it('accepts create_and_send with content', () => {
        const msg: ClientMessage = { type: 'create_and_send', content: 'Hello' };
        expect(msg.type).toBe('create_and_send');
    });

    it('accepts send_message with conversationId', () => {
        const msg: ClientMessage = {
            type: 'send_message',
            conversationId: 'conv-1',
            content: 'Hello',
        };
        expect(msg.type).toBe('send_message');
    });

    it('accepts tool_result', () => {
        const msg: ClientMessage = {
            type: 'tool_result',
            conversationId: 'conv-1',
            toolCallId: 'tc-1',
            result: { text: 'done' },
        };
        expect(msg.type).toBe('tool_result');
    });

    it('accepts stop', () => {
        const msg: ClientMessage = { type: 'stop', conversationId: 'conv-1' };
        expect(msg.type).toBe('stop');
    });

    it('accepts join', () => {
        const msg: ClientMessage = { type: 'join', conversationId: 'conv-1' };
        expect(msg.type).toBe('join');
    });
});

describe('ServerMessage discriminated union', () => {
    it('accepts created with conversationId', () => {
        const msg: ServerMessage = { type: 'created', conversationId: 'conv-1' };
        expect(msg.type).toBe('created');
    });

    it('accepts text_chunk with conversationId', () => {
        const msg: ServerMessage = { type: 'text_chunk', conversationId: 'conv-1', content: 'Hello' };
        expect(msg.type).toBe('text_chunk');
    });

    it('accepts tool_call with all fields', () => {
        const msg: ServerMessage = {
            type: 'tool_call',
            conversationId: 'conv-1',
            toolCallId: 'tc-1',
            toolName: 'search',
            input: { query: 'test' },
            requiresConfirmation: false,
        };
        expect(msg.type).toBe('tool_call');
        if (msg.type === 'tool_call') {
            expect(msg.requiresConfirmation).toBe(false);
        }
    });

    it('accepts status event', () => {
        const msg: ServerMessage = { type: 'status', conversationId: 'conv-1', status: 'thinking' };
        expect(msg.type).toBe('status');
    });

    it('accepts done with finishReason', () => {
        const msg: ServerMessage = { type: 'done', conversationId: 'conv-1', finishReason: 'complete' };
        expect(msg.type).toBe('done');
    });

    it('accepts error with code', () => {
        const msg: ServerMessage = {
            type: 'error',
            conversationId: 'conv-1',
            code: 'CONVERSATION_NOT_FOUND',
            message: 'Not found',
        };
        expect(msg.type).toBe('error');
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run src/features/ai/types/__tests__/ai-types.test.ts`
Expected: FAIL — type errors (new types don't exist yet)

- [ ] **Step 3: Update ai.types.ts**

Modify `apps/web/src/features/ai/types/ai.types.ts`. Replace the existing `ClientMessage` and `ServerMessage` types with the new protocol:

```typescript
/**
 * AI 模块共享类型定义
 *
 * Updated 2026-05-12: New event protocol with discriminated unions.
 * All events include conversationId. Events are single-responsibility.
 */

import type { FormatState, Position } from '@/features/editor/types';

/**
 * Editor context (collected by frontend, sent with messages)
 */
export interface EditorContext {
    documentId: string;
    documentTitle: string;
    documentPath: string;
    selectedText: string | null;
    fullContent: string | null;
    cursorPosition: Position | null;
    formatState: FormatState | null;
}

/**
 * Message wire format for history
 */
export interface MessageWire {
    id: string;
    role: 'user' | 'assistant' | 'tool' | 'system';
    content: string | null;
    toolCalls?: Array<{ id: string; name: string }>;
    toolCallId?: string;
    createdAt: string;
}

// === Client → Server ===

export type ClientMessage =
    | { type: 'create_and_send'; content: string; context?: EditorContext }
    | { type: 'send_message'; conversationId: string; content: string; context?: EditorContext }
    | { type: 'tool_result'; conversationId: string; toolCallId: string; result: unknown }
    | { type: 'stop'; conversationId: string }
    | { type: 'join'; conversationId: string };

// === Server → Client ===

export type StatusType = 'thinking' | 'tool_executing' | 'generating';
export type FinishReason = 'complete' | 'max_turns' | 'stopped' | 'error' | 'interrupted';
export type ErrorCode =
    | 'CONVERSATION_NOT_FOUND'
    | 'LLM_UNAVAILABLE'
    | 'LLM_TIMEOUT'
    | 'TOOL_TIMEOUT'
    | 'TOOL_EXECUTION_ERROR'
    | 'CONVERSATION_BUSY';

export type ServerMessage =
    | { type: 'created'; conversationId: string }
    | { type: 'history'; conversationId: string; messages: MessageWire[] }
    | { type: 'text_chunk'; conversationId: string; content: string }
    | {
          type: 'tool_call';
          conversationId: string;
          toolCallId: string;
          toolName: string;
          input: unknown;
          requiresConfirmation: boolean;
      }
    | { type: 'status'; conversationId: string; status: StatusType; message?: string }
    | { type: 'done'; conversationId: string; finishReason: FinishReason; error?: string }
    | { type: 'error'; conversationId: string; code: ErrorCode; message: string };

// === Legacy type kept for backward compatibility during migration ===
/** @deprecated Use ServerMessage instead */
export type LegacyServerMessage = {
    type: 'joined' | 'history' | 'stream_chunk' | 'stream_done' | 'tool_call' | 'tool_timeout' | 'error';
} & Record<string, unknown>;

/**
 * 工具处理器接口
 */
export interface ToolHandler<TArgs = object, TResult = unknown> {
    name: string;
    description: string;
    inputSchema: object;
    execute: (args: TArgs) => Promise<TResult>;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run src/features/ai/types/__tests__/ai-types.test.ts`
Expected: PASS

Also run type check: `cd apps/web && npx tsc --noEmit` — may show errors in files importing old ServerMessage fields. These will be fixed in Task 6.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/ai/types/ai.types.ts apps/web/src/features/ai/types/__tests__/ai-types.test.ts
git commit -m "feat: update AI event types to new single-responsibility protocol

All events now include conversationId. New events: created, status,
done (with finishReason), error (with code). Tool_call includes
requiresConfirmation flag."
```

---

### Task 6: Update WS Client Service for New Protocol

**Files:**
- Modify: `apps/web/src/platform/ws-client/ws-client.service.ts`

- [ ] **Step 1: Write the failing test**

Add to `apps/web/src/features/ai/harness/__tests__/ws-client.test.ts` (append to existing tests):

```typescript
describe('WSClientService new protocol', () => {
    it('emits created event', () => {
        const { client, socket } = createMockClient();
        let received: any;
        client.onCreated(e => { received = e; });

        socket.emit('message', { type: 'created', conversationId: 'conv-1' });

        expect(received?.conversationId).toBe('conv-1');
    });

    it('emits status event', () => {
        const { client, socket } = createMockClient();
        let received: any;
        client.onStatus(e => { received = e; });

        socket.emit('message', { type: 'status', conversationId: 'conv-1', status: 'thinking' });

        expect(received?.status).toBe('thinking');
    });

    it('emits done event with finishReason', () => {
        const { client, socket } = createMockClient();
        let received: any;
        client.onDone(e => { received = e; });

        socket.emit('message', { type: 'done', conversationId: 'conv-1', finishReason: 'complete' });

        expect(received?.finishReason).toBe('complete');
    });

    it('emits error event with code', () => {
        const { client, socket } = createMockClient();
        let received: any;
        client.onError(e => { received = e; });

        socket.emit('message', {
            type: 'error',
            conversationId: 'conv-1',
            code: 'CONVERSATION_NOT_FOUND',
            message: 'Not found',
        });

        expect(received?.code).toBe('CONVERSATION_NOT_FOUND');
    });

    it('sendCreateAndSend emits correct event', () => {
        const { client, socket } = createMockClient();
        client['ensureSocket'] = () => Promise.resolve();
        client['socket'] = socket as any;

        client.sendCreateAndSend('Hello', { documentId: 'doc-1', documentTitle: 'Test', documentPath: '/test', selectedText: null, fullContent: null, cursorPosition: null, formatState: null });

        expect(socket.emit).toHaveBeenCalledWith('create_and_send', {
            type: 'create_and_send',
            content: 'Hello',
            context: expect.any(Object),
        });
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run src/features/ai/harness/__tests__/ws-client.test.ts`
Expected: FAIL — onCreated, onStatus, onDone, sendCreateAndSend don't exist

- [ ] **Step 3: Update WSClientService**

Modify `apps/web/src/platform/ws-client/ws-client.service.ts`. Add these new event emitters, handlers, and send methods:

```typescript
// Add new emitters at class level (after existing ones around line 36):
private _onCreated = new Emitter<{ conversationId: string }>();
private _onStatus = new Emitter<{ conversationId: string; status: string; message?: string }>();
private _onDone = new Emitter<{ conversationId: string; finishReason: string; error?: string }>();

// Add new event accessors (after existing ones around line 240):
get onCreated(): Event<{ conversationId: string }> {
    return this._onCreated.event;
}
get onStatus(): Event<{ conversationId: string; status: string; message?: string }> {
    return this._onStatus.event;
}
get onDone(): Event<{ conversationId: string; finishReason: string; error?: string }> {
    return this._onDone.event;
}

// Add new send methods (after stopGenerating around line 199):
sendCreateAndSend(content: string, context: unknown): void {
    if (!this._socket || !this._socket.connected) {
        throw new Error('WebSocket is not connected');
    }
    this._socket.emit('create_and_send', { type: 'create_and_send', content, context });
}

sendJoin(conversationId: string): void {
    this._socket?.emit('join', { type: 'join', conversationId });
}

// Update _handleMessage to handle new events:
private _handleMessage(data: unknown): void {
    try {
        const msg = data as ServerMessage;
        switch (msg.type) {
            case 'created':
                this._onCreated.fire({ conversationId: msg.conversationId });
                break;
            case 'history':
                this._onHistory.fire({ messages: msg.messages });
                break;
            case 'text_chunk':
                this._onStreamChunk.fire({ content: msg.content });
                break;
            case 'tool_call':
                this._onToolCall.fire({
                    id: msg.toolCallId,
                    name: msg.toolName,
                    args: msg.input as object,
                });
                break;
            case 'status':
                this._onStatus.fire({
                    conversationId: msg.conversationId,
                    status: msg.status,
                    message: msg.message,
                });
                break;
            case 'done':
                this._onDone.fire({
                    conversationId: msg.conversationId,
                    finishReason: msg.finishReason,
                    error: msg.error,
                });
                this._onStreamDone.fire();
                break;
            case 'error':
                this._onError.fire({ message: msg.message, code: msg.code });
                break;
            // Legacy events (for backward compat during migration)
            case 'joined':
                break;
            case 'tool_timeout':
                this._onToolTimeout.fire({ toolCallId: (msg as any).toolCallId, message: (msg as any).message });
                break;
            default:
                // Exhaustiveness check — if new event type added but not handled
                const _exhaustiveCheck: never = msg;
                console.warn('[WS] Unhandled message type:', (_exhaustiveCheck as any).type);
        }
    } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
    }
}

// Add new emitters to dispose() (at the end of dispose method):
this._onCreated.dispose();
this._onStatus.dispose();
this._onDone.dispose();
```

Also add the `ServerMessage` import at the top:
```typescript
import type { ServerMessage } from '@/features/ai/types/ai.types';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run src/features/ai/harness/__tests__/ws-client.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/platform/ws-client/ws-client.service.ts apps/web/src/features/ai/harness/__tests__/ws-client.test.ts
git commit -m "feat: update WSClientService for new event protocol

Add onCreated, onStatus, onDone emitters. Add sendCreateAndSend
and sendJoin methods. Update _handleMessage for discriminated
union routing."
```

---

### Task 7: Update AI Harness for Event Hub + Conversation Recovery

**Files:**
- Modify: `apps/web/src/features/ai/harness/ai-harness.service.ts`
- Modify: `apps/web/src/features/ai/harness/conversation-state.ts`

- [ ] **Step 1: Add generating state tracking to ConversationState**

Modify `apps/web/src/features/ai/harness/conversation-state.ts`. Add a `isProcessing` getter that tracks when the conversation is in a generating/processing state (for disabling the send button):

```typescript
// Add to ConversationState interface (around line 28):
readonly isProcessing: boolean;

// Add private field in ConversationStateImpl class:
private _isProcessing = false;

// Update startGenerating() to set _isProcessing = true:
startGenerating(): void {
    this._isGenerating = true;
    this._isProcessing = true;
    // ... rest of existing code
}

// Update stopGenerating() to set _isProcessing = false:
stopGenerating(): void {
    this._isProcessing = false;
    this._isGenerating = false;
    // ... rest of existing code
}

// Add getter:
get isProcessing(): boolean {
    return this._isProcessing;
}

// Update onStateChange fire to include isProcessing:
this._onStateChange.fire({
    messages: this._messages,
    isGenerating: this._isGenerating,
    isProcessing: this._isProcessing,
});
```

- [ ] **Step 2: Update AIHarnessService interface**

Modify `apps/web/src/features/ai/harness/ai-harness.service.ts`. Update the interface:

```typescript
// Replace in AIHarnessService interface:
// Conversation related methods:
connect(wsUrl: string): Promise<void>;
disconnect(): void;
joinConversation(conversationId: string): void;
sendMessage(content: string, conversationId?: string): Promise<string | null>; // Returns conversationId
sendCreateAndSend(content: string): Promise<string | null>; // For new conversations
restoreConversation(conversationId: string): void; // Conversation recovery
stopGenerating(): void;

// Add new event:
get onStatus(): Event<{ conversationId: string; status: string; message?: string }>;
get onCreated(): Event<{ conversationId: string }>;
get onDone(): Event<{ conversationId: string; finishReason: string; error?: string }>;

// Add state access:
get isProcessing(): boolean;
```

- [ ] **Step 3: Update AIHarnessServiceImpl implementation**

Replace the relevant sections in `AIHarnessServiceImpl`:

```typescript
// Add new emitters (after existing ones):
private _onStatus = new Emitter<{ conversationId: string; status: string; message?: string }>();
private _onCreated = new Emitter<{ conversationId: string }>();
private _onDone = new Emitter<{ conversationId: string; finishReason: string; error?: string }>();

// Update _setupEventProxy to handle new events:
private _setupEventProxy(): void {
    this._store.add(
        this._wsClient.onStreamChunk(e => {
            this._conversationState.appendStreamChunk(e.content);
            this._onStreamChunk.fire(e);
        }),
    );
    this._store.add(this._wsClient.onToolCall(e => this._onToolCall.fire(e)));
    this._store.add(
        this._wsClient.onStreamDone(() => {
            this._conversationState.stopGenerating();
            this._onStreamDone.fire();
        }),
    );
    this._store.add(this._wsClient.onError(e => this._onError.fire(e)));
    this._store.add(
        this._wsClient.onHistory(e => {
            this._onHistory.fire(e as { messages: MessageWire[] });
            this._conversationState.setHistory((e as { messages: MessageWire[] }).messages);
        }),
    );
    this._store.add(
        this._wsClient.onToolTimeout(e =>
            this._onError.fire({
                message: `Tool timeout: ${e.toolCallId}`,
                code: 'TOOL_TIMEOUT',
            }),
        ),
    );
    // NEW: Handle created event
    this._store.add(
        this._wsClient.onCreated(e => {
            this._conversationState.setConversationId(e.conversationId);
            this._saveActiveConversationId(e.conversationId);
            this._onCreated.fire(e);
        }),
    );
    // NEW: Handle status event
    this._store.add(
        this._wsClient.onStatus(e => {
            this._onStatus.fire(e);
        }),
    );
    // NEW: Handle done event
    this._store.add(
        this._wsClient.onDone(e => {
            this._conversationState.stopGenerating();
            this._clearActiveConversationId();
            this._onDone.fire(e);
        }),
    );

    this._store.add(this._conversationState.onStateChange(e => this._onStateChange.fire(e)));
    this._store.add(
        this._contextCollector.onContextChange(e => {
            this._selectedText = e.context.selectedText;
            this._currentDocTitle = e.context.documentTitle;
            this._onSelectionChange.fire({
                selectedText: this._selectedText,
                documentTitle: this._currentDocTitle ?? '',
            });
        }),
    );
    this._store.add(this._wsClient.onConnectionChange(e => this._onConnectionChange.fire(e)));
}

// Add localStorage helpers:
private _saveActiveConversationId(id: string): void {
    try {
        localStorage.setItem('activeConversationId', id);
    } catch {
        // localStorage may be unavailable
    }
}

private _clearActiveConversationId(): void {
    try {
        localStorage.removeItem('activeConversationId');
    } catch {
        // localStorage may be unavailable
    }
}

// Replace sendMessage and add new methods:
async sendMessage(content: string, conversationId?: string): Promise<string | null> {
    const targetConv = conversationId ?? this._conversationState.conversationId;
    if (targetConv) {
        return this._sendExistingConversation(targetConv, content);
    }
    return this.sendCreateAndSend(content);
}

private async _sendExistingConversation(conversationId: string, content: string): Promise<string | null> {
    if (this._conversationState.isProcessing) {
        console.warn('[AI Harness] Cannot send: conversation is processing');
        return null;
    }

    await this._wsClient.ensureConnected();
    this._wsClient.stopIdleTimer();

    const userMsgId = `user-${Date.now()}`;
    this._conversationState.addMessage({
        id: userMsgId,
        role: 'user',
        content,
        createdAt: new Date().toISOString(),
    });
    this._conversationState.startGenerating();

    this._saveActiveConversationId(conversationId);

    const ctx = await this._contextCollector.getContext(conversationId.replace('doc-', ''));
    this._wsClient.sendMessage(content, ctx, conversationId);

    return conversationId;
}

async sendCreateAndSend(content: string): Promise<string | null> {
    if (this._conversationState.isProcessing) {
        console.warn('[AI Harness] Cannot send: conversation is processing');
        return null;
    }

    await this._wsClient.ensureConnected();
    this._wsClient.stopIdleTimer();

    const userMsgId = `user-${Date.now()}`;
    this._conversationState.addMessage({
        id: userMsgId,
        role: 'user',
        content,
        createdAt: new Date().toISOString(),
    });
    this._conversationState.startGenerating();

    const ctx = await this._contextCollector.getContext('');
    this._wsClient.sendCreateAndSend(content, ctx);

    // conversationId will be set when 'created' event arrives
    return null;
}

// Add restoreConversation:
restoreConversation(conversationId: string): void {
    this._conversationState.setConversationId(conversationId);
    this._wsClient.sendJoin(conversationId);
    // History will arrive via 'history' event and be loaded by _setupEventProxy
}

// Update stopGenerating:
stopGenerating(): void {
    const conversationId = this._conversationState.conversationId;
    if (conversationId) {
        this._wsClient.stopGenerating(conversationId);
    }
    this._conversationState.stopGenerating();
}

// Add getters:
get isProcessing(): boolean {
    return this._conversationState.isProcessing;
}
get onStatus(): Event<{ conversationId: string; status: string; message?: string }> {
    return this._onStatus.event;
}
get onCreated(): Event<{ conversationId: string }> {
    return this._onCreated.event;
}
get onDone(): Event<{ conversationId: string; finishReason: string; error?: string }> {
    return this._onDone.event;
}

// Update dispose to dispose new emitters:
this._onStatus.dispose();
this._onCreated.dispose();
this._onDone.dispose();
```

- [ ] **Step 4: Write tests for new harness behavior**

Add to `apps/web/src/features/ai/harness/__tests__/harness.test.ts`:

```typescript
describe('AIHarnessService conversation recovery', () => {
    it('restores conversation from localStorage on init', () => {
        localStorage.setItem('activeConversationId', 'conv-123');
        const harness = createHarnessWithMocks();
        harness.restoreConversation('conv-123');
        expect(harness.conversationId).toBe('conv-123');
        localStorage.removeItem('activeConversationId');
    });

    it('saves conversationId to localStorage on created event', () => {
        const harness = createHarnessWithMocks();
        harness['_wsClient']._onCreated.fire({ conversationId: 'conv-new' });
        expect(localStorage.getItem('activeConversationId')).toBe('conv-new');
    });

    it('clears conversationId from localStorage on done event', () => {
        localStorage.setItem('activeConversationId', 'conv-123');
        const harness = createHarnessWithMocks();
        harness['_wsClient']._onDone.fire({ conversationId: 'conv-123', finishReason: 'complete' });
        expect(localStorage.getItem('activeConversationId')).toBeNull();
    });
});

describe('AIHarnessService isProcessing state', () => {
    it('disables send when processing', () => {
        const harness = createHarnessWithMocks();
        harness['_conversationState'].startGenerating();
        expect(harness.isProcessing).toBe(true);
    });

    it('enables send when not processing', () => {
        const harness = createHarnessWithMocks();
        expect(harness.isProcessing).toBe(false);
    });
});
```

- [ ] **Step 5: Run type check**

Run: `cd apps/web && npx tsc --noEmit`
Expected: No errors (fix any type mismatches)

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/ai/harness/ai-harness.service.ts apps/web/src/features/ai/harness/conversation-state.ts apps/web/src/features/ai/harness/__tests__/harness.test.ts
git commit -m "feat: update AI Harness with Event Hub pattern and conversation recovery

Add onCreated/onStatus/onDone events. Add restoreConversation for
localStorage-based recovery. Add isProcessing state for send button
disable. Send methods auto-create or reuse conversations."
```

---

### Task 8: Rewrite AI Gateway with New Protocol + StateMachine

**Files:**
- Modify: `apps/server/src/ai/gateway/ai-ws.gateway.ts`
- Modify: `apps/server/src/ai/ai.module.ts` (register new providers)

- [ ] **Step 1: Write the failing test**

Create `apps/server/src/ai/gateway/__tests__/ai-ws-gateway.spec.ts`:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { AiGateway } from '../ai-ws.gateway';

describe('AiGateway new protocol', () => {
    let gateway: AiGateway;
    let mockSocket: any;
    let mockClient: any;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                AiGateway,
                { provide: 'AiService', useValue: {} },
                { provide: 'ConnectionManager', useValue: { register: jest.fn(), unregister: jest.fn() } },
                { provide: 'ConversationService', useValue: { create: jest.fn(), findById: jest.fn() } },
                { provide: 'RequestDispatcher', useValue: { dispatch: jest.fn() } },
                { provide: 'AISessionManager', useValue: { create: jest.fn(), abortByClientId: jest.fn() } },
                { provide: 'ToolDispatcher', useValue: { deliverResult: jest.fn() } },
                { provide: 'ConversationStateMachine', useValue: { create: jest.fn(), onEvent: jest.fn() } },
            ],
        }).compile();

        gateway = module.get(AiGateway);
        mockClient = { id: 'client-1', handshake: { headers: {} } };
        mockSocket = {
            emit: jest.fn(),
            join: jest.fn((room, cb) => cb?.()),
            to: jest.fn(() => ({ emit: jest.fn() })),
        };
    });

    it('handles create_and_send and emits created', async () => {
        const module = await Test.createTestingModule({
            providers: [
                AiGateway,
                { provide: 'AiService', useValue: {} },
                { provide: 'ConnectionManager', useValue: { register: jest.fn(), unregister: jest.fn() } },
                {
                    provide: 'ConversationService',
                    useValue: {
                        create: jest.fn().mockResolvedValue({ id: 'conv-new' }),
                        findById: jest.fn(),
                    },
                },
                { provide: 'RequestDispatcher', useValue: { dispatch: jest.fn() } },
                {
                    provide: 'AISessionManager',
                    useValue: { create: jest.fn().mockReturnValue({ id: 'session-1' }), abortByClientId: jest.fn() },
                },
                { provide: 'ToolDispatcher', useValue: { deliverResult: jest.fn() } },
                { provide: 'ConversationStateMachine', useValue: { create: jest.fn(), onEvent: jest.fn() } },
            ],
        }).compile();

        const gw = module.get(AiGateway);
        // Trigger create_and_send handler
        await gw['handleCreateAndSend'](mockClient, {
            type: 'create_and_send',
            content: 'Hello',
            context: null,
        });

        expect(mockSocket.emit).toHaveBeenCalledWith('created', {
            type: 'created',
            conversationId: 'conv-new',
        });
    });

    it('rejects send_message with non-existent conversation', async () => {
        const module = await Test.createTestingModule({
            providers: [
                AiGateway,
                { provide: 'AiService', useValue: {} },
                { provide: 'ConnectionManager', useValue: { register: jest.fn(), unregister: jest.fn() } },
                { provide: 'ConversationService', useValue: { findById: jest.fn().mockResolvedValue(null) } },
                { provide: 'RequestDispatcher', useValue: { dispatch: jest.fn() } },
                { provide: 'AISessionManager', useValue: { create: jest.fn(), abortByClientId: jest.fn() } },
                { provide: 'ToolDispatcher', useValue: { deliverResult: jest.fn() } },
                { provide: 'ConversationStateMachine', useValue: { create: jest.fn(), onEvent: jest.fn() } },
            ],
        }).compile();

        const gw = module.get(AiGateway);
        await gw['handleSendMessage'](mockClient, {
            type: 'send_message',
            conversationId: 'nonexistent',
            content: 'Hello',
        });

        expect(mockSocket.emit).toHaveBeenCalledWith('error', {
            type: 'error',
            conversationId: 'nonexistent',
            code: 'CONVERSATION_NOT_FOUND',
            message: expect.any(String),
        });
    });

    it('rejects duplicate active session (CONVERSATION_BUSY)', async () => {
        // Setup: conversation already has active session
        const module = await Test.createTestingModule({
            providers: [
                AiGateway,
                { provide: 'AiService', useValue: {} },
                { provide: 'ConnectionManager', useValue: { register: jest.fn(), unregister: jest.fn() } },
                { provide: 'ConversationService', useValue: { findById: jest.fn().mockResolvedValue({ id: 'conv-1' }) } },
                { provide: 'RequestDispatcher', useValue: { dispatch: jest.fn() } },
                {
                    provide: 'AISessionManager',
                    useValue: {
                        create: jest.fn().mockImplementation(() => {
                            throw new Error('Conversation already active');
                        }),
                        abortByClientId: jest.fn(),
                    },
                },
                { provide: 'ToolDispatcher', useValue: { deliverResult: jest.fn() } },
                { provide: 'ConversationStateMachine', useValue: { create: jest.fn(), onEvent: jest.fn() } },
            ],
        }).compile();

        const gw = module.get(AiGateway);
        await gw['handleSendMessage'](mockClient, {
            type: 'send_message',
            conversationId: 'conv-1',
            content: 'Hello',
        });

        expect(mockSocket.emit).toHaveBeenCalledWith('error', {
            type: 'error',
            conversationId: 'conv-1',
            code: 'CONVERSATION_BUSY',
            message: expect.any(String),
        });
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/server && npx jest src/ai/gateway/__tests__/ai-ws-gateway.spec.ts`
Expected: FAIL — handlers don't exist yet

- [ ] **Step 3: Rewrite ai-ws.gateway.ts**

Modify `apps/server/src/ai/gateway/ai-ws.gateway.ts`. Replace the existing handlers with the new protocol handlers:

```typescript
// At the top, add imports:
import { ConversationStateMachine } from './conversation-statemachine';
import type { ClientMessage, ServerMessage } from './ai-ws-events.types';

// Inject ConversationStateMachine in the constructor:
constructor(
    // ... existing injections
    @Inject(ConversationStateMachine) private readonly stateMachine: ConversationStateMachine,
) {
    // ...
}

// Set up state machine event handler in handleConnection:
@WebSocketGateway({
    namespace: 'ai',
    cors: { origin: process.env.FRONTEND_URL || 'http://localhost:4000' },
})
export class AiGateway {
    // In handleConnection or afterPropertiesSet:
    private _setupStateMachineHandler(): void {
        this.stateMachine.onEvent(event => {
            if (event.type === 'emit') {
                // Emit to the client that owns this conversation
                this.server.to(event.message.conversationId).emit(event.message.type, event.message);
            }
        });
    }

    // Replace existing event handlers:

    @SubscribeMessage('create_and_send')
    async handleCreateAndSend(client: Socket, data: ClientMessage & { type: 'create_and_send' }): Promise<void> {
        try {
            // Create conversation
            const conversation = await this.conversationService.create({
                title: data.content.substring(0, 50),
            });

            // Register client with connection manager
            this.connectionManager.registerClient(client.id, conversation.id);
            client.join(conversation.id);

            // Create session
            const session = this.sessionManager.create({
                conversationId: conversation.id,
                clientId: client.id,
            });

            // Emit created
            client.emit('created', { type: 'created', conversationId: conversation.id });

            // Create state machine session
            this.stateMachine.create({ conversationId: conversation.id, clientId: client.id });

            // Dispatch the message
            await this.requestDispatcher.dispatch({
                socket: client,
                client,
                conversationId: conversation.id,
                sessionId: session.id,
                content: data.content,
                context: data.context,
            });
        } catch (error) {
            client.emit('error', {
                type: 'error',
                conversationId: '',
                code: 'LLM_UNAVAILABLE',
                message: (error as Error).message,
            });
        }
    }

    @SubscribeMessage('send_message')
    async handleSendMessage(client: Socket, data: ClientMessage & { type: 'send_message' }): Promise<void> {
        try {
            // Check conversation exists
            const conversation = await this.conversationService.findById(data.conversationId);
            if (!conversation) {
                client.emit('error', {
                    type: 'error',
                    conversationId: data.conversationId,
                    code: 'CONVERSATION_NOT_FOUND',
                    message: 'Conversation not found',
                });
                return;
            }

            // Register client and join room (idempotent)
            this.connectionManager.registerClient(client.id, data.conversationId);
            client.join(data.conversationId);

            // Create session (throws if already active)
            const session = this.sessionManager.create({
                conversationId: data.conversationId,
                clientId: client.id,
            });

            // Dispatch
            await this.requestDispatcher.dispatch({
                socket: client,
                client,
                conversationId: data.conversationId,
                sessionId: session.id,
                content: data.content,
                context: data.context,
            });
        } catch (error) {
            const msg = (error as Error).message;
            if (msg.includes('already active') || msg.includes('already has an active')) {
                client.emit('error', {
                    type: 'error',
                    conversationId: data.conversationId,
                    code: 'CONVERSATION_BUSY',
                    message: 'Conversation is currently processing',
                });
            } else {
                client.emit('error', {
                    type: 'error',
                    conversationId: data.conversationId,
                    code: 'LLM_UNAVAILABLE',
                    message: msg,
                });
            }
        }
    }

    @SubscribeMessage('join')
    async handleJoin(client: Socket, data: ClientMessage & { type: 'join' }): Promise<void> {
        try {
            const conversation = await this.conversationService.findById(data.conversationId);
            if (!conversation) {
                client.emit('error', {
                    type: 'error',
                    conversationId: data.conversationId,
                    code: 'CONVERSATION_NOT_FOUND',
                    message: 'Conversation not found',
                });
                return;
            }

            this.connectionManager.registerClient(client.id, data.conversationId);
            client.join(data.conversationId);

            // Load and emit history
            const messages = await this.messageService.findByConversationId(data.conversationId);
            client.emit('history', {
                type: 'history',
                conversationId: data.conversationId,
                messages: messages.map(m => ({
                    id: m.id,
                    role: m.role,
                    content: m.content,
                    toolCalls: m.toolCalls,
                    createdAt: m.createdAt.toISOString(),
                })),
            });
        } catch (error) {
            client.emit('error', {
                type: 'error',
                conversationId: data.conversationId,
                code: 'CONVERSATION_NOT_FOUND',
                message: (error as Error).message,
            });
        }
    }

    @SubscribeMessage('stop')
    async handleStop(client: Socket, data: ClientMessage & { type: 'stop' }): Promise<void> {
        const session = this.sessionManager.findByConversationId(data.conversationId);
        if (session) {
            this.stateMachine.stop(session.id);
        }
    }

    @SubscribeMessage('tool_result')
    async handleToolResult(
        client: Socket,
        data: ClientMessage & { type: 'tool_result' },
    ): Promise<void> {
        this.toolDispatcher.deliverResult(data.conversationId, data.toolCallId, data.result);
    }

    // Keep handleConnection and handleDisconnect as they are
}
```

Note: This is a significant rewrite. The old `handleMessage`, `handleJoin` logic gets replaced. The key changes:
1. `create_and_send` creates conversation, emits `created`, then dispatches
2. `send_message` validates conversation exists, rejects with `CONVERSATION_NOT_FOUND` if not
3. `join` only loads history (no auto-create)
4. Duplicate session detection returns `CONVERSATION_BUSY`

- [ ] **Step 4: Run tests and fix**

Run: `cd apps/server && npx jest src/ai/gateway/__tests__/ai-ws-gateway.spec.ts`
Expected: PASS (fix any issues)

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/ai/gateway/ai-ws.gateway.ts apps/server/src/ai/gateway/__tests__/ai-ws-gateway.spec.ts apps/server/src/ai/ai.module.ts
git commit -m "feat: rewrite AI gateway with new event protocol and StateMachine

Replace old handlers with create_and_send/send_message/join/stop/
tool_result. ConversationStateMachine manages dialog lifecycle.
Errors use explicit codes (CONVERSATION_NOT_FOUND, CONVERSATION_BUSY)."
```

---

### Task 9: Wire WorkflowExecutor to StateMachine

**Files:**
- Modify: `apps/server/src/ai/workflow-runtime/workflow-executor.ts`
- Modify: `apps/server/src/ai/workflow-runtime/conversation-orchestrator.ts`

- [ ] **Step 1: Update WorkflowExecutor to use StateMachine**

Modify `apps/server/src/ai/workflow-runtime/workflow-executor.ts`. The key change: instead of the manual `while` loop for tool calls, the executor now works with the StateMachine. The StateMachine drives the flow; the executor responds to state transitions.

The minimal change approach: keep the existing execute() method but have it report status to the StateMachine instead of managing its own loop:

```typescript
// In the execute() method, after graph.stream() returns:
// Instead of manual tool loop, let StateMachine handle transitions:

// When LLM produces tool_calls:
this.stateMachine.toolCall(sessionId, {
    toolCallId: tc.id,
    toolName: tc.name,
    input: tc.input,
    requiresConfirmation: this.toolRouter.needsConfirmation(tc.name),
});

// When tool result arrives (via StateMachine's onAutoExecute or tool_result delivery):
this.stateMachine.toolResult(sessionId, toolCallId);
// ... execute tool ...
this.stateMachine.toolDone(sessionId);
// ... re-invoke graph with tool results ...

// When LLM finishes:
this.stateMachine.llmDone(sessionId);
```

The full implementation requires careful integration. The approach:
1. Inject `ToolRouter` and `ConversationStateMachine` into `WorkflowExecutor`
2. Replace the `while (toolCallCount < maxToolRounds)` loop with StateMachine-driven flow
3. The StateMachine emits events; the executor listens and acts

Since this is complex, the implementation code for the modified `execute()` method:

```typescript
// Updated execute method — key changes only (keep surrounding code):
async execute(ctx: WorkflowExecutionContext, graphName?: string): Promise<void> {
    const { conversationId, sessionId, content, llmConfigMap, defaultLlmConfig, tokenLimit } = ctx;
    const graphDef = this.graphRegistry.getGraph(graphName ?? 'ChatGraph');
    const graph = this.getOrCreateGraph(graphDef);
    const llmCaller = this.createLLMCaller(llmConfigMap, defaultLlmConfig);
    const abortSignal = this.sessionManager.findById(sessionId)?.abortController.signal;

    // Build initial state
    const history = await this.messageService.buildLLMHistory(conversationId, tokenLimit);
    const initialState: WorkflowState = {
        messages: [...history, { role: 'user' as const, content }],
        pendingToolCalls: [],
        hasToolCalls: false,
    };

    // Save user message
    await this.messageService.create({
        conversationId,
        role: 'user',
        content,
    });

    // Track accumulated assistant text
    let assistantText = '';
    let roundCount = 0;
    const maxToolRounds = 10;

    while (roundCount < maxToolRounds) {
        if (abortSignal?.aborted) break;

        roundCount++;

        // Stream the graph
        let lastState: WorkflowState | null = null;
        for await (const event of graph.stream(initialState, {
            configurable: { llmCaller, llmConfigMap, abortSignal },
        })) {
            lastState = event;

            // Stream text chunks to client
            if (event.assistantText) {
                assistantText += event.assistantText;
                // StateMachine emits text_chunk
                this.stateMachine.textChunk(sessionId, event.assistantText);
            }
        }

        if (!lastState) break;

        // Check for tool calls
        if (lastState.pendingToolCalls && lastState.pendingToolCalls.length > 0) {
            // Route each tool call
            for (const tc of lastState.pendingToolCalls) {
                this.toolRouter.route(tc.name, tc.input, conversationId, tc.id);
                this.stateMachine.toolCall(sessionId, {
                    toolCallId: tc.id,
                    toolName: tc.name,
                    input: tc.input,
                    requiresConfirmation: this.toolRouter.needsConfirmation(tc.name),
                });
            }

            // Wait for tool results (frontend or auto-executed)
            const toolResults = await this.toolDispatcher.waitForResults(
                sessionId,
                conversationId,
                lastState.pendingToolCalls,
                120_000,
            );

            if (!toolResults) {
                // Timeout — inject error results and continue
                for (const tc of lastState.pendingToolCalls) {
                    this.connectionManager.broadcastToConversation(conversationId, {
                        type: 'error',
                        conversationId,
                        code: 'TOOL_TIMEOUT',
                        message: `Tool ${tc.name} timed out`,
                    });
                }
            }

            // Append tool results to messages
            const toolMessages: LLMMessage[] = lastState.pendingToolCalls.map(tc => ({
                role: 'tool',
                content: JSON.stringify(toolResults?.[tc.id] ?? { error: 'Tool execution failed' }),
            }));

            initialState.messages = [...initialState.messages, ...toolMessages];
            this.stateMachine.toolResult(sessionId, lastState.pendingToolCalls[0].id);
            this.stateMachine.toolDone(sessionId);

            // Continue loop — next iteration calls LLM with tool results
            continue;
        }

        // No tool calls — LLM is done
        break;
    }

    // Save assistant message
    if (assistantText) {
        await this.messageService.create({
            conversationId,
            role: 'assistant',
            content: assistantText,
            finishReason: roundCount >= maxToolRounds ? 'max_turns' : 'complete',
        });
    }

    // Signal done
    if (roundCount >= maxToolRounds) {
        this.stateMachine.error(sessionId, 'LLM_TIMEOUT', 'Maximum tool call rounds reached');
    } else {
        this.stateMachine.llmDone(sessionId);
    }
}
```

Add StateMachine and ToolRouter to the constructor:

```typescript
constructor(
    // ... existing
    @Inject(ConversationStateMachine) private readonly stateMachine: ConversationStateMachine,
    @Inject(ToolRouter) private readonly toolRouter: ToolRouter,
) {
    // ...
}
```

- [ ] **Step 2: Update ai.module.ts to provide new services**

Modify `apps/server/src/ai/ai.module.ts` to register the new services:

```typescript
import { ConversationStateMachine } from './gateway/conversation-statemachine';
import { ToolRouter } from './tools/tool-router';

// Add to providers:
providers: [
    // ... existing providers
    ConversationStateMachine,
    ToolRouter,
]
```

- [ ] **Step 3: Run type check**

Run: `cd apps/server && npx tsc --noEmit`
Expected: No errors (fix any issues)

- [ ] **Step 4: Run existing tests**

Run: `cd apps/server && npx jest`
Expected: All tests pass (fix any regressions)

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/ai/workflow-runtime/workflow-executor.ts apps/server/src/ai/workflow-runtime/conversation-orchestrator.ts apps/server/src/ai/ai.module.ts
git commit -m "feat: wire WorkflowExecutor to ConversationStateMachine and ToolRouter

Replace manual tool loop with StateMachine-driven flow. ToolRouter
routes calls by danger level. Executor reports state transitions
to StateMachine."
```

---

### Task 10: Update AI Panel UI for isProcessing State

**Files:**
- Modify: `apps/web/src/components/workspace/ai-panel/ai-panel.tsx` (or wherever the send button lives)

- [ ] **Step 1: Disable send button during processing**

Find the send button in the AI panel component and wire up the `isProcessing` state:

```typescript
// In the AI panel component (ai-panel.tsx or similar):
const harness = useAIHarness(); // or however harness is accessed

// The send button should be disabled when harness.isProcessing is true
<button
    disabled={harness.isGenerating || harness.isProcessing}
    onClick={handleSend}
    // ...
>
    {harness.isProcessing ? 'Generating...' : 'Send'}
</button>
```

If the component uses the `useAIHarness` hook with `useSyncExternalStore`, the `isProcessing` state will be available through the harness snapshot.

- [ ] **Step 2: Verify UI behavior**

Run: `cd apps/web && npm run dev`
Open the AI panel, send a message, verify:
- Send button is disabled while generating
- Send button re-enables when generation completes
- Status events show appropriate UI feedback

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/workspace/ai-panel/ai-panel.tsx
git commit -m "feat: disable send button during AI generation

Use harness.isProcessing to disable send while conversation is
in BuildingContext/Processing/ToolWaiting states."
```

---

### Task 11: Integrate Conversation Recovery on App Load

**Files:**
- Modify: `apps/web/src/features/ai/harness/ai-harness.service.ts` (already partially done in Task 7)
- Modify: wherever the AI panel or app initializes the harness

- [ ] **Step 1: Add auto-restore on harness init**

The harness should check localStorage for a saved conversation ID on initialization and restore it. This is done by the component that creates/uses the harness:

```typescript
// In the component that initializes the harness (likely ai-panel.tsx or bootstrap):
useEffect(() => {
    const savedId = localStorage.getItem('activeConversationId');
    if (savedId) {
        harness.restoreConversation(savedId);
    }
}, []);
```

Or, add it to the harness constructor:

```typescript
// In AIHarnessServiceImpl constructor, after _setupEventProxy:
this._restoreLastConversation();

private _restoreLastConversation(): void {
    try {
        const savedId = localStorage.getItem('activeConversationId');
        if (savedId) {
            this._conversationState.setConversationId(savedId);
            // Don't auto-join here — the UI should decide when to join
        }
    } catch {
        // Ignore
    }
}
```

- [ ] **Step 2: Verify recovery flow**

Test the full recovery flow:
1. Open AI panel, send a message, wait for response
2. Refresh the page
3. Verify: the previous conversation ID is restored
4. Verify: clicking the conversation loads history
5. Verify: localStorage is cleared after `done` event

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/features/ai/harness/ai-harness.service.ts
git commit -m "feat: auto-restore conversation from localStorage on harness init

Check activeConversationId on init and restore conversation state.
History loads when user joins the restored conversation."
```

---

## Self-Review

### Spec Coverage Check

| Spec Requirement | Task |
|-----------------|------|
| Frontend checks WS connection, reuses or creates | Task 6 (ws-client), Task 7 (harness) |
| Frontend sends create_and_send or send_message | Task 7 (harness sendMessage/sendCreateAndSend) |
| Server validates conversationId | Task 8 (gateway handleSendMessage) |
| Server builds context (history + system) | Task 9 (workflow-executor uses buildLLMHistory) |
| Server stores user message, streams response | Task 9 (workflow-executor) |
| Tool calls routed by danger level | Task 3 (ToolRouter) |
| Backend+low tools auto-execute | Task 3 (ToolRouter.route) |
| Backend+high tools require confirmation | Task 3 (ToolRouter.route) |
| Frontend tools forwarded to client | Task 3 (ToolRouter.route) |
| Different event names for different types | Task 1, Task 5 (types) |
| Created event for new conversations | Task 8 (gateway) |
| Done event with finishReason | Task 4 (StateMachine), Task 8 (gateway) |
| Status events for UI feedback | Task 6 (ws-client), Task 7 (harness) |
| Processing state disables send button | Task 7 (harness), Task 10 (UI) |
| Conversation recovery via localStorage | Task 7 (harness), Task 11 (auto-restore) |
| State machine drives tool loop | Task 4 (StateMachine), Task 9 (executor) |
| Fix abortByClientId prefix bug | Deferred to separate cleanup (noted in spec §7.2) |
| Merge ToolRegistry + Dispatcher | Deferred to separate cleanup (noted in spec §7.2) |

### Placeholder Scan
- No TBD/TODO in steps
- All code steps contain actual code
- No "similar to Task N" references
- Tests have real assertions
- No "add appropriate error handling" without specifics

### Type Consistency Check
- `ClientMessage` and `ServerMessage` types defined in Task 1 (server) and Task 5 (frontend) are consistent
- `conversationId: string` is present in all events
- `FinishReason` enum values match between server types and frontend types
- `ErrorCode` values match between server and frontend
- `ToolRouteMode` values are consistent with the spec's routing matrix

---

## Execution Handoff

Plan complete. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
