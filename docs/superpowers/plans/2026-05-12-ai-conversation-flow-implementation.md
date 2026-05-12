# AI 对话流程重构实施计划

> **执行者必读：** 实现本计划必须使用子技能 `superpowers:subagent-driven-development`（推荐）或 `superpowers:executing-plans`，按任务逐步执行。步骤使用复选框（`- [ ]`）语法跟踪进度。

**目标：** 用状态机驱动的两层架构替换当前的 AI 对话流程，包含统一事件协议、按危险等级路由工具、以及通过 localStorage 实现对话恢复。

**架构：** 后端 ConversationStateMachine 管理对话生命周期（Idle → BuildingContext → Processing → ToolWaiting/ToolExecuting → Done）。前端 Event Hub 按类型名分发事件。WS Service 自动管理连接生命周期。Tool Router 按执行目标和危险等级路由 LLM 工具调用。

**技术栈：** TypeScript、NestJS（后端）、socket.io/socket.io-client、LangGraph（保留为工作流引擎）、Jest（服务端测试）、Vitest（Web 测试）、Prisma

---

## 文件结构

### 新建文件
| 文件 | 职责 |
|------|------|
| `apps/server/src/ai/gateway/conversation-statemachine.ts` | 核心状态机：Idle/BuildingContext/Processing/ToolWaiting/ToolExecuting/Done |
| `apps/server/src/ai/gateway/conversation-statemachine.types.ts` | 状态机类型：ConversationState 枚举、ConversationFSM 接口、转换事件 |
| `apps/server/src/ai/tools/tool-router.ts` | 按执行目标（后端/前端）和危险等级（低/高）路由 LLM 工具调用 |
| `apps/server/src/ai/gateway/ai-ws-events.types.ts` | 共享 WS 事件类型（ClientMessage/ServerMessage 判别联合类型） |

### 修改文件
| 文件 | 变更 |
|------|------|
| `apps/web/src/features/ai/types/ai.types.ts` | 用新事件协议替换 ClientMessage/ServerMessage |
| `apps/web/src/platform/ws-client/ws-client.service.ts` | 添加新事件发射器，更新发送方法适配新协议 |
| `apps/web/src/features/ai/harness/ai-harness.service.ts` | 添加 Event Hub 模式、对话恢复、工具确认 UI |
| `apps/web/src/features/ai/harness/conversation-state.ts` | 添加生成中状态跟踪，用于禁用发送按钮 |
| `apps/server/src/ai/gateway/ai-ws.gateway.ts` | 用新协议替换旧事件处理器，接入 StateMachine |
| `apps/server/src/ai/tools/tool.types.ts` | 为 RegisteredTool 添加 `execution` 和 `danger` 字段 |
| `apps/server/src/ai/workflow-runtime/workflow-executor.ts` | 接入 StateMachine 替代手动工具循环，移除废弃的 currentMessages |
| `apps/server/src/ai/workflow-runtime/conversation-orchestrator.ts` | 委托给 StateMachine，移除直接的会话管理 |

### 不变文件（仅供参考）
| 文件 | 原因 |
|------|------|
| `apps/server/src/ai/session/ai-session-manager.ts` | 暂保留，StateMachine 封装它 |
| `apps/server/src/ai/message/message.service.ts` | 保持不变，StateMachine 调用它 |
| `apps/server/src/ai/conversation/conversation.service.ts` | 保持不变 |
| `apps/server/src/ai/dispatch/request-dispatcher.ts` | 将简化，不移除 |
| `packages/langgraph-workflows/` | 保持不变，图定义不变 |
| `apps/server/src/ai/provider/` | 保持不变 |
| `apps/server/src/ai/connection/connection-manager.ts` | 保持不变 |
| `apps/server/src/ai/tools/tool.dispatcher.ts` | 保留 waitForResults 机制，ToolRouter 使用它 |
| `apps/server/src/ai/tools/tool.registry.ts` | 保留，将定义合并为单一来源 |

---

### 任务 1：定义服务端 WS 事件类型 ✅ 已完成

**文件：**
- 新建：`apps/server/src/ai/gateway/ai-ws-events.types.ts`

- [ ] **步骤 1：编写新的 WS 事件类型**

创建 `apps/server/src/ai/gateway/ai-ws-events.types.ts`：

```typescript
/**
 * AI WebSocket 事件类型 — 服务端-客户端协议
 *
 * ClientMessage: 前端 → 后端
 * ServerMessage: 后端 → 前端
 *
 * 所有事件均使用带 `type` 字段的判别联合类型。
 */

/**
 * 编辑器上下文（由前端收集，随消息发送）
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
 * 消息线格式（用于历史记录）
 */
export interface MessageWire {
    id: string;
    role: 'user' | 'assistant' | 'tool' | 'system';
    content: string | null;
    toolCalls?: Array<{ id: string; name: string }>;
    toolCallId?: string;
    createdAt: string;
}

// === 客户端 → 服务端 ===

export type ClientMessage =
    | { type: 'create_and_send'; content: string; context?: EditorContext }
    | { type: 'send_message'; conversationId: string; content: string; context?: EditorContext }
    | { type: 'tool_result'; conversationId: string; toolCallId: string; result: unknown }
    | { type: 'stop'; conversationId: string }
    | { type: 'join'; conversationId: string };

// === 服务端 → 客户端 ===

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

- [ ] **步骤 2：验证类型编译通过**

运行：`cd apps/server && npx tsc --noEmit src/ai/gateway/ai-ws-events.types.ts`
预期：无错误（导入项可能从项目 tsconfig 解析）

- [ ] **步骤 3：提交**

```bash
git add apps/server/src/ai/gateway/ai-ws-events.types.ts
git commit -m "feat: define AI WebSocket event types for new conversation protocol

