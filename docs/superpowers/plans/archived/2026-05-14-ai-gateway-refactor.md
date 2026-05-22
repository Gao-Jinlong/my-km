# AI WebSocket Gateway Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the AI WebSocket gateway to separate transport (ws/) from business logic (ai/), replace Socket.io rooms with per-client direct emit, and introduce a per-room state machine factory.

**Architecture:** A thin `WsGateway` in a new `ws/` module handles raw WebSocket routing and delegates to a `RoomRouter` in the `ai/` module. The `RoomRouter` orchestrates `ConversationService`, `RoomStateMachineFactory`, and `RequestDispatcher`. State machines are per-room instances. `WorkflowExecutor` is decoupled from `ConversationStateMachine` via callback injection.

**Tech Stack:** NestJS, Socket.io, Jest, TypeScript

---

### Task 1: Create SocketRegistry (replaces ConnectionManager)

**Files:**
- Create: `apps/server/src/ws/socket-registry.ts`
- Create: `apps/server/src/ai/gateway/__tests__/socket-registry.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/server/src/ai/gateway/__tests__/socket-registry.spec.ts`:

```ts
import { SocketRegistry } from '../../ws/socket-registry';

describe('SocketRegistry', () => {
    let registry: SocketRegistry;
    let mockSocket: { emit: jest.Mock; id: string };

    beforeEach(() => {
        registry = new SocketRegistry();
        mockSocket = { emit: jest.fn(), id: 'sock-1' };
    });

    it('registers and retrieves a socket', () => {
        registry.register('client-1', mockSocket as any);
        expect(registry.getSocket('client-1')).toBe(mockSocket);
    });

    it('returns null for unregistered client', () => {
        expect(registry.getSocket('nope')).toBeNull();
    });

    it('unregisters a socket', () => {
        registry.register('client-1', mockSocket as any);
        registry.unregister('client-1');
        expect(registry.getSocket('client-1')).toBeNull();
    });

    it('emits to a specific client', () => {
        registry.register('client-1', mockSocket as any);
        registry.emitToClient('client-1', 'event', { data: true });
        expect(mockSocket.emit).toHaveBeenCalledWith('event', { data: true });
    });

    it('no-ops emit to unregistered client', () => {
        expect(() => registry.emitToClient('nope', 'event', {})).not.toThrow();
    });

    it('checks if client is online', () => {
        registry.register('client-1', mockSocket as any);
        expect(registry.isOnline('client-1')).toBe(true);
        expect(registry.isOnline('nope')).toBe(false);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/server && npx jest --testPathPattern="socket-registry.spec" --no-coverage 2>&1 | head -20`
Expected: FAIL with "Cannot find module '../../ws/socket-registry'"

- [ ] **Step 3: Write minimal implementation**

Create `apps/server/src/ws/socket-registry.ts`:

```ts
import { Injectable, Logger } from '@nestjs/common';
import type { Socket } from 'socket.io';

@Injectable()
export class SocketRegistry {
    private readonly logger = new Logger(SocketRegistry.name);
    private sockets = new Map<string, Socket>();

    register(clientId: string, socket: Socket): void {
        this.sockets.set(clientId, socket);
        this.logger.debug(`Socket registered: ${clientId}`);
    }

    unregister(clientId: string): void {
        this.sockets.delete(clientId);
        this.logger.debug(`Socket unregistered: ${clientId}`);
    }

    getSocket(clientId: string): Socket | null {
        return this.sockets.get(clientId) ?? null;
    }

    emitToClient(clientId: string, event: string, data: unknown): void {
        const socket = this.sockets.get(clientId);
        if (socket) {
            socket.emit(event, data);
        }
    }

    isOnline(clientId: string): boolean {
        return this.sockets.has(clientId);
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/server && npx jest --testPathPattern="socket-registry.spec" --no-coverage`
Expected: PASS — 6 tests

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/ws/socket-registry.ts apps/server/src/ai/gateway/__tests__/socket-registry.spec.ts
git commit -m "feat: add SocketRegistry to replace ConnectionManager

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 2: Create RoomStateMachineFactory + per-room FSM

**Files:**
- Create: `apps/server/src/ai/gateway/room-statemachine.ts`
- Create: `apps/server/src/ai/gateway/room-statemachine-factory.ts`
- Create: `apps/server/src/ai/gateway/__tests__/room-statemachine-factory.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/server/src/ai/gateway/__tests__/room-statemachine-factory.spec.ts`:

```ts
import { RoomStateMachineFactory } from '../room-statemachine-factory';

describe('RoomStateMachineFactory', () => {
    let factory: RoomStateMachineFactory;

    beforeEach(() => {
        factory = new RoomStateMachineFactory();
    });

    it('creates a new state machine instance', () => {
        const emit = jest.fn();
        const sm = factory.create({
            conversationId: 'conv-1',
            clientId: 'client-1',
            emit,
        });

        expect(sm).toBeDefined();
        expect(factory.get('conv-1')).toBe(sm);
    });

    it('throws if session already active', () => {
        const emit = jest.fn();
        factory.create({ conversationId: 'conv-1', clientId: 'client-1', emit });

        expect(() =>
            factory.create({ conversationId: 'conv-1', clientId: 'client-2', emit }),
        ).toThrow('already active');
    });

    it('returns null for unknown conversation', () => {
        expect(factory.get('nope')).toBeNull();
    });

    it('destroys a session', () => {
        const emit = jest.fn();
        factory.create({ conversationId: 'conv-1', clientId: 'client-1', emit });
        factory.destroy('conv-1');
        expect(factory.get('conv-1')).toBeNull();
    });

    it('cleans up all sessions for a client on disconnect', () => {
        const emit = jest.fn();
        factory.create({ conversationId: 'conv-1', clientId: 'client-1', emit });
        factory.create({ conversationId: 'conv-2', clientId: 'client-1', emit });

        factory.destroyByClientId('client-1');

        expect(factory.get('conv-1')).toBeNull();
        expect(factory.get('conv-2')).toBeNull();
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/server && npx jest --testPathPattern="room-statemachine-factory.spec" --no-coverage 2>&1 | head -20`
Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Write minimal implementation**

Create `apps/server/src/ai/gateway/room-statemachine.ts`:

```ts
/**
 * RoomStateMachine — lifecycle FSM for a single room (conversation).
 *
 * States: Idle → BuildingContext → Processing → [ToolWaiting → ToolExecuting → Processing]* → Done
 *
 * Uses an emit callback to send events to the transport layer,
 * decoupling business logic from WebSocket protocol.
 */

import { ConversationState, isValidTransition } from './conversation-statemachine.types';
import type { ServerMessage, ErrorCode } from './ai-ws-events.types';

export type EmitFn = (msg: ServerMessage) => void;

export class RoomStateMachine {
    readonly conversationId: string;
    readonly clientId: string;
    state: ConversationState = ConversationState.Idle;
    abortController = new AbortController();
    createdAt = new Date();
    lastActivityAt = new Date();

    private emit: EmitFn;

    constructor(conversationId: string, clientId: string, emit: EmitFn) {
        this.conversationId = conversationId;
        this.clientId = clientId;
        this.emit = emit;
    }

    private _transition(to: ConversationState): void {
        const from = this.state;
        if (from === to) return;

        if (!isValidTransition(from, to)) {
            throw new Error(
                `Invalid transition: ${from} -> ${to} for conversation ${this.conversationId}`,
            );
        }

        this.state = to;
        this.lastActivityAt = new Date();
    }

    receiveMessage(): void {
        this._transition(ConversationState.BuildingContext);
    }

    contextReady(): void {
        this._transition(ConversationState.Processing);
    }

    textChunk(content: string): void {
        this.emit({ type: 'text_chunk', conversationId: this.conversationId, content });
    }

    toolCall(
        toolCallId: string,
        toolName: string,
        input: unknown,
        requiresConfirmation: boolean,
    ): void {
        if (requiresConfirmation) {
            this._transition(ConversationState.ToolWaiting);
            this.emit({
                type: 'tool_call',
                conversationId: this.conversationId,
                toolCallId,
                toolName,
                input,
                requiresConfirmation: true,
            });
        } else {
            this._transition(ConversationState.ToolExecuting);
        }
    }

    toolResult(): void {
        this._transition(ConversationState.ToolExecuting);
    }

    toolDone(): void {
        this._transition(ConversationState.Processing);
    }

    llmDone(): void {
        this._transition(ConversationState.Done);
        this.emit({
            type: 'done',
            conversationId: this.conversationId,
            finishReason: 'complete',
        });
    }

    stop(): void {
        this.abortController.abort();
        this._transition(ConversationState.Done);
        this.emit({
            type: 'done',
            conversationId: this.conversationId,
            finishReason: 'stopped',
        });
    }

    error(code: string, message: string): void {
        this.abortController.abort();
        this._transition(ConversationState.Done);
        this.emit({
            type: 'error',
            conversationId: this.conversationId,
            code: code as ErrorCode,
            message,
        });
    }

    getAbortSignal(): AbortSignal {
        return this.abortController.signal;
    }
}
```

Create `apps/server/src/ai/gateway/room-statemachine-factory.ts`:

```ts
/**
 * RoomStateMachineFactory — manages per-room FSM instances.
 *
 * Each room gets its own state machine instance.
 * The factory tracks sessions by conversationId and by clientId
 * (for cleanup on disconnect).
 */

import { Injectable, Logger } from '@nestjs/common';
import { RoomStateMachine, EmitFn } from './room-statemachine';
import { ConversationState } from './conversation-statemachine.types';

export interface CreateOptions {
    conversationId: string;
    clientId: string;
    emit: EmitFn;
}

@Injectable()
export class RoomStateMachineFactory {
    private readonly logger = new Logger(RoomStateMachineFactory.name);
    private byConversationId = new Map<string, RoomStateMachine>();
    private byClientId = new Map<string, Set<string>>();

    create(options: CreateOptions): RoomStateMachine {
        const existing = this.byConversationId.get(options.conversationId);
        if (existing && existing.state !== ConversationState.Done) {
            throw new Error(`Conversation ${options.conversationId} already active`);
        }

        // Clean up any stale Done session
        if (existing) {
            this.byConversationId.delete(options.conversationId);
            const clientSet = this.byClientId.get(options.clientId);
            clientSet?.delete(options.conversationId);
        }

        const sm = new RoomStateMachine(options.conversationId, options.clientId, options.emit);
        this.byConversationId.set(options.conversationId, sm);

        if (!this.byClientId.has(options.clientId)) {
            this.byClientId.set(options.clientId, new Set());
        }
        this.byClientId.get(options.clientId)!.add(options.conversationId);

        this.logger.debug(`FSM created for room ${options.conversationId}`);
        return sm;
    }

    get(conversationId: string): RoomStateMachine | null {
        return this.byConversationId.get(conversationId) ?? null;
    }

    destroy(conversationId: string): void {
        const sm = this.byConversationId.get(conversationId);
        if (sm) {
            sm.abortController.abort();
            const clientSet = this.byClientId.get(sm.clientId);
            clientSet?.delete(conversationId);
        }
        this.byConversationId.delete(conversationId);
        this.logger.debug(`FSM destroyed for room ${conversationId}`);
    }

    destroyByClientId(clientId: string): void {
        const convIds = this.byClientId.get(clientId);
        if (convIds) {
            for (const convId of convIds) {
                this.destroy(convId);
            }
        }
        this.byClientId.delete(clientId);
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/server && npx jest --testPathPattern="room-statemachine-factory.spec" --no-coverage`
Expected: PASS — 5 tests

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/ai/gateway/room-statemachine.ts apps/server/src/ai/gateway/room-statemachine-factory.ts apps/server/src/ai/gateway/__tests__/room-statemachine-factory.spec.ts
git commit -m "feat: add RoomStateMachineFactory with per-room FSM instances

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 3: Create RoomRouter (business orchestration in ai/ module)

**Files:**
- Create: `apps/server/src/ai/gateway/room-router.ts`
- Create: `apps/server/src/ai/gateway/__tests__/room-router.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/server/src/ai/gateway/__tests__/room-router.spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { RoomRouter } from '../room-router';
import { ConversationService } from '../../conversation/conversation.service';
import { MessageService } from '../../message/message.service';
import { RequestDispatcher } from '../../dispatch/request-dispatcher';
import { RoomStateMachineFactory } from '../room-statemachine-factory';
import type { RoomStateMachine } from '../room-statemachine';

describe('RoomRouter', () => {
    let roomRouter: RoomRouter;
    let conversationService: jest.Mocked<ConversationService>;
    let messageService: jest.Mocked<MessageService>;
    let requestDispatcher: jest.Mocked<RequestDispatcher>;
    let stateMachineFactory: jest.Mocked<RoomStateMachineFactory>;
    let emitCallback: jest.Mock;

    beforeEach(async () => {
        emitCallback = jest.fn();

        conversationService = {
            create: jest.fn(),
            findById: jest.fn(),
        } as any;

        messageService = {
            findByConversationId: jest.fn(),
        } as any;

        requestDispatcher = {
            dispatch: jest.fn(),
        } as any;

        stateMachineFactory = {
            create: jest.fn(),
            get: jest.fn(),
            destroy: jest.fn(),
        } as any;

        const module = await Test.createTestingModule({
            providers: [
                RoomRouter,
                { provide: ConversationService, useValue: conversationService },
                { provide: MessageService, useValue: messageService },
                { provide: RequestDispatcher, useValue: requestDispatcher },
                { provide: RoomStateMachineFactory, useValue: stateMachineFactory },
            ],
        }).compile();

        roomRouter = module.get(RoomRouter);
    });

    describe('createAndSend', () => {
        it('creates conversation, state machine, and dispatches', async () => {
            const newConv = {
                id: 'conv-1',
                title: 'test',
                userId: null,
                createdAt: new Date(),
                updatedAt: new Date(),
            };
            conversationService.create.mockResolvedValue(newConv);

            await roomRouter.createAndSend('client-1', 'hello', undefined, emitCallback);

            expect(conversationService.create).toHaveBeenCalledWith({
                title: 'hello'.substring(0, 50),
            });
            expect(stateMachineFactory.create).toHaveBeenCalledWith({
                conversationId: 'conv-1',
                clientId: 'client-1',
                emit: emitCallback,
            });
            expect(requestDispatcher.dispatch).toHaveBeenCalledWith({
                conversationId: 'conv-1',
                clientId: 'client-1',
                content: 'hello',
                context: undefined,
            });
        });
    });

    describe('sendMessage', () => {
        it('emits error if conversation not found', async () => {
            conversationService.findById.mockResolvedValue(null);

            await roomRouter.sendMessage(
                'client-1',
                'nope',
                'hello',
                undefined,
                emitCallback,
            );

            expect(emitCallback).toHaveBeenCalledWith({
                type: 'error',
                conversationId: 'nope',
                code: 'CONVERSATION_NOT_FOUND',
                message: 'Conversation not found',
            });
        });

        it('creates state machine and dispatches for existing conversation', async () => {
            const conv = { id: 'conv-1', title: 'test', userId: null };
            conversationService.findById.mockResolvedValue(conv);

            await roomRouter.sendMessage(
                'client-1',
                'conv-1',
                'hello',
                undefined,
                emitCallback,
            );

            expect(stateMachineFactory.create).toHaveBeenCalledWith({
                conversationId: 'conv-1',
                clientId: 'client-1',
                emit: emitCallback,
            });
            expect(requestDispatcher.dispatch).toHaveBeenCalled();
        });
    });

    describe('joinRoom', () => {
        it('emits error if conversation not found', async () => {
            conversationService.findById.mockResolvedValue(null);

            await roomRouter.joinRoom('nope', emitCallback);

            expect(emitCallback).toHaveBeenCalledWith(
                expect.objectContaining({ type: 'error' }),
            );
        });

        it('loads and emits history for existing conversation', async () => {
            const conv = { id: 'conv-1', title: 'test', userId: null };
            conversationService.findById.mockResolvedValue(conv);
            messageService.findByConversationId.mockResolvedValue([
                {
                    id: 'msg-1',
                    role: 'user',
                    content: 'hi',
                    createdAt: new Date(),
                },
            ]);

            await roomRouter.joinRoom('conv-1', emitCallback);

            expect(emitCallback).toHaveBeenCalledWith(
                expect.objectContaining({ type: 'history' }),
            );
        });
    });

    describe('stop', () => {
        it('calls state machine stop', () => {
            const mockSM: Partial<RoomStateMachine> = { stop: jest.fn() };
            stateMachineFactory.get.mockReturnValue(mockSM as RoomStateMachine);

            roomRouter.stop('conv-1');

            expect(stateMachineFactory.get).toHaveBeenCalledWith('conv-1');
            expect(mockSM.stop).toHaveBeenCalled();
        });

        it('no-ops if no state machine exists', () => {
            stateMachineFactory.get.mockReturnValue(null);
            expect(() => roomRouter.stop('conv-1')).not.toThrow();
        });
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/server && npx jest --testPathPattern="room-router.spec" --no-coverage 2>&1 | head -20`
Expected: FAIL with "Cannot find module '../room-router'"

- [ ] **Step 3: Write minimal implementation**

Create `apps/server/src/ai/gateway/room-router.ts`:

```ts
/**
 * RoomRouter — business orchestration layer for AI WebSocket messages.
 *
 * Receives routed messages from WsGateway and orchestrates:
 * - ConversationService (CRUD)
 * - RoomStateMachineFactory (per-room FSM lifecycle)
 * - RequestDispatcher (rate limit + workflow execution)
 * - MessageService (history loading)
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConversationService } from '../conversation/conversation.service';
import { MessageService } from '../message/message.service';
import { RequestDispatcher } from '../dispatch/request-dispatcher';
import { RoomStateMachineFactory } from './room-statemachine-factory';
import type { ServerMessage } from './ai-ws-events.types';

type EmitFn = (msg: ServerMessage) => void;

@Injectable()
export class RoomRouter {
    private readonly logger = new Logger(RoomRouter.name);

    constructor(
        private conversationService: ConversationService,
        private messageService: MessageService,
        private requestDispatcher: RequestDispatcher,
        private stateMachineFactory: RoomStateMachineFactory,
    ) {}

    async createAndSend(
        clientId: string,
        content: string,
        context: unknown,
        emit: EmitFn,
    ): Promise<void> {
        const conversation = await this.conversationService.create({
            title: content.substring(0, 50),
        });

        emit({ type: 'created', conversationId: conversation.id });

        this.stateMachineFactory.create({
            conversationId: conversation.id,
            clientId,
            emit,
        });

        await this.requestDispatcher.dispatch({
            conversationId: conversation.id,
            clientId,
            content,
            context: context as Record<string, unknown> | undefined,
        });
    }

    async sendMessage(
        clientId: string,
        conversationId: string,
        content: string,
        context: unknown,
        emit: EmitFn,
    ): Promise<void> {
        const conversation = await this.conversationService.findById(conversationId);
        if (!conversation) {
            emit({
                type: 'error',
                conversationId,
                code: 'CONVERSATION_NOT_FOUND',
                message: 'Conversation not found',
            });
            return;
        }

        this.stateMachineFactory.create({
            conversationId,
            clientId,
            emit,
        });

        await this.requestDispatcher.dispatch({
            conversationId,
            clientId,
            content,
            context: context as Record<string, unknown> | undefined,
        });
    }

    async joinRoom(conversationId: string, emit: EmitFn): Promise<void> {
        const conversation = await this.conversationService.findById(conversationId);
        if (!conversation) {
            emit({
                type: 'error',
                conversationId,
                code: 'CONVERSATION_NOT_FOUND',
                message: 'Conversation not found',
            });
            return;
        }

        const messages = await this.messageService.findByConversationId(conversationId);
        emit({
            type: 'history',
            conversationId,
            messages: messages.map((m: any) => ({
                id: m.id,
                role: m.role,
                content: m.content,
                toolCalls: m.toolCalls,
                createdAt: m.createdAt.toISOString(),
            })),
        });
    }

    stop(conversationId: string): void {
        const sm = this.stateMachineFactory.get(conversationId);
        if (sm) {
            sm.stop();
        }
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/server && npx jest --testPathPattern="room-router.spec" --no-coverage`
Expected: PASS — 6 tests

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/ai/gateway/room-router.ts apps/server/src/ai/gateway/__tests__/room-router.spec.ts
git commit -m "feat: add RoomRouter for business orchestration

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 4: Create WsGateway (thin router in ws/ module)

**Files:**
- Create: `apps/server/src/ws/ws-gateway.ts`
- Create: `apps/server/src/ws/ws.module.ts`
- Create: `apps/server/src/ai/gateway/__tests__/ws-gateway.spec.ts`
- Modify: `apps/server/src/ai/ai.module.ts` (add WsModule import)

- [ ] **Step 1: Write the failing test**