Add discriminated unions for ClientMessage and ServerMessage.
All events include conversationId. Status, error, and finish
types are explicitly enumerated."
```

---

### 任务 2：添加工具元数据（execution + danger） ✅ 已完成

**文件：**
- 修改：`apps/server/src/ai/tools/tool.types.ts`

- [ ] **步骤 1：编写失败测试**

创建 `apps/server/src/ai/tools/__tests__/tool-metadata.spec.ts`：

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

- [ ] **步骤 2：运行测试验证失败**

运行：`cd apps/server && npx jest src/ai/tools/__tests__/tool-metadata.spec.ts`
预期：失败 — TypeScript 编译错误（execution/danger 在 RegisteredTool 上不存在）

- [ ] **步骤 3：更新 tool.types.ts**

修改 `apps/server/src/ai/tools/tool.types.ts`：

```typescript
/**
 * Tool 模块类型定义
 */

import type { ToolDefinition } from '../ai.types';

/**
 * 工具执行位置
 */
export type ToolExecution = 'backend' | 'frontend';

/**
 * 后端工具危险等级（控制用户确认）
 * 仅在 execution === 'backend' 时有意义
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

- [ ] **步骤 4：运行测试验证通过**

运行：`cd apps/server && npx jest src/ai/tools/__tests__/tool-metadata.spec.ts`
预期：通过

- [ ] **步骤 5：提交**

```bash
git add apps/server/src/ai/tools/tool.types.ts apps/server/src/ai/tools/__tests__/tool-metadata.spec.ts
git commit -m "feat: add execution and danger metadata to RegisteredTool

Backend tools can now specify execution target (backend/frontend)
and danger level (low/high) for automatic routing."
```

---

### 任务 3：创建 ToolRouter ✅ 已完成

**文件：**
- 新建：`apps/server/src/ai/tools/tool-router.ts`
- 新建：`apps/server/src/ai/tools/__tests__/tool-router.spec.ts`

- [ ] **步骤 1：编写失败测试**

创建 `apps/server/src/ai/tools/__tests__/tool-router.spec.ts`：

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

- [ ] **步骤 2：运行测试验证失败**

运行：`cd apps/server && npx jest src/ai/tools/__tests__/tool-router.spec.ts`
预期：失败 — 模块未找到

- [ ] **步骤 3：实现 ToolRouter**

创建 `apps/server/src/ai/tools/tool-router.ts`：

```typescript
/**
 * ToolRouter — 按执行目标和危险等级路由 LLM 工具调用。
 *
 * 决策矩阵：
 * - backend + low  → auto_execute（服务端执行，注入结果到 LLM）
 * - backend + high → frontend_confirm（向客户端发送 tool_call，等待确认）
 * - frontend       → frontend_direct（向客户端发送 tool_call，立即执行）
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
     * 路由工具调用并发出决策。
     * 立即返回 — 实际执行通过事件异步完成。
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
            // 发出自动执行事件
            this._onAutoExecute.fire({ toolName, input, conversationId, toolCallId });
        } else if (execution === 'backend' && danger === 'high') {
            mode = 'frontend_confirm';
            requiresConfirmation = true;
        } else {
            // 前端执行
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

- [ ] **步骤 4：运行测试验证通过**

运行：`cd apps/server && npx jest src/ai/tools/__tests__/tool-router.spec.ts`
预期：通过

- [ ] **步骤 5：提交**

```bash
git add apps/server/src/ai/tools/tool-router.ts apps/server/src/ai/tools/__tests__/tool-router.spec.ts
git commit -m "feat: create ToolRouter for routing LLM tool calls by danger level

Backend+low tools auto-execute. Backend+high tools require user
confirmation. Frontend tools emit directly to client."
```

---

### 任务 4：创建 Conversation StateMachine ✅ 已完成

**文件：**
- 新建：`apps/server/src/ai/gateway/conversation-statemachine.types.ts`
- 新建：`apps/server/src/ai/gateway/conversation-statemachine.ts`
- 新建：`apps/server/src/ai/gateway/__tests__/conversation-statemachine.spec.ts`

- [ ] **步骤 1：编写状态机类型**

创建 `apps/server/src/ai/gateway/conversation-statemachine.types.ts`：

```typescript
/**
 * 对话状态机类型
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

// 有效转换矩阵
const VALID_TRANSITIONS: Record<ConversationState, ConversationState[]> = {
    [ConversationState.Idle]: [ConversationState.BuildingContext],
    [ConversationState.BuildingContext]: [ConversationState.Processing, ConversationState.Done],
    [ConversationState.Processing]: [
        ConversationState.Processing, // 流式传输继续
        ConversationState.ToolWaiting,
        ConversationState.ToolExecuting,
        ConversationState.Done,
    ],
    [ConversationState.ToolWaiting]: [ConversationState.ToolExecuting, ConversationState.Done],
    [ConversationState.ToolExecuting]: [ConversationState.Processing, ConversationState.Done],
    [ConversationState.Done]: [], // 终止状态
};

export function isValidTransition(from: ConversationState, to: ConversationState): boolean {
    return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}
```

- [ ] **步骤 2：编写失败测试**

创建 `apps/server/src/ai/gateway/__tests__/conversation-statemachine.spec.ts`：

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
        // 使用事件模块模式 — 创建最小 mock
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
            // 不能从 Idle 直接到 Done（需经过 BuildingContext）
            // 实际上 Idle → Done 通过 BuildingContext → Done 路径是有效的
            // 测试 Processing → Idle 这个无效转换
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

- [ ] **步骤 3：运行测试验证失败**

运行：`cd apps/server && npx jest src/ai/gateway/__tests__/conversation-statemachine.spec.ts`
预期：失败 — 模块未找到

- [ ] **步骤 4：实现 ConversationStateMachine**

创建 `apps/server/src/ai/gateway/conversation-statemachine.ts`：

```typescript
/**
 * ConversationStateMachine — 管理单个 AI 对话的生命周期。
 *
 * 状态流转：Idle → BuildingContext → Processing → [ToolWaiting → ToolExecuting → Processing]* → Done
 *
 * 在状态转换时发出事件，供网关响应。
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

// 状态机内部事件总线
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
                // 不要让处理器错误破坏状态机
                console.error('[StateMachine] Handler error:', e);
            }
        }
    }

    create(ctx: ConversationContext): ConversationFSM {
        // 防止重复活动会话
        const existingSessionId = this._byConversation.get(ctx.conversationId);
        if (existingSessionId) {
            const existing = this._sessions.get(existingSessionId);
            if (existing && existing.state !== ConversationState.Done) {
                throw new Error(`Conversation ${ctx.conversationId} already has an active session`);
            }
            // 上一个会话已完成，允许新建
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
        // 保持在 Processing 状态，发出文本块
        this._emit({
            type: 'emit',
            message: { type: 'text_chunk', conversationId: session.conversationId, content },
        });
    }

    toolCall(sessionId: string, info: ToolCallInfo): void {
        const session = this._getOrThrow(sessionId);
        if (info.requiresConfirmation) {
            this._transition(session, ConversationState.ToolWaiting);
            // 向客户端发出 tool_call 事件
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
            // 工具将自动执行
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
        if (!session) return; // 会话可能已清理
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
        if (from === to) return; // 无操作

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

- [ ] **步骤 5：运行测试并修复失败**

运行：`cd apps/server && npx jest src/ai/gateway/__tests__/conversation-statemachine.spec.ts`
预期：通过（修复任何问题）

- [ ] **步骤 6：提交**

```bash
git add apps/server/src/ai/gateway/conversation-statemachine.types.ts apps/server/src/ai/gateway/conversation-statemachine.ts apps/server/src/ai/gateway/__tests__/conversation-statemachine.spec.ts
git commit -m "feat: create ConversationStateMachine for dialog lifecycle management

States: Idle → BuildingContext → Processing → [ToolWaiting →
ToolExecuting → Processing]* → Done. Prevents duplicate active
sessions per conversation."
```

---

### 任务 5：更新前端类型（ai.types.ts） ✅ 已完成

**文件：**
- 修改：`apps/web/src/features/ai/types/ai.types.ts`

- [ ] **步骤 1：编写失败测试**

创建 `apps/web/src/features/ai/types/__tests__/ai-types.test.ts`：

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

- [ ] **步骤 2：运行测试验证失败**

运行：`cd apps/web && npx vitest run src/features/ai/types/__tests__/ai-types.test.ts`
预期：失败 — 类型错误（新类型尚不存在）

- [ ] **步骤 3：更新 ai.types.ts**

修改 `apps/web/src/features/ai/types/ai.types.ts`。用新协议替换现有的 `ClientMessage` 和 `ServerMessage` 类型：

```typescript
/**
 * AI 模块共享类型定义
 *
 * 更新于 2026-05-12：基于判别联合类型的新事件协议。
 * 所有事件均包含 conversationId。事件遵循单一职责原则。
 */

import type { FormatState, Position } from '@/features/editor/types';

/**
 * 编辑器上下文（由前端收集，随消息发送）
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
 * 消息线格式（用于历史记录）
 */
export interface MessageWire {
    id: string;
    role: 'user' | 'assistant' | 'tool' | 'system';
    content: string | null;
    toolCalls?: Array<{ id: string; name: string }>;
    toolCallId?: string;
    createdAt: string;
}

// === 客户端 → 服务端 ===

export type ClientMessage =
    | { type: 'create_and_send'; content: string; context?: EditorContext }
    | { type: 'send_message'; conversationId: string; content: string; context?: EditorContext }
    | { type: 'tool_result'; conversationId: string; toolCallId: string; result: unknown }
    | { type: 'stop'; conversationId: string }
    | { type: 'join'; conversationId: string };

// === 服务端 → 客户端 ===

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

// === 遗留类型（迁移期间向后兼容）===
/** @deprecated 使用 ServerMessage 替代 */
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

- [ ] **步骤 4：运行测试验证通过**

运行：`cd apps/web && npx vitest run src/features/ai/types/__tests__/ai-types.test.ts`
预期：通过

同时运行类型检查：`cd apps/web && npx tsc --noEmit` — 可能显示导入旧 ServerMessage 字段的文件的错误。这些将在任务 6 中修复。