Create `apps/server/src/ai/gateway/__tests__/ws-gateway.spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import type { Socket } from 'socket.io';
import { SocketRegistry } from '../../ws/socket-registry';
import { WsGateway } from '../../ws/ws-gateway';
import { RoomRouter } from '../../ai/gateway/room-router';
import { ToolDispatcher } from '../../ai/tools/tool.dispatcher';

describe('WsGateway', () => {
    let gateway: WsGateway;
    let registry: SocketRegistry;
    let roomRouter: jest.Mocked<RoomRouter>;
    let toolDispatcher: jest.Mocked<ToolDispatcher>;
    let mockSocket: Partial<Socket>;

    beforeEach(async () => {
        roomRouter = {
            createAndSend: jest.fn(),
            sendMessage: jest.fn(),
            joinRoom: jest.fn(),
            stop: jest.fn(),
        } as any;

        toolDispatcher = {
            deliverResult: jest.fn(),
        } as any;

        const module = await Test.createTestingModule({
            providers: [
                WsGateway,
                SocketRegistry,
                { provide: RoomRouter, useValue: roomRouter },
                { provide: ToolDispatcher, useValue: toolDispatcher },
            ],
        }).compile();

        gateway = module.get(WsGateway);
        registry = module.get(SocketRegistry);
        mockSocket = { id: 'test-sock', emit: jest.fn() };
    });

    it('registers socket on connection', () => {
        gateway.handleConnection(mockSocket as Socket);
        expect(registry.getSocket('test-sock')).toBe(mockSocket);
    });

    it('unregisters socket on disconnect', () => {
        gateway.handleConnection(mockSocket as Socket);
        gateway.handleDisconnect(mockSocket as Socket);
        expect(registry.getSocket('test-sock')).toBeNull();
    });

    it('routes create_and_send to roomRouter', async () => {
        const mockClient = mockSocket as Socket;
        await gateway.handleCreateAndSend(
            { type: 'create_and_send', content: 'hello', context: undefined },
            mockClient,
        );
        expect(roomRouter.createAndSend).toHaveBeenCalledWith(
            'test-sock',
            'hello',
            undefined,
            expect.any(Function),
        );
    });

    it('routes tool_result to toolDispatcher', async () => {
        const mockClient = mockSocket as Socket;
        await gateway.handleToolResult(
            {
                type: 'tool_result',
                conversationId: 'conv-1',
                toolCallId: 'tc-1',
                result: 'ok',
            },
            mockClient,
        );
        expect(toolDispatcher.deliverResult).toHaveBeenCalledWith(
            'conv-1',
            'tc-1',
            'ok',
        );
    });

    it('emits error on createAndSend failure', async () => {
        roomRouter.createAndSend.mockRejectedValue(new Error('boom'));
        const mockClient = mockSocket as Socket;
        await gateway.handleCreateAndSend(
            { type: 'create_and_send', content: 'hello', context: undefined },
            mockClient,
        );
        expect(mockSocket.emit).toHaveBeenCalledWith(
            'error',
            expect.objectContaining({ type: 'error', code: 'LLM_UNAVAILABLE' }),
        );
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/server && npx jest --testPathPattern="ws-gateway.spec" --no-coverage 2>&1 | head -20`
Expected: FAIL with "Cannot find module '../../ws/ws-gateway'"

- [ ] **Step 3: Write minimal implementation**

Create `apps/server/src/ws/ws-gateway.ts`:

```ts
/**
 * WsGateway — thin WebSocket router (transport layer only).
 *
 * Routes messages to RoomRouter for business logic.
 * Maintains clientId → Socket mapping via SocketRegistry.
 */

import { Injectable, Logger } from '@nestjs/common';
import {
    ConnectedSocket,
    MessageBody,
    SubscribeMessage,
    WebSocketGateway,
    WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { SocketRegistry } from './socket-registry';
import { RoomRouter } from '../ai/gateway/room-router';
import { ToolDispatcher } from '../ai/tools/tool.dispatcher';
import type { ServerMessage, ErrorCode } from '../ai/gateway/ai-ws-events.types';

@WebSocketGateway({
    cors: {
        origin: process.env.FRONTEND_URL ?? 'http://localhost:4000',
        credentials: true,
    },
    namespace: 'ai',
})
@Injectable()
export class WsGateway {
    private readonly logger = new Logger(WsGateway.name);

    constructor(
        private registry: SocketRegistry,
        private roomRouter: RoomRouter,
        private toolDispatcher: ToolDispatcher,
    ) {}

    @WebSocketServer()
    server!: Server;

    handleConnection(client: Socket): void {
        this.logger.log(`Client connected: ${client.id}`);
        this.registry.register(client.id, client);
    }

    handleDisconnect(client: Socket): void {
        this.logger.log(`Client disconnected: ${client.id}`);
        this.registry.unregister(client.id);
    }

    private _emitToClient(clientId: string, msg: ServerMessage): void {
        this.registry.emitToClient(clientId, msg.type, msg);
    }

    private _emitError(
        clientId: string,
        conversationId: string,
        code: ErrorCode,
        message: string,
    ): void {
        this._emitToClient(clientId, {
            type: 'error',
            conversationId,
            code,
            message,
        });
    }

    @SubscribeMessage('create_and_send')
    async handleCreateAndSend(
        @MessageBody()
        data: { type: 'create_and_send'; content: string; context?: unknown },
        @ConnectedSocket() client: Socket,
    ): Promise<void> {
        try {
            await this.roomRouter.createAndSend(
                client.id,
                data.content,
                data.context,
                msg => this._emitToClient(client.id, msg),
            );
        } catch (error) {
            this._emitError(
                client.id,
                '',
                'LLM_UNAVAILABLE',
                (error as Error).message,
            );
        }
    }

    @SubscribeMessage('send_message')
    async handleSendMessage(
        @MessageBody()
        data: {
            type: 'send_message';
            conversationId: string;
            content: string;
            context?: unknown;
        },
        @ConnectedSocket() client: Socket,
    ): Promise<void> {
        try {
            await this.roomRouter.sendMessage(
                client.id,
                data.conversationId,
                data.content,
                data.context,
                msg => this._emitToClient(client.id, msg),
            );
        } catch (error) {
            const msg = (error as Error).message;
            if (
                msg.includes('already active') ||
                msg.includes('already has an active')
            ) {
                this._emitError(
                    client.id,
                    data.conversationId,
                    'CONVERSATION_BUSY',
                    'Conversation is currently processing',
                );
            } else {
                this._emitError(
                    client.id,
                    data.conversationId,
                    'LLM_UNAVAILABLE',
                    msg,
                );
            }
        }
    }

    @SubscribeMessage('join')
    async handleJoin(
        @MessageBody() data: { type: 'join'; conversationId: string },
        @ConnectedSocket() client: Socket,
    ): Promise<void> {
        try {
            await this.roomRouter.joinRoom(
                data.conversationId,
                msg => this._emitToClient(client.id, msg),
            );
        } catch (error) {
            this._emitError(
                client.id,
                data.conversationId,
                'CONVERSATION_NOT_FOUND',
                (error as Error).message,
            );
        }
    }

    @SubscribeMessage('stop')
    async handleStop(
        @MessageBody() data: { type: 'stop'; conversationId: string },
        @ConnectedSocket() _client: Socket,
    ): Promise<void> {
        this.roomRouter.stop(data.conversationId);
    }

    @SubscribeMessage('tool_result')
    async handleToolResult(
        @MessageBody()
        data: {
            type: 'tool_result';
            conversationId: string;
            toolCallId: string;
            result: unknown;
        },
        @ConnectedSocket() _client: Socket,
    ): Promise<void> {
        this.toolDispatcher.deliverResult(
            data.conversationId,
            data.toolCallId,
            data.result,
        );
    }
}
```

Create `apps/server/src/ws/ws.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { WsGateway } from './ws-gateway';
import { SocketRegistry } from './socket-registry';

@Module({
    providers: [WsGateway, SocketRegistry],
    exports: [SocketRegistry],
})
export class WsModule {}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/server && npx jest --testPathPattern="ws-gateway.spec" --no-coverage`
Expected: PASS — 5 tests

- [ ] **Step 5: Register WsModule + RoomRouter + RoomStateMachineFactory in AiModule**

Modify `apps/server/src/ai/ai.module.ts` — add imports:

```ts
import { WsModule } from '../ws/ws.module';
import { RoomRouter } from './gateway/room-router';
import { RoomStateMachineFactory } from './gateway/room-statemachine-factory';
```