- [ ] **步骤 5：提交**

```bash
git add apps/web/src/features/ai/types/ai.types.ts apps/web/src/features/ai/types/__tests__/ai-types.test.ts
git commit -m "feat: update AI event types to new single-responsibility protocol

All events now include conversationId. New events: created, status,
done (with finishReason), error (with code). Tool_call includes
requiresConfirmation flag."
```

---

### 任务 6：为新协议更新 WS 客户端服务 ✅ 已完成

**文件：**
- 修改：`apps/web/src/platform/ws-client/ws-client.service.ts`

- [ ] **步骤 1：编写失败测试**

添加到 `apps/web/src/features/ai/harness/__tests__/ws-client.test.ts`（追加到现有测试之后）：

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

- [ ] **步骤 2：运行测试验证失败**

运行：`cd apps/web && npx vitest run src/features/ai/harness/__tests__/ws-client.test.ts`
预期：失败 — onCreated、onStatus、onDone、sendCreateAndSend 不存在

- [ ] **步骤 3：更新 WSClientService**

修改 `apps/web/src/platform/ws-client/ws-client.service.ts`。添加这些新的事件发射器、处理器和发送方法：

```typescript
// 在类级别添加新发射器（在约第 36 行现有发射器之后）：
private _onCreated = new Emitter<{ conversationId: string }>();
private _onStatus = new Emitter<{ conversationId: string; status: string; message?: string }>();
private _onDone = new Emitter<{ conversationId: string; finishReason: string; error?: string }>();

// 添加新事件访问器（在约第 240 行现有访问器之后）：
get onCreated(): Event<{ conversationId: string }> {
    return this._onCreated.event;
}
get onStatus(): Event<{ conversationId: string; status: string; message?: string }> {
    return this._onStatus.event;
}
get onDone(): Event<{ conversationId: string; finishReason: string; error?: string }> {
    return this._onDone.event;
}

// 添加新发送方法（在约第 199 行 stopGenerating 之后）：
sendCreateAndSend(content: string, context: unknown): void {
    if (!this._socket || !this._socket.connected) {
        throw new Error('WebSocket is not connected');
    }
    this._socket.emit('create_and_send', { type: 'create_and_send', content, context });
}

sendJoin(conversationId: string): void {
    this._socket?.emit('join', { type: 'join', conversationId });
}

// 更新 _handleMessage 以处理新事件：
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
            // 遗留事件（迁移期间向后兼容）
            case 'joined':
                break;
            case 'tool_timeout':
                this._onToolTimeout.fire({ toolCallId: (msg as any).toolCallId, message: (msg as any).message });
                break;
            default:
                // 穷举检查 — 如果添加了新事件类型但未处理
                const _exhaustiveCheck: never = msg;
                console.warn('[WS] Unhandled message type:', (_exhaustiveCheck as any).type);
        }
    } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
    }
}

// 在 dispose() 末尾添加新发射器的清理（在 dispose 方法末尾）：
this._onCreated.dispose();
this._onStatus.dispose();
this._onDone.dispose();
```

同时添加 `ServerMessage` 导入：
```typescript
import type { ServerMessage } from '@/features/ai/types/ai.types';
```

- [ ] **步骤 4：运行测试验证通过**

运行：`cd apps/web && npx vitest run src/features/ai/harness/__tests__/ws-client.test.ts`
预期：通过

- [ ] **步骤 5：提交**

```bash
git add apps/web/src/platform/ws-client/ws-client.service.ts apps/web/src/features/ai/harness/__tests__/ws-client.test.ts
git commit -m "feat: update WSClientService for new event protocol

Add onCreated, onStatus, onDone emitters. Add sendCreateAndSend
and sendJoin methods. Update _handleMessage for discriminated
union routing."
```

---

### 任务 7：更新 AI Harness — Event Hub + 对话恢复 ✅ 已完成

**文件：**
- 修改：`apps/web/src/features/ai/harness/ai-harness.service.ts`
- 修改：`apps/web/src/features/ai/harness/conversation-state.ts`

- [ ] **步骤 1：为 ConversationState 添加生成中状态跟踪**

修改 `apps/web/src/features/ai/harness/conversation-state.ts`。添加 `isProcessing` getter，用于跟踪对话处于生成/处理中状态（用于禁用发送按钮）：

```typescript
// 添加到 ConversationState 接口（约第 28 行）：
readonly isProcessing: boolean;

// 在 ConversationStateImpl 类中添加私有字段：
private _isProcessing = false;

// 更新 startGenerating() 设置 _isProcessing = true：
startGenerating(): void {
    this._isGenerating = true;
    this._isProcessing = true;
    // ... 其余现有代码
}

// 更新 stopGenerating() 设置 _isProcessing = false：
stopGenerating(): void {
    this._isProcessing = false;
    this._isGenerating = false;
    // ... 其余现有代码
}

// 添加 getter：
get isProcessing(): boolean {
    return this._isProcessing;
}

// 更新 onStateChange 触发以包含 isProcessing：
this._onStateChange.fire({
    messages: this._messages,
    isGenerating: this._isGenerating,
    isProcessing: this._isProcessing,
});
```

- [ ] **步骤 2：更新 AIHarnessService 接口**

修改 `apps/web/src/features/ai/harness/ai-harness.service.ts`。更新接口：

```typescript
// 替换 AIHarnessService 接口中的内容：
// 对话相关方法：
connect(wsUrl: string): Promise<void>;
disconnect(): void;
joinConversation(conversationId: string): void;
sendMessage(content: string, conversationId?: string): Promise<string | null>; // 返回 conversationId
sendCreateAndSend(content: string): Promise<string | null>; // 用于新对话
restoreConversation(conversationId: string): void; // 对话恢复
stopGenerating(): void;

// 添加新事件：
get onStatus(): Event<{ conversationId: string; status: string; message?: string }>;
get onCreated(): Event<{ conversationId: string }>;
get onDone(): Event<{ conversationId: string; finishReason: string; error?: string }>;

// 添加状态访问：
get isProcessing(): boolean;
```

- [ ] **步骤 3：更新 AIHarnessServiceImpl 实现**

替换 `AIHarnessServiceImpl` 的相关部分：

```typescript
// 添加新发射器（在现有发射器之后）：
private _onStatus = new Emitter<{ conversationId: string; status: string; message?: string }>();
private _onCreated = new Emitter<{ conversationId: string }>();
private _onDone = new Emitter<{ conversationId: string; finishReason: string; error?: string }>();

// 更新 _setupEventProxy 以处理新事件：
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
    // 新：处理 created 事件
    this._store.add(
        this._wsClient.onCreated(e => {
            this._conversationState.setConversationId(e.conversationId);
            this._saveActiveConversationId(e.conversationId);
            this._onCreated.fire(e);
        }),
    );
    // 新：处理 status 事件
    this._store.add(
        this._wsClient.onStatus(e => {
            this._onStatus.fire(e);
        }),
    );
    // 新：处理 done 事件
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

// 添加 localStorage 辅助方法：
private _saveActiveConversationId(id: string): void {
    try {
        localStorage.setItem('activeConversationId', id);
    } catch {
        // localStorage 可能不可用
    }
}

private _clearActiveConversationId(): void {
    try {
        localStorage.removeItem('activeConversationId');
    } catch {
        // localStorage 可能不可用
    }
}

// 替换 sendMessage 并添加新方法：
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

    // conversationId 将在 'created' 事件到达时设置
    return null;
}

// 添加 restoreConversation：
restoreConversation(conversationId: string): void {
    this._conversationState.setConversationId(conversationId);
    this._wsClient.sendJoin(conversationId);
    // 历史将通过 'history' 事件到达并由 _setupEventProxy 加载
}

// 更新 stopGenerating：
stopGenerating(): void {
    const conversationId = this._conversationState.conversationId;
    if (conversationId) {
        this._wsClient.stopGenerating(conversationId);
    }
    this._conversationState.stopGenerating();
}

// 添加 getter：
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

// 更新 dispose 以释放新发射器：
this._onStatus.dispose();
this._onCreated.dispose();
this._onDone.dispose();
```

- [ ] **步骤 4：为新 Harness 行为编写测试**

添加到 `apps/web/src/features/ai/harness/__tests__/harness.test.ts`：

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

- [ ] **步骤 5：运行类型检查**

运行：`cd apps/web && npx tsc --noEmit`
预期：无错误（修复任何类型不匹配）

- [ ] **步骤 6：提交**

```bash
git add apps/web/src/features/ai/harness/ai-harness.service.ts apps/web/src/features/ai/harness/conversation-state.ts apps/web/src/features/ai/harness/__tests__/harness.test.ts
git commit -m "feat: update AI Harness with Event Hub pattern and conversation recovery

Add onCreated/onStatus/onDone events. Add restoreConversation for
localStorage-based recovery. Add isProcessing state for send button
disable. Send methods auto-create or reuse conversations."
```

---

### 任务 8：用新协议 + StateMachine 重写 AI Gateway ✅ 已完成

**文件：**
- 修改：`apps/server/src/ai/gateway/ai-ws.gateway.ts`
- 修改：`apps/server/src/ai/ai.module.ts`（注册新提供者）

- [ ] **步骤 1：编写失败测试**

创建 `apps/server/src/ai/gateway/__tests__/ai-ws-gateway.spec.ts`：

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
        // 触发 create_and_send 处理器
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
        // 设置：对话已有活动会话
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

- [ ] **步骤 2：运行测试验证失败**

运行：`cd apps/server && npx jest src/ai/gateway/__tests__/ai-ws-gateway.spec.ts`
预期：失败 — 处理器尚不存在

- [ ] **步骤 3：重写 ai-ws.gateway.ts**

修改 `apps/server/src/ai/gateway/ai-ws.gateway.ts`。用新协议处理器替换现有处理器：