Add `WsModule` to imports array:

```ts
@Module({
    imports: [PrismaModule, ConfigModule, WsModule],
```

Add to providers array (after existing entries):

```ts
RoomRouter,
RoomStateMachineFactory,
```

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/ws/ws-gateway.ts apps/server/src/ws/ws.module.ts apps/server/src/ai/gateway/__tests__/ws-gateway.spec.ts apps/server/src/ai/ai.module.ts
git commit -m "feat: add WsGateway thin router delegating to RoomRouter

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 5: Unify ConversationStateMachine stop/error to use _getByConvOrThrow

**Files:**
- Modify: `apps/server/src/ai/gateway/conversation-statemachine.ts`

- [ ] **Step 1: Replace stop() and error() to use _getByConvOrThrow**

In `apps/server/src/ai/gateway/conversation-statemachine.ts`, replace lines 154-183:

Replace the `stop` method (lines 154-167):

```ts
    stop(conversationId: string): void {
        const session = this._getByConvOrThrow(conversationId);
        session.abortController.abort();
        this._transition(session, ConversationState.Done);
        this._emit({
            type: 'emit',
            message: {
                type: 'done',
                conversationId: session.conversationId,
                finishReason: 'stopped',
            },
        });
    }
```

Replace the `error` method (lines 169-183):

```ts
    error(conversationId: string, code: string, message: string): void {
        const session = this._getByConvOrThrow(conversationId);
        session.abortController.abort();
        this._transition(session, ConversationState.Done);
        this._emit({
            type: 'emit',
            message: {
                type: 'error',
                conversationId: session.conversationId,
                code: code as any,
                message,
            },
        });
    }
```

- [ ] **Step 2: Run existing tests to verify no regression**