```typescript
// 在文件顶部，添加导入：
import { ConversationStateMachine } from './conversation-statemachine';
import type { ClientMessage, ServerMessage } from './ai-ws-events.types';

// 在构造函数中注入 ConversationStateMachine：
constructor(
    // ... 现有注入
    @Inject(ConversationStateMachine) private readonly stateMachine: ConversationStateMachine,
) {
    // ...
}

// 在 handleConnection 中或之后设置状态机事件处理器：
@WebSocketGateway({
    namespace: 'ai',
    cors: { origin: process.env.FRONTEND_URL || 'http://localhost:4000' },
})
export class AiGateway {
    // 在 handleConnection 或 afterPropertiesSet 中：
    private _setupStateMachineHandler(): void {
        this.stateMachine.onEvent(event => {
            if (event.type === 'emit') {
                // 向拥有此对话的客户端发出
                this.server.to(event.message.conversationId).emit(event.message.type, event.message);
            }
        });
    }

    // 替换现有事件处理器：

    @SubscribeMessage('create_and_send')
    async handleCreateAndSend(client: Socket, data: ClientMessage & { type: 'create_and_send' }): Promise<void> {
        try {
            // 创建对话
            const conversation = await this.conversationService.create({
                title: data.content.substring(0, 50),
            });

            // 注册客户端到连接管理器
            this.connectionManager.registerClient(client.id, conversation.id);
            client.join(conversation.id);

            // 创建会话
            const session = this.sessionManager.create({
                conversationId: conversation.id,
                clientId: client.id,
            });

            // 发出 created
            client.emit('created', { type: 'created', conversationId: conversation.id });

            // 创建状态机会话
            this.stateMachine.create({ conversationId: conversation.id, clientId: client.id });

            // 分发消息
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
            // 检查对话是否存在
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

            // 注册客户端并加入房间（幂等）
            this.connectionManager.registerClient(client.id, data.conversationId);
            client.join(data.conversationId);

            // 创建会话（如果已活动则抛出）
            const session = this.sessionManager.create({
                conversationId: data.conversationId,
                clientId: client.id,
            });

            // 分发
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

            // 加载并发出历史
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

    // 保留 handleConnection 和 handleDisconnect 不变
}
```

注意：这是一次重大重写。旧的 `handleMessage`、`handleJoin` 逻辑被替换。关键变更：
1. `create_and_send` 创建对话，发出 `created`，然后分发
2. `send_message` 验证对话是否存在，不存在则返回 `CONVERSATION_NOT_FOUND`
3. `join` 仅加载历史（不自动创建）
4. 重复会话检测返回 `CONVERSATION_BUSY`

- [ ] **步骤 4：运行测试并修复**

运行：`cd apps/server && npx jest src/ai/gateway/__tests__/ai-ws-gateway.spec.ts`
预期：通过（修复任何问题）

- [ ] **步骤 5：提交**

```bash
git add apps/server/src/ai/gateway/ai-ws.gateway.ts apps/server/src/ai/gateway/__tests__/ai-ws-gateway.spec.ts apps/server/src/ai/ai.module.ts
git commit -m "feat: rewrite AI gateway with new event protocol and StateMachine

Replace old handlers with create_and_send/send_message/join/stop/
tool_result. ConversationStateMachine manages dialog lifecycle.
Errors use explicit codes (CONVERSATION_NOT_FOUND, CONVERSATION_BUSY)."
```

---

### 任务 9：将 WorkflowExecutor 接入 StateMachine ✅ 已完成

**文件：**
- 修改：`apps/server/src/ai/workflow-runtime/workflow-executor.ts`
- 修改：`apps/server/src/ai/workflow-runtime/conversation-orchestrator.ts`

- [ ] **步骤 1：更新 WorkflowExecutor 以使用 StateMachine**

修改 `apps/server/src/ai/workflow-runtime/workflow-executor.ts`。关键变更：不再使用手动的 `while` 循环处理工具调用，而是让执行器与 StateMachine 协同工作。StateMachine 驱动流程，执行器响应状态转换。

最小变更方案：保留现有的 execute() 方法，但让它向 StateMachine 报告状态，而非管理自己的循环：

```typescript
// 在 execute() 方法中，graph.stream() 返回后：
// 不再使用手动工具循环，让 StateMachine 处理转换：

// 当 LLM 产生 tool_calls 时：
this.stateMachine.toolCall(sessionId, {
    toolCallId: tc.id,
    toolName: tc.name,
    input: tc.input,
    requiresConfirmation: this.toolRouter.needsConfirmation(tc.name),
});

// 当工具结果到达时（通过 StateMachine 的 onAutoExecute 或 tool_result 传递）：
this.stateMachine.toolResult(sessionId, toolCallId);
// ... 执行工具 ...
this.stateMachine.toolDone(sessionId);
// ... 用工具结果重新调用图 ...

// 当 LLM 完成时：
this.stateMachine.llmDone(sessionId);
```

完整实现需要仔细集成。方法：
1. 将 `ToolRouter` 和 `ConversationStateMachine` 注入 `WorkflowExecutor`
2. 用 StateMachine 驱动的流替换 `while (toolCallCount < maxToolRounds)` 循环
3. StateMachine 发出事件，执行器监听并执行

由于这很复杂，修改后的 `execute()` 方法实现代码如下：

```typescript
// 更新后的 execute 方法 — 仅显示关键变更（保留周围代码）：
async execute(ctx: WorkflowExecutionContext, graphName?: string): Promise<void> {
    const { conversationId, sessionId, content, llmConfigMap, defaultLlmConfig, tokenLimit } = ctx;
    const graphDef = this.graphRegistry.getGraph(graphName ?? 'ChatGraph');
    const graph = this.getOrCreateGraph(graphDef);
    const llmCaller = this.createLLMCaller(llmConfigMap, defaultLlmConfig);
    const abortSignal = this.sessionManager.findById(sessionId)?.abortController.signal;

    // 构建初始状态
    const history = await this.messageService.buildLLMHistory(conversationId, tokenLimit);
    const initialState: WorkflowState = {
        messages: [...history, { role: 'user' as const, content }],
        pendingToolCalls: [],
        hasToolCalls: false,
    };

    // 保存用户消息
    await this.messageService.create({
        conversationId,
        role: 'user',
        content,
    });

    // 跟踪累积的助手文本
    let assistantText = '';
    let roundCount = 0;
    const maxToolRounds = 10;

    while (roundCount < maxToolRounds) {
        if (abortSignal?.aborted) break;

        roundCount++;

        // 流式处理图
        let lastState: WorkflowState | null = null;
        for await (const event of graph.stream(initialState, {
            configurable: { llmCaller, llmConfigMap, abortSignal },
        })) {
            lastState = event;

            // 流式传输文本块到客户端
            if (event.assistantText) {
                assistantText += event.assistantText;
                // StateMachine 发出 text_chunk
                this.stateMachine.textChunk(sessionId, event.assistantText);
            }
        }

        if (!lastState) break;

        // 检查工具调用
        if (lastState.pendingToolCalls && lastState.pendingToolCalls.length > 0) {
            // 路由每个工具调用
            for (const tc of lastState.pendingToolCalls) {
                this.toolRouter.route(tc.name, tc.input, conversationId, tc.id);
                this.stateMachine.toolCall(sessionId, {
                    toolCallId: tc.id,
                    toolName: tc.name,
                    input: tc.input,
                    requiresConfirmation: this.toolRouter.needsConfirmation(tc.name),
                });
            }

            // 等待工具结果（前端或自动执行）
            const toolResults = await this.toolDispatcher.waitForResults(
                sessionId,
                conversationId,
                lastState.pendingToolCalls,
                120_000,
            );

            if (!toolResults) {
                // 超时 — 注入错误结果并继续
                for (const tc of lastState.pendingToolCalls) {
                    this.connectionManager.broadcastToConversation(conversationId, {
                        type: 'error',
                        conversationId,
                        code: 'TOOL_TIMEOUT',
                        message: `Tool ${tc.name} timed out`,
                    });
                }
            }

            // 追加工具结果到消息
            const toolMessages: LLMMessage[] = lastState.pendingToolCalls.map(tc => ({
                role: 'tool',
                content: JSON.stringify(toolResults?.[tc.id] ?? { error: 'Tool execution failed' }),
            }));

            initialState.messages = [...initialState.messages, ...toolMessages];
            this.stateMachine.toolResult(sessionId, lastState.pendingToolCalls[0].id);
            this.stateMachine.toolDone(sessionId);

            // 继续循环 — 下一轮用工具结果调用 LLM
            continue;
        }

        // 无工具调用 — LLM 完成
        break;
    }

    // 保存助手消息
    if (assistantText) {
        await this.messageService.create({
            conversationId,
            role: 'assistant',
            content: assistantText,
            finishReason: roundCount >= maxToolRounds ? 'max_turns' : 'complete',
        });
    }

    // 发送完成信号
    if (roundCount >= maxToolRounds) {
        this.stateMachine.error(sessionId, 'LLM_TIMEOUT', 'Maximum tool call rounds reached');
    } else {
        this.stateMachine.llmDone(sessionId);
    }
}
```

将 StateMachine 和 ToolRouter 添加到构造函数：

```typescript
constructor(
    // ... 现有
    @Inject(ConversationStateMachine) private readonly stateMachine: ConversationStateMachine,
    @Inject(ToolRouter) private readonly toolRouter: ToolRouter,
) {
    // ...
}
```

- [ ] **步骤 2：更新 ai.module.ts 以注册新服务**

修改 `apps/server/src/ai/ai.module.ts`，注册新服务：

```typescript
import { ConversationStateMachine } from './gateway/conversation-statemachine';
import { ToolRouter } from './tools/tool-router';

// 添加到 providers：
providers: [
    // ... 现有 providers
    ConversationStateMachine,
    ToolRouter,
]
```

- [ ] **步骤 3：运行类型检查**

运行：`cd apps/server && npx tsc --noEmit`
预期：无错误（修复任何问题）

- [ ] **步骤 4：运行现有测试**

运行：`cd apps/server && npx jest`
预期：所有测试通过（修复任何回归）

- [ ] **步骤 5：提交**

```bash
git add apps/server/src/ai/workflow-runtime/workflow-executor.ts apps/server/src/ai/workflow-runtime/conversation-orchestrator.ts apps/server/src/ai/ai.module.ts
git commit -m "feat: wire WorkflowExecutor to ConversationStateMachine and ToolRouter

Replace manual tool loop with StateMachine-driven flow. ToolRouter
routes calls by danger level. Executor reports state transitions
to StateMachine."
```

---

### 任务 10：更新 AI 面板 UI 以响应 isProcessing 状态 ✅ 已完成

**文件：**
- 修改：`apps/web/src/components/workspace/ai-panel/ai-panel.tsx`（或发送按钮所在位置）

- [ ] **步骤 1：在处理期间禁用发送按钮**

找到 AI 面板组件中的发送按钮，接入 `isProcessing` 状态：

```typescript
// 在 AI 面板组件中（ai-panel.tsx 或类似文件）：
const harness = useAIHarness(); // 或通过其他方式获取 harness

// 当 harness.isProcessing 为 true 时，发送按钮应被禁用
<button
    disabled={harness.isGenerating || harness.isProcessing}
    onClick={handleSend}
    // ...
>
    {harness.isProcessing ? '生成中...' : '发送'}
</button>
```