Run: `cd apps/server && npx jest --testPathPattern="conversation-statemachine" --no-coverage`
Expected: PASS (or no test file found — that's OK)

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/ai/gateway/conversation-statemachine.ts
git commit -m "refactor: unify stop/error to use _getByConvOrThrow

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 6: Decouple WorkflowExecutor from ConversationStateMachine via callbacks

**Files:**
- Modify: `apps/server/src/ai/workflow-runtime/workflow.types.ts` (add SMCallbacks interface)
- Modify: `apps/server/src/ai/workflow-runtime/workflow-executor.ts` (replace direct SM calls with callbacks)
- Modify: `apps/server/src/ai/workflow-runtime/conversation-orchestrator.ts` (build and pass callbacks)

- [ ] **Step 1: Add SMCallbacks to WorkflowExecutionContext**

Modify `apps/server/src/ai/workflow-runtime/workflow.types.ts`:

```ts
/**
 * 工作流运行时类型定义（server 侧）
 */

import type { LLMConfig, NodeLLMConfigMap } from '../provider/provider.types';

/**
 * State machine callback interface — injected to decouple WorkflowExecutor
 * from the transport-layer state machine.
 */
export interface SMCallbacks {
    textChunk(content: string): void;
    toolCall(toolCallId: string, toolName: string, input: unknown, requiresConfirmation: boolean): void;
    toolDone(): void;
    llmDone(): void;
    stop(): void;
    error(code: string, message: string): void;
}

/**
 * 工作流执行上下文
 */
export interface WorkflowExecutionContext {
    conversationId: string;
    sessionId: string;
    content: string;
    llmConfigMap?: NodeLLMConfigMap;
    defaultLlmConfig?: LLMConfig;
    tokenLimit?: number;
    abortSignal?: AbortSignal;
    /** State machine callbacks — injected by caller to decouple from transport */
    smCallbacks: SMCallbacks;
}

/**
 * 工作流执行结果
 */
export interface WorkflowExecutionResult {
    success: boolean;
    assistantMessage: string;
    error?: string;
}
```

- [ ] **Step 2: Update WorkflowExecutor to use callbacks instead of direct SM calls**

Modify `apps/server/src/ai/workflow-runtime/workflow-executor.ts`:

1. Remove the `ConversationStateMachine` import and constructor injection.
2. Replace all `this.stateMachine.*` calls with `ctx.smCallbacks.*`.

The full updated file:

```ts
import type { GraphConfig, WorkflowMessage, WorkflowState } from '@my-km/langgraph-workflows';
import { Injectable, Logger } from '@nestjs/common';
import type { LLMMessage } from '../ai.types';
import { MessageService } from '../message/message.service';
import { LLMFactory } from '../provider/llm-factory';
import type { LLMConfig, NodeLLMConfigMap } from '../provider/provider.types';
import { ToolDispatcher } from '../tools/tool.dispatcher';
import { ToolRouter } from '../tools/tool-router';
import { GraphRegistry } from './graph-registry';
import { LLMResolver } from './llm-resolver';
import type { WorkflowExecutionContext } from './workflow.types';

@Injectable()
export class WorkflowExecutor {
    private readonly logger = new Logger(WorkflowExecutor.name);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private graphCache = new Map<string, any>();
    private maxToolRounds = 10;

    constructor(
        private graphRegistry: GraphRegistry,
        private llmResolver: LLMResolver,
        _llmFactory: LLMFactory,
        private messageService: MessageService,
        private toolDispatcher: ToolDispatcher,
        private toolRouter: ToolRouter,
    ) {}

    /**
     * 执行工作流
     */
    async execute(ctx: WorkflowExecutionContext, graphName = 'chat'): Promise<void> {
        const graphDef = this.graphRegistry.get(graphName);
        const graph = this.getOrCreateGraph(graphDef);

        // 构建 LLM 格式消息历史
        const history = await this.messageService.buildLLMHistory(ctx.conversationId);

        // 创建 LLM 调用函数（桥接 LLMProvider 到 LLMCaller 接口）
        const llmCaller = this.createLLMCaller(ctx.llmConfigMap, ctx.defaultLlmConfig);

        // 创建工具定义列表
        const tools = this.toolDispatcher.getDefinitions() as GraphConfig['tools'];

        // 创建 configurable 上下文
        const configurable: Partial<GraphConfig> = {
            llmCaller,
            tools,
            onChunk: (content: string) => {
                ctx.smCallbacks.textChunk(content);
            },
        };

        // 初始状态
        const initialState: Partial<WorkflowState> = {
            messages: [{ role: 'user' as const, content: ctx.content }],
            conversationId: ctx.conversationId,
            lastAssistantMessage: '',
            hasToolCalls: false,
            pendingToolCalls: [],
            toolResults: {},
            error: undefined,
            isDone: false,
        };

        try {
            // 工具调用外层循环
            let round = 0;
            const currentMessages = [...history];

            while (round < this.maxToolRounds) {
                round++;

                // 执行 LangGraph 图 — stream() 返回 Promise，需先 await
                let lastState: Partial<WorkflowState> | null = null;
                const stream = await graph.stream(initialState, { configurable });
                for await (const state of stream) {
                    lastState = state as Partial<WorkflowState>;

                    // 检查中止信号
                    if (ctx.abortSignal?.aborted) {
                        ctx.smCallbacks.stop();
                        return;
                    }
                }

                // 检查是否有工具调用
                if (!lastState?.hasToolCalls || !lastState.pendingToolCalls?.length) {
                    // 无工具调用，结束
                    break;
                }

                // 保存助手消息（包含工具调用）
                await this.messageService.create({
                    conversationId: ctx.conversationId,
                    role: 'assistant',
                    content: lastState.lastAssistantMessage || null,
                    toolCalls: lastState.pendingToolCalls.map(tc => ({
                        id: tc.id,
                        name: tc.name,
                        arguments: tc.arguments,
                        timestamp: new Date(),
                    })),
                });

                // 发送工具调用事件给前端
                for (const tc of lastState.pendingToolCalls) {
                    this.toolRouter.route(tc.name, tc.arguments, ctx.conversationId, tc.id);
                    ctx.smCallbacks.toolCall(
                        tc.id,
                        tc.name,
                        tc.arguments,
                        this.toolRouter.needsConfirmation(tc.name),
                    );
                }

                // 等待前端返回工具结果
                const results = await this.toolDispatcher.waitForResultsByConversation(
                    ctx.conversationId,
                    lastState.pendingToolCalls.map(tc => ({
                        id: tc.id,
                        name: tc.name,
                        arguments: tc.arguments,
                        timestamp: new Date(),
                    })),
                    30000,
                );

                if (!results) {
                    this.logger.warn('Tool execution timed out');
                    break;
                }

                // 将工具结果追加到消息历史
                for (const [toolId, result] of Object.entries(results)) {
                    const resultStr = typeof result === 'string' ? result : JSON.stringify(result);

                    await this.messageService.create({
                        conversationId: ctx.conversationId,
                        role: 'tool',
                        content: resultStr,
                        toolResultId: toolId,
                    });

                    // 追加 tool_result 消息到当前消息列表
                    currentMessages.push({
                        role: 'tool' as const,
                        content: [
                            {
                                type: 'tool_result',
                                tool_use_id: toolId,
                                content: resultStr,
                            },
                        ],
                    });
                }

                // 将助手消息和工具结果追加到状态消息中，用于下一轮
                const toolResultMessages: WorkflowMessage[] = Object.entries(results).map(
                    ([toolId, r]) => {
                        const resultStr = typeof r === 'string' ? r : JSON.stringify(r);
                        return {
                            role: 'tool' as const,
                            content: [
                                {
                                    type: 'tool_result' as const,
                                    tool_use_id: toolId,
                                    content: resultStr,
                                },
                            ],
                        };
                    },
                );

                initialState.messages = [
                    { role: 'user' as const, content: ctx.content },
                    ...(lastState.lastAssistantMessage
                        ? [
                              {
                                  role: 'assistant' as const,
                                  content: lastState.lastAssistantMessage,
                              },
                          ]
                        : []),
                    ...toolResultMessages,
                ];
                initialState.pendingToolCalls = [];
                initialState.hasToolCalls = false;
                initialState.toolResults = results;
            }

            if (round >= this.maxToolRounds) {
                this.logger.warn(`Max tool rounds (${this.maxToolRounds}) exceeded`);
            }

            // 执行完成
            ctx.smCallbacks.llmDone();
        } catch (error) {
            this.logger.error(`Workflow execution failed: ${error}`);
            ctx.smCallbacks.error(
                'WORKFLOW_ERROR',
                error instanceof Error ? error.message : 'Workflow execution failed',
            );
        }
    }

    /**
     * 创建 LLM 调用函数
     * 桥接 LLMProvider.chat() 到 LLMCaller 接口
     */
    private createLLMCaller(configMap?: NodeLLMConfigMap, defaultConfig?: LLMConfig) {
        return async function* (messages: LLMMessage[], abortSignal?: AbortSignal) {
            const provider = this.llmResolver.resolve('llm_call', configMap, defaultConfig);
            const tools = this.toolDispatcher.getDefinitions();
            yield* provider.chat(messages, tools, abortSignal);
        }.bind(this);
    }

    /**
     * 获取或创建编译后的图实例
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private getOrCreateGraph(graphDef: ReturnType<typeof this.graphRegistry.get>): any {
        const cacheKey = graphDef.name;

        if (!this.graphCache.has(cacheKey)) {
            const graph = graphDef.createGraph();
            this.graphCache.set(cacheKey, graph);
            this.logger.log(`Graph compiled: ${cacheKey}`);
        }

        return this.graphCache.get(cacheKey);
    }

    /**
     * 清除图缓存（用于热重载）
     */
    clearCache(): void {
        this.graphCache.clear();
    }
}
```

- [ ] **Step 3: Update ConversationOrchestrator to build and pass SMCallbacks**

Modify `apps/server/src/ai/workflow-runtime/conversation-orchestrator.ts`:

```ts
import { Injectable, Logger } from '@nestjs/common';
import { MessageService } from '../message/message.service';
import type { LLMConfig, NodeLLMConfigMap } from '../provider/provider.types';
import type { AISession } from '../session/ai-session.types';
import type { WorkflowExecutionContext, SMCallbacks } from './workflow.types';
import { WorkflowExecutor } from './workflow-executor';
import { RoomStateMachineFactory } from '../gateway/room-statemachine-factory';

@Injectable()
export class ConversationOrchestrator {
    private readonly logger = new Logger(ConversationOrchestrator.name);

    constructor(
        private messageService: MessageService,
        private workflowExecutor: WorkflowExecutor,
        private stateMachineFactory: RoomStateMachineFactory,
    ) {}

    /**
     * 编排对话执行
     */
    async dispatch(
        session: AISession,
        content: string,
        opts: {
            llmConfigMap?: NodeLLMConfigMap;
            defaultLlmConfig?: LLMConfig;
            graphName?: string;
            tokenLimit?: number;
        } = {},
    ): Promise<void> {
        const { conversationId } = session;

        // 1. 保存用户消息
        await this.messageService.create({
            conversationId,
            role: 'user',
            content,
        });

        // 2. 构建 state machine callbacks
        const sm = this.stateMachineFactory.get(conversationId);
        if (!sm) {
            this.logger.warn(`No FSM found for conversation ${conversationId} during dispatch`);
            return;
        }

        const callbacks: SMCallbacks = {
            textChunk: (content: string) => sm.textChunk(content),
            toolCall: (toolCallId, toolName, input, requiresConfirmation) =>
                sm.toolCall(toolCallId, toolName, input, requiresConfirmation),
            toolDone: () => sm.toolDone(),
            llmDone: () => sm.llmDone(),
            stop: () => sm.stop(),
            error: (code, message) => sm.error(code, message),
        };

        // 3. 构建工作流执行上下文
        const workflowCtx: WorkflowExecutionContext = {
            conversationId,
            sessionId: session.id,
            content,
            llmConfigMap: opts.llmConfigMap,
            tokenLimit: opts.tokenLimit,
            abortSignal: session.abortController.signal,
            smCallbacks: callbacks,
        };

        // 4. 执行工作流
        try {
            // 中止检查
            if (session.abortController.signal.aborted) {
                this.logger.log(`Session ${session.id} aborted before execution`);
                return;
            }

            await this.workflowExecutor.execute(workflowCtx, opts.graphName);
        } catch (error) {
            if ((error as Error).name === 'AbortError') {
                return;
            }
            this.logger.error(`Orchestration failed: ${error}`);
        }
    }
}
```

- [ ] **Step 4: Run tests to verify no regression**

Run: `cd apps/server && npx jest --testPathPattern="workflow" --no-coverage 2>&1 | tail -10`
Expected: PASS or no test file found

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/ai/workflow-runtime/workflow.types.ts apps/server/src/ai/workflow-runtime/workflow-executor.ts apps/server/src/ai/workflow-runtime/conversation-orchestrator.ts
git commit -m "refactor: decouple WorkflowExecutor from ConversationStateMachine via callbacks

WorkflowExecutor now receives SMCallbacks via WorkflowExecutionContext
instead of directly depending on ConversationStateMachine. This
decouples business logic from transport-layer protocol.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 7: Update RequestDispatcher to use SocketRegistry instead of ConnectionManager

**Files:**
- Modify: `apps/server/src/ai/dispatch/request-dispatcher.ts`
- Modify: `apps/server/src/ai/ai.module.ts` (remove ConnectionManager provider)

- [ ] **Step 1: Replace ConnectionManager with SocketRegistry**

Modify `apps/server/src/ai/dispatch/request-dispatcher.ts`:

```ts
import { Injectable, Logger } from '@nestjs/common';
import { ConversationService } from '../conversation/conversation.service';
import { AISessionManager } from '../session/ai-session-manager';
import { ConversationOrchestrator } from '../workflow-runtime/conversation-orchestrator';
import { AiRateLimiter } from './rate-limiter.guard';
import { SocketRegistry } from '../../ws/socket-registry';

export interface DispatchContext {
    conversationId: string;
    clientId: string;
    content: string;
    context?: Record<string, unknown>;
    llmConfigMap?: Record<
        string,
        {
            provider: string;
            model: string;
            temperature?: number;
            maxTokens?: number;
        }
    >;
    graphName?: string;
}

@Injectable()
export class RequestDispatcher {
    private readonly logger = new Logger(RequestDispatcher.name);

    constructor(
        private sessionManager: AISessionManager,
        private orchestrator: ConversationOrchestrator,
        private socketRegistry: SocketRegistry,
        private conversationService: ConversationService,
        private rateLimiter: AiRateLimiter,
    ) {}

    /**
     * 分发用户消息
     */
    async dispatch(ctx: DispatchContext): Promise<void> {
        const { conversationId, clientId, content } = ctx;

        // 1. 查找对话（不存在则自动创建，兼容 join 尚未到达的竞态）
        let conversation = await this.conversationService.findById(conversationId);
        if (!conversation) {
            this.logger.log(
                `[${clientId}] conversation not found in dispatch, creating: ${conversationId}`,
            );
            conversation = await this.conversationService.create({
                id: conversationId,
                userId: undefined,
            });
        }

        const userId = conversation.userId ?? null;
        if (!this.rateLimiter.check(userId, clientId)) {
            this.socketRegistry.emitToClient(clientId, 'error', {
                type: 'error',
                message: 'Rate limit exceeded. Please try again later.',
                code: 'RATE_LIMITED',
                conversationId,
            });
            return;
        }

        // 2. 创建 AI 会话（并发控制）
        const session = this.sessionManager.create({
            conversationId,
            clientId,
        });

        try {
            // 3. 执行对话编排
            await this.orchestrator.dispatch(session, content, {
                llmConfigMap: ctx.llmConfigMap,
                graphName: ctx.graphName,
            });
        } catch (error) {
            this.logger.error(`Dispatch failed for session ${session.id}:`, error);
            this.socketRegistry.emitToClient(clientId, 'error', {
                type: 'error',
                message: error instanceof Error ? error.message : 'Unknown error',
                code: 'DISPATCH_ERROR',
                conversationId,
            });
        } finally {
            // 4. 清理会话
            this.sessionManager.cleanup(conversationId);
        }
    }
}
```

- [ ] **Step 2: Update AiModule to remove ConnectionManager**

In `apps/server/src/ai/ai.module.ts`:
1. Remove `ConnectionManager` from imports.
2. Remove `ConnectionManager` from providers.

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/ai/dispatch/request-dispatcher.ts apps/server/src/ai/ai.module.ts
git commit -m "refactor: replace ConnectionManager with SocketRegistry in RequestDispatcher

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 8: Redirect AiController POST /ai/chat to RequestDispatcher, remove AiService

**Files:**
- Modify: `apps/server/src/ai/ai.controller.ts`
- Modify: `apps/server/src/ai/ai.module.ts`

- [ ] **Step 1: Redirect AiController to RequestDispatcher**

Modify `apps/server/src/ai/ai.controller.ts`:

```ts
import { Body, Controller, Delete, Get, Logger, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { RequestDispatcher } from './dispatch/request-dispatcher';
import { ConversationService } from './conversation/conversation.service';
import { SendMessageDto } from './dto/send-message.dto';
import { MessageService } from './message/message.service';

// ... (keep all interface definitions and other routes unchanged)

@ApiTags('AI')
@Controller('ai')
export class AiController {
    private readonly logger = new Logger(AiController.name);

    constructor(
        private requestDispatcher: RequestDispatcher,
        private conversationService: ConversationService,
        private messageService: MessageService,
    ) {}

    @Post('chat')
    @ApiOperation({ summary: '发送 AI 消息' })
    @ApiResponse({ status: 200, description: '消息处理完成' })
    async sendMessage(@Body() dto: SendMessageDto) {
        this.logger.log(`Received AI chat request: ${dto.content.slice(0, 50)}...`);

        try {
            await this.requestDispatcher.dispatch({
                conversationId: dto.conversationId,
                clientId: 'rest', // REST calls have no WS clientId
                content: dto.content,
                context: dto.context,
            });
            return { success: true };
        } catch (error) {
            this.logger.error('AI chat failed:', error);
            throw error;
        }
    }

    // ... keep all other methods unchanged
}
```

- [ ] **Step 2: Remove AiService from AiModule**

In `apps/server/src/ai/ai.module.ts`:
1. Remove `AiService` import.
2. Remove `AiService` from providers.
3. Remove `AiService` from exports.

- [ ] **Step 3: Delete AiService file**

```bash
rm apps/server/src/ai/ai.service.ts
```

- [ ] **Step 4: Remove ConnectionManager files**

```bash
rm apps/server/src/ai/connection/connection-manager.ts
rm apps/server/src/ai/connection/connection.types.ts
```

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/ai/ai.controller.ts apps/server/src/ai/ai.module.ts apps/server/src/ai/connection/connection-manager.ts apps/server/src/ai/connection/connection.types.ts apps/server/src/ai/ai.service.ts
git commit -m "refactor: redirect AiController to RequestDispatcher, remove AiService and ConnectionManager

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 9: Remove old AiGateway and clean up AiModule

**Files:**
- Modify: `apps/server/src/ai/ai.module.ts`
- Delete: `apps/server/src/ai/gateway/ai-ws.gateway.ts`
- Delete: `apps/server/src/ai/gateway/__tests__/ai-ws-gateway.spec.ts`
- Delete: `apps/server/src/ai/gateway/conversation-statemachine.ts`
- Delete: `apps/server/src/ai/gateway/conversation-statemachine.types.ts`
- Delete: `apps/server/src/ai/connection/` directory
- Modify: `apps/server/src/ai/ai.module.ts` (remove old providers)

- [ ] **Step 1: Remove old AiGateway and ConversationStateMachine from AiModule**

In `apps/server/src/ai/ai.module.ts`:
1. Remove `AiGateway` import and from providers.
2. Remove `ConversationStateMachine` import and from providers.
3. Remove `ConnectionManager` (already removed in Task 7).
4. Remove `AiService` (already removed in Task 8).

Also remove these from exports (if present):
- `ConversationStateMachine`
- `ConnectionManager`

And remove `ConversationOrchestrator` constructor dependency on `ConnectionManager` (already done in Task 6).

Also update `ConversationOrchestrator` — remove the `_connectionManager: ConnectionManager` constructor param (already done in Task 6's rewrite).

- [ ] **Step 2: Delete old files**

```bash
rm apps/server/src/ai/gateway/ai-ws.gateway.ts
rm apps/server/src/ai/gateway/__tests__/ai-ws-gateway.spec.ts
rm apps/server/src/ai/gateway/conversation-statemachine.ts
rm apps/server/src/ai/gateway/conversation-statemachine.types.ts
```

Note: Keep `conversation-statemachine.types.ts` types — they are still referenced by `room-statemachine.ts`. Actually, we already import from it in the new RoomStateMachine, so keep it.

Do NOT delete:
- `apps/server/src/ai/gateway/ai-ws-events.types.ts` — still used by WsGateway, RoomRouter, RoomStateMachine
- `apps/server/src/ai/gateway/conversation-statemachine.types.ts` — still used by RoomStateMachine
- `apps/server/src/ai/gateway/ws-connection.guard.ts` — preserved per design doc

- [ ] **Step 3: Run full test suite**

Run: `cd apps/server && npx jest --no-coverage 2>&1 | tail -20`
Expected: PASS — all tests pass

- [ ] **Step 4: Commit**

```bash
git add -A apps/server/src/ai/
git commit -m "refactor: remove old AiGateway and ConversationStateMachine

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 10: Update handleDisconnect to clean up FSMs and abort sessions

**Files:**
- Modify: `apps/server/src/ws/ws-gateway.ts`

- [ ] **Step 1: Add FSM cleanup on disconnect**

In `apps/server/src/ws/ws-gateway.ts`, inject `RoomStateMachineFactory` and call `destroyByClientId` on disconnect:

Add to constructor:
```ts
constructor(
    private registry: SocketRegistry,
    private roomRouter: RoomRouter,
    private toolDispatcher: ToolDispatcher,
    private stateMachineFactory: RoomStateMachineFactory,
) {}
```

Update `handleDisconnect`:
```ts
handleDisconnect(client: Socket): void {
    this.logger.log(`Client disconnected: ${client.id}`);
    this.stateMachineFactory.destroyByClientId(client.id);
    this.registry.unregister(client.id);
}
```

Also update `apps/server/src/ws/ws.module.ts` to import RoomStateMachineFactory:

```ts
import { Module } from '@nestjs/common';
import { WsGateway } from './ws-gateway';
import { SocketRegistry } from './socket-registry';

@Module({
    providers: [WsGateway, SocketRegistry],
    exports: [SocketRegistry],
})
export class WsModule {}
```

WsGateway already has access to RoomStateMachineFactory through the ai module's providers (it's in the same module context via AiModule). If needed, import via `forwardRef` or add to WsModule exports.

Actually, since WsGateway is in WsModule and RoomStateMachineFactory is in AiModule, and WsModule is imported by AiModule, WsGateway can inject RoomStateMachineFactory directly (AiModule provides it, WsModule is imported into AiModule — but the providers are not cross-visible). 

The cleanest approach: have `RoomRouter` expose a `onClientDisconnect(clientId: string)` method that delegates to the factory.

Add to `RoomRouter`:
```ts
onClientDisconnect(clientId: string): void {
    this.stateMachineFactory.destroyByClientId(clientId);
}
```

Then in WsGateway `handleDisconnect`:
```ts
handleDisconnect(client: Socket): void {
    this.logger.log(`Client disconnected: ${client.id}`);
    this.roomRouter.onClientDisconnect(client.id);
    this.registry.unregister(client.id);
}
```

- [ ] **Step 2: Add test for disconnect cleanup**

Add to `apps/server/src/ai/gateway/__tests__/ws-gateway.spec.ts`:

```ts
it('cleans up FSMs on disconnect', () => {
    const onDisconnectSpy = jest.spyOn(roomRouter, 'onClientDisconnect');
    gateway.handleConnection(mockSocket as Socket);
    gateway.handleDisconnect(mockSocket as Socket);
    expect(onDisconnectSpy).toHaveBeenCalledWith('test-sock');
});
```

And to `room-router.spec.ts`:

```ts
describe('onClientDisconnect', () => {
    it('destroys all FSMs for the client', () => {
        roomRouter.onClientDisconnect('client-1');
        expect(stateMachineFactory.destroyByClientId).toHaveBeenCalledWith('client-1');
    });
});
```

- [ ] **Step 3: Run tests**

Run: `cd apps/server && npx jest --testPathPattern="(ws-gateway|room-router).spec" --no-coverage`
Expected: PASS — all tests pass

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/ws/ws-gateway.ts apps/server/src/ai/gateway/room-router.ts apps/server/src/ai/gateway/__tests__/ws-gateway.spec.ts apps/server/src/ai/gateway/__tests__/room-router.spec.ts
git commit -m "feat: clean up FSMs on client disconnect

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 11: Final cleanup and full test run

- [ ] **Step 1: Run full test suite**

Run: `cd apps/server && npx jest --no-coverage 2>&1`
Expected: All tests pass. Fix any failures.

- [ ] **Step 2: Verify TypeScript compilation**

Run: `cd apps/server && npx tsc --noEmit 2>&1 | head -30`
Expected: No errors. Fix any type errors.

- [ ] **Step 3: Verify no remaining references to deleted components**

Run:
```bash
cd apps/server/src
grep -r "ConnectionManager" --include="*.ts" .
grep -r "AiService" --include="*.ts" .
grep -r "from.*ai-ws.gateway" --include="*.ts" .
```
Expected: No results (except comments).

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "refactor: complete AI gateway refactor — all tests passing

- WsGateway (ws/) replaces old AiGateway (ai/)
- RoomRouter handles business orchestration
- RoomStateMachineFactory manages per-room FSMs
- WorkflowExecutor decoupled via SMCallbacks
- ConnectionManager replaced by SocketRegistry
- AiService removed, AiController uses RequestDispatcher

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Test Matrix Summary

| Component | Test File | Key Scenarios |
|-----------|-----------|---------------|
| SocketRegistry | `socket-registry.spec.ts` | register, unregister, emitToClient, isOnline |
| WsGateway | `ws-gateway.spec.ts` | connection lifecycle, message routing, error handling, disconnect cleanup |
| RoomRouter | `room-router.spec.ts` | createAndSend, sendMessage, joinRoom, stop, error paths |
| RoomStateMachineFactory | `room-statemachine-factory.spec.ts` | create, duplicate rejection, destroy, per-client cleanup |

## Key Interactions to Verify (manual/E2E)

1. Create new conversation and send first message — verify `create_and_send` flows through RoomRouter → RoomService.create → StateMachine.create → RequestDispatcher.dispatch
2. Send message to existing conversation — verify `send_message` finds conversation, creates FSM, dispatches
3. Join conversation to load history — verify `join` emits history event
4. Stop generation — verify `stop` aborts the FSM
5. Tool call result roundtrip — verify `tool_result` reaches ToolDispatcher

## Edge Cases to Verify

- Send message to non-existent room → CONVERSATION_NOT_FOUND error
- Send to busy room (already processing) → CONVERSATION_BUSY error
- Client disconnect → abort all active sessions, destroy FSMs
- Duplicate create for same room → already active error thrown
- Invalid state machine transitions → exception thrown