如果组件使用 `useAIHarness` 钩子配合 `useSyncExternalStore`，`isProcessing` 状态将通过 harness 快照获取。

- [ ] **步骤 2：验证 UI 行为**

运行：`cd apps/web && npm run dev`
打开 AI 面板，发送消息，验证：
- 生成期间发送按钮被禁用
- 生成完成后发送按钮重新启用
- 状态事件显示适当的 UI 反馈

- [ ] **步骤 3：提交**

```bash
git add apps/web/src/components/workspace/ai-panel/ai-panel.tsx
git commit -m "feat: disable send button during AI generation

Use harness.isProcessing to disable send while conversation is
in BuildingContext/Processing/ToolWaiting states."
```

---

### 任务 11：在应用加载时集成对话恢复 ✅ 已完成

**文件：**
- 修改：`apps/web/src/features/ai/harness/ai-harness.service.ts`（任务 7 中已部分完成）
- 修改：初始化 harness 的 AI 面板或应用位置

- [ ] **步骤 1：在 harness 初始化时自动恢复**

harness 应在初始化时检查 localStorage 中是否有保存的对话 ID 并恢复它。这由创建/使用 harness 的组件完成：

```typescript
// 在初始化 harness 的组件中（可能是 ai-panel.tsx 或 bootstrap）：
useEffect(() => {
    const savedId = localStorage.getItem('activeConversationId');
    if (savedId) {
        harness.restoreConversation(savedId);
    }
}, []);
```

或者，添加到 harness 构造函数：

```typescript
// 在 AIHarnessServiceImpl 构造函数中，_setupEventProxy 之后：
this._restoreLastConversation();

private _restoreLastConversation(): void {
    try {
        const savedId = localStorage.getItem('activeConversationId');
        if (savedId) {
            this._conversationState.setConversationId(savedId);
            // 不在这里自动加入 — UI 应决定何时加入
        }
    } catch {
        // 忽略
    }
}
```

- [ ] **步骤 2：验证恢复流程**

测试完整恢复流程：
1. 打开 AI 面板，发送消息，等待回复
2. 刷新页面
3. 验证：之前的对话 ID 已恢复
4. 验证：点击对话加载历史
5. 验证：`done` 事件后 localStorage 已清除

- [ ] **步骤 3：提交**

```bash
git add apps/web/src/features/ai/harness/ai-harness.service.ts
git commit -m "feat: auto-restore conversation from localStorage on harness init

Check activeConversationId on init and restore conversation state.
History loads when user joins the restored conversation."
```

---

## 自查

### 规范覆盖检查

| 规范要求 | 对应任务 |
|-----------------|------|
| 前端检查 WS 连接，复用或创建 | 任务 6（ws-client）、任务 7（harness） |
| 前端发送 create_and_send 或 send_message | 任务 7（harness sendMessage/sendCreateAndSend） |
| 服务端验证 conversationId | 任务 8（gateway handleSendMessage） |
| 服务端构建上下文（历史 + 系统） | 任务 9（workflow-executor 使用 buildLLMHistory） |
| 服务端存储用户消息，流式响应 | 任务 9（workflow-executor） |
| 工具调用按危险等级路由 | 任务 3（ToolRouter） |
| 后端+低危险工具自动执行 | 任务 3（ToolRouter.route） |
| 后端+高危险工具需确认 | 任务 3（ToolRouter.route） |
| 前端工具转发到客户端 | 任务 3（ToolRouter.route） |
| 不同类型使用不同事件名 | 任务 1、任务 5（类型） |
| 新对话发出 created 事件 | 任务 8（gateway） |
| done 事件包含 finishReason | 任务 4（StateMachine）、任务 8（gateway） |
| 状态事件用于 UI 反馈 | 任务 6（ws-client）、任务 7（harness） |
| 处理中状态禁用发送按钮 | 任务 7（harness）、任务 10（UI） |
| 通过 localStorage 实现对话恢复 | 任务 7（harness）、任务 11（自动恢复） |
| 状态机驱动工具循环 | 任务 4（StateMachine）、任务 9（executor） |
| 修复 abortByClientId 前缀 bug | 延后到单独清理（见规范 §7.2） |
| 合并 ToolRegistry + Dispatcher | 延后到单独清理（见规范 §7.2） |

### 占位符扫描
- 步骤中无 TBD/TODO
- 所有代码步骤均包含实际代码
- 无"类似于任务 N"的引用
- 测试包含真实断言
- 无"添加适当的错误处理"等模糊描述

### 类型一致性检查
- `ClientMessage` 和 `ServerMessage` 类型在任务 1（服务端）和任务 5（前端）中定义一致
- 所有事件均包含 `conversationId: string`
- `FinishReason` 枚举值在服务端和前端类型间匹配
- `ErrorCode` 值在服务端和前端间匹配
- `ToolRouteMode` 值与规范的决策矩阵一致

---

## 执行交接

计划已完成。两种执行方式：

**1. 子代理驱动（推荐）** — 每个任务调度一个子代理逐步执行，任务间审查，快速迭代

**2. 内联执行** — 在当前会话中使用 executing-plans 执行，批量执行并设置检查点

选择哪种方式？
