# Trace Context Ownership Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate global mutable trace state from TracingService, move trace context ownership to the consumer (useLangGraphStream hook), and add thread-level traceId correlation so all messages in a conversation share one trace.

**Architecture:** TracingService becomes a stateless span factory. TraceContext is an immutable value object created from a span and passed explicitly through the call chain. Each useLangGraphStream instance creates its own LangGraph Client with a withTraceparent middleware closure. Thread-level traceId is stored in a Map<threadId, traceId> ref.

**Tech Stack:** React 19, TypeScript, @langchain/langgraph-sdk, Vitest, pnpm monorepo

---

## File Structure

- Modify: `apps/web/src/platform/tracing/types.ts` — Add TraceContext, add toTraceContext to ITracingService, remove setActiveTraceparent/getActiveTraceparent
- Modify: `apps/web/src/platform/tracing/service.ts` — Implement toTraceContext, remove activeTraceparent field and methods
- Modify: `apps/web/src/platform/tracing/index.ts` — Export TraceContext type
- Modify: `apps/web/src/features/ai/sdk/langgraph-client.ts` — Add withTraceparent + createLangGraphClient, remove createLangGraphRequestHook, bare langgraphClient singleton
- Modify: `apps/web/src/features/ai/tools/frontend-tool-executor.ts` — Accept traceContext in dispatch options, remove parseTraceparent
- Modify: `apps/web/src/hooks/use-langgraph-stream.ts` — Per-instance client, thread-level traceId, return traceContext
- Modify: `apps/web/src/components/workspace/ai-panel/ai-panel.tsx` — Pass traceContext to toolExecutor.dispatch
- Modify: `apps/web/src/platform/tracing/__tests__/service.test.ts` — Update tests
- Modify: `apps/web/src/features/ai/sdk/__tests__/langgraph-client.test.ts` — Rewrite tests
- Modify: `apps/web/src/features/ai/tools/__tests__/frontend-tool-executor.test.ts` — Update mock and assertions

---

## Task 1: Add TraceContext value object and toTraceContext method

**Files:**
- Modify: `apps/web/src/platform/tracing/types.ts`
- Modify: `apps/web/src/platform/tracing/service.ts`
- Modify: `apps/web/src/platform/tracing/index.ts`
- Test: `apps/web/src/platform/tracing/__tests__/service.test.ts`

- [ ] **Step 1: Write the failing test for toTraceContext**

Add to `apps/web/src/platform/tracing/__tests__/service.test.ts`, after the `formats W3C traceparent values` test:

```typescript
    it('creates immutable TraceContext snapshot from a span', () => {
        const span = service.startSpan('frontend.test');
        const ctx = service.toTraceContext(span);

        expect(ctx.traceId).toBe(span.traceId);
        expect(ctx.spanId).toBe(span.spanId);
        expect(ctx.traceparent).toBe(
            `00-${span.traceId}-${span.spanId}-01`,
        );
    });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @my-km/web test -- service.test.ts`
Expected: FAIL — `service.toTraceContext is not a function`

- [ ] **Step 3: Add TraceContext interface to types.ts**

In `apps/web/src/platform/tracing/types.ts`, add after the `SpanOptions` interface:

```typescript
export interface TraceContext {
    readonly traceId: string;
    readonly spanId: string;
    readonly traceparent: string;
}
```

Add `toTraceContext(span: ActiveSpanLike): TraceContext` to the `ITracingService` interface, after `getTraceparent`:

```typescript
export interface ITracingService {
    startSpan(name: string, options?: SpanOptions): ActiveSpanLike;
    endSpan(span: ActiveSpanLike): SpanData;
    getTraceparent(traceId: string, spanId: string): string;
    toTraceContext(span: ActiveSpanLike): TraceContext;
    setActiveTraceparent(traceparent: string | null): void;
    getActiveTraceparent(): string | null;
    forceFlush(): void;
}
```

- [ ] **Step 4: Implement toTraceContext in service.ts**

In `apps/web/src/platform/tracing/service.ts`, add the import for `TraceContext`:

```typescript
import type { ITracingService, SpanData, SpanEvent, SpanLink, SpanOptions, TraceContext } from './types';
```

Add the method to `TracingService` class, after `getTraceparent`:

```typescript
    toTraceContext(span: ActiveSpan): TraceContext {
        return {
            traceId: span.traceId,
            spanId: span.spanId,
            traceparent: this.getTraceparent(span.traceId, span.spanId),
        };
    }
```

- [ ] **Step 5: Export TraceContext from index.ts**

In `apps/web/src/platform/tracing/index.ts`, add `TraceContext` to the type exports:

```typescript
export type {
    ActiveSpanLike,
    ITracingService,
    SpanData,
    SpanEvent,
    SpanLink,
    SpanOptions,
    TraceContext,
} from './types';
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm --filter @my-km/web test -- service.test.ts`
Expected: PASS — all tests including the new `toTraceContext` test

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/platform/tracing/types.ts apps/web/src/platform/tracing/service.ts apps/web/src/platform/tracing/index.ts apps/web/src/platform/tracing/__tests__/service.test.ts
git commit -m "feat(tracing): add TraceContext value object and toTraceContext method"
```

---

## Task 2: Add withTraceparent middleware and createLangGraphClient factory

**Files:**
- Modify: `apps/web/src/features/ai/sdk/langgraph-client.ts`
- Test: `apps/web/src/features/ai/sdk/__tests__/langgraph-client.test.ts`

- [ ] **Step 1: Write failing tests for withTraceparent**

Replace the entire contents of `apps/web/src/features/ai/sdk/__tests__/langgraph-client.test.ts` with:

```typescript
import { describe, expect, it } from 'vitest';
import { createLangGraphClient, withTraceparent } from '../langgraph-client';

describe('withTraceparent', () => {
    it('injects traceparent header when getter returns a value', () => {
        const middleware = withTraceparent(
            () => '00-0123456789abcdef0123456789abcdef-0123456789abcdef-01',
        );

        const init = middleware(
            new URL('http://localhost:3000/api/threads/t1/runs/stream'),
            { headers: { 'content-type': 'application/json' } },
        );

        expect(new Headers(init.headers).get('traceparent')).toBe(
            '00-0123456789abcdef0123456789abcdef-0123456789abcdef-01',
        );
    });

    it('passes through unchanged when getter returns null', () => {
        const middleware = withTraceparent(() => null);

        const init = middleware(
            new URL('http://localhost:3000/api/threads/t1/runs/stream'),
            { headers: { 'content-type': 'application/json' } },
        );

        expect(new Headers(init.headers).has('traceparent')).toBe(false);
    });
});

describe('createLangGraphClient', () => {
    it('creates a client with onRequest hook', () => {
        const client = createLangGraphClient({
            onRequest: withTraceparent(
                () => '00-abc-def-01',
            ),
        });

        expect(client).toBeDefined();
    });

    it('creates a bare client without onRequest', () => {
        const client = createLangGraphClient();
        expect(client).toBeDefined();
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @my-km/web test -- langgraph-client.test.ts`
Expected: FAIL — `withTraceparent` and `createLangGraphClient` are not exported

- [ ] **Step 3: Implement withTraceparent and createLangGraphClient**

Replace the entire contents of `apps/web/src/features/ai/sdk/langgraph-client.ts` with:

```typescript
/**
 * LangGraph SDK Client
 *
 * 初始化 @langchain/langgraph-sdk 的 Client，连接后端 LangGraph 协议兼容 API。
 *
 * 后端 routes（注册在 /api 全局前缀下）：
 *   POST   /api/threads
 *   POST   /api/threads/search
 *   GET    /api/threads/:id
 *   PATCH  /api/threads/:id
 *   DELETE /api/threads/:id
 *   GET    /api/threads/:id/state
 *   POST   /api/threads/:id/runs/stream
 *   POST   /api/threads/:id/runs/:rid/cancel
 *
 * SDK Client 通过 apiUrl 配置基地址，自动拼接上述路径。
 */

import { Client } from '@langchain/langgraph-sdk';

const API_URL = process.env.NEXT_PUBLIC_LANGGRAPH_API_URL ?? 'http://localhost:3000/api';

type RequestHook = (url: URL, init: RequestInit) => RequestInit;

/**
 * Traceparent 注入中间件。
 * 从 getter 获取当前 traceparent，注入到请求 header。
 */
export function withTraceparent(getTraceparent: () => string | null): RequestHook {
    return (_url, init) => {
        const tp = getTraceparent();
        if (!tp) return init;
        const headers = new Headers(init.headers);
        headers.set('traceparent', tp);
        return { ...init, headers };
    };
}

/**
 * 创建 LangGraph Client 实例。
 * @param options.onRequest 可选的请求拦截 hook（用于注入 traceparent 等）
 */
export function createLangGraphClient(options?: { onRequest?: RequestHook }): Client {
    return new Client({
        apiUrl: API_URL,
        ...(options?.onRequest ? { onRequest: options.onRequest } : {}),
    });
}

/**
 * 全局裸单例 Client（供 thread CRUD 等无需 traceparent 的操作）。
 */
export const langgraphClient = createLangGraphClient();

/**
 * 当前 LangGraph API URL
 */
export const LANGGRAPH_API_URL = API_URL;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @my-km/web test -- langgraph-client.test.ts`
Expected: PASS — all 4 tests pass

- [ ] **Step 5: Verify type-check still works (expect errors in use-langgraph-stream.ts)**

Run: `pnpm --filter @my-km/web type-check 2>&1 | head -20`
Expected: Errors in `use-langgraph-stream.ts` and `frontend-tool-executor.ts` because `createLangGraphRequestHook` was removed and `getActiveTraceparent` usage — these will be fixed in Tasks 3-5.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/ai/sdk/langgraph-client.ts apps/web/src/features/ai/sdk/__tests__/langgraph-client.test.ts
git commit -m "feat(tracing): add withTraceparent middleware and createLangGraphClient factory"
```

---

## Task 3: FrontendToolExecutor — accept traceContext from dispatch options

**Files:**
- Modify: `apps/web/src/features/ai/tools/frontend-tool-executor.ts`
- Test: `apps/web/src/features/ai/tools/__tests__/frontend-tool-executor.test.ts`

- [ ] **Step 1: Write the failing test for traceContext-based span creation**

In `apps/web/src/features/ai/tools/__tests__/frontend-tool-executor.test.ts`, replace the test `'工具执行 span 应继承 trace 并记录 tool_call 状态'` (lines 47-131) with:

```typescript
    it('工具执行 span 应从传入的 traceContext 继承 trace', async () => {
        const endedSpans: Array<{
            traceId: string;
            parentSpanId?: string;
            attributes: Record<string, unknown>;
            events: Array<{ name: string; attributes?: Record<string, unknown> }>;
        }> = [];
        const tracer = {
            startSpan: vi.fn(
                (
                    _name: string,
                    options?: {
                        traceId?: string;
                        parentSpanId?: string;
                        attributes?: Record<string, unknown>;
                    },
                ) => {
                    const span = {
                        traceId: options?.traceId ?? 'generated-trace',
                        spanId: 'tool-span-1',
                        parentSpanId: options?.parentSpanId,
                        attributes: { ...(options?.attributes ?? {}) },
                        events: [] as Array<{ name: string; attributes?: Record<string, unknown> }>,
                        setAttribute(key: string, value: unknown) {
                            this.attributes[key] = value;
                            return this;
                        },
                        addEvent(name: string, attributes?: Record<string, unknown>) {
                            this.events.push({ name, attributes });
                            return this;
                        },
                        setError(message: string) {
                            this.attributes['tool.error'] = message;
                            return this;
                        },
                        end() {
                            return {
                                spanId: this.spanId,
                                traceId: this.traceId,
                                parentSpanId: this.parentSpanId,
                                name: 'frontend.tool.execute',
                                kind: 'INTERNAL',
                                serviceName: 'test',
                                startTime: new Date().toISOString(),
                                attributes: this.attributes,
                                events: [],
                            };
                        },
                        toData() {
                            return this.end();
                        },
                    };
                    return span;
                },
            ),
            endSpan: vi.fn(span => {
                endedSpans.push(span);
                return span.toData();
            }),
        };
        executor = new FrontendToolExecutor('bypass', tracer);
        const handler = makeHandler('read-tool', 'read', { success: true });
        executor.register(handler);

        await executor.dispatch('read-tool', { foo: 1 }, {
            toolCallId: 'tc-1',
            traceContext: {
                traceId: 'aabbccdd'.repeat(4),
                spanId: '0123456789abcdef',
                traceparent: '00-aabbccddaabbccddaabbccddaabbccdd-0123456789abcdef-01',
            },
        });

        expect(tracer.startSpan).toHaveBeenCalledWith('frontend.tool.execute', {
            traceId: 'aabbccdd'.repeat(4),
            parentSpanId: '0123456789abcdef',
            attributes: {
                'tool.name': 'read-tool',
                'tool.type': 'read',
                'tool.call_id': 'tc-1',
                'tool.status': 'running',
            },
        });
        expect(endedSpans[0].attributes['tool.status']).toBe('success');
        expect(endedSpans[0].events.map(e => e.name)).toEqual([
            'tool.execution_started',
            'tool.execution_completed',
        ]);
    });

    it('traceContext 缺失时仍能创建 span（traceId 自动生成）', async () => {
        const tracer = {
            startSpan: vi.fn((_name: string, options?: { traceId?: string }) => ({
                traceId: options?.traceId ?? 'auto-generated',
                spanId: 'span-1',
                attributes: {} as Record<string, unknown>,
                events: [] as Array<{ name: string }>,
                setAttribute() { return this; },
                addEvent() { return this; },
                setError() { return this; },
                end() { return this; },
                toData() { return this; },
            })),
            endSpan: vi.fn(),
        };
        executor = new FrontendToolExecutor('bypass', tracer);
        executor.register(makeHandler('read-tool', 'read'));

        await executor.dispatch('read-tool', {}, {});

        expect(tracer.startSpan).toHaveBeenCalledWith('frontend.tool.execute', {
            traceId: undefined,
            parentSpanId: undefined,
            attributes: {
                'tool.name': 'read-tool',
                'tool.type': 'read',
                'tool.status': 'running',
            },
        });
    });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @my-km/web test -- frontend-tool-executor.test.ts`
Expected: FAIL — `traceContext` property not accepted in dispatch options, and tracer mock no longer has `getActiveTraceparent`

- [ ] **Step 3: Update ToolDispatchOptions and ToolTracingService**

In `apps/web/src/features/ai/tools/frontend-tool-executor.ts`:

Update imports — add `TraceContext`:

```typescript
import type { ITracingService, SpanOptions, TraceContext } from '@/platform/tracing/types';
```

Update `ToolDispatchOptions`:

```typescript
export interface ToolDispatchOptions {
    toolCallId?: string;
    traceContext?: TraceContext;
}
```

Update `ToolTracingService` — remove `getActiveTraceparent`:

```typescript
export interface ToolTracingService
    extends Pick<ITracingService, 'startSpan' | 'endSpan'> {}
```

- [ ] **Step 4: Update dispatch() to use traceContext from options**

In `apps/web/src/features/ai/tools/frontend-tool-executor.ts`, replace the `dispatch` method body (from `const handler = ...` through the end of the method) with:

```typescript
    async dispatch(
        toolName: string,
        input: Record<string, unknown>,
        options?: ToolDispatchOptions,
    ): Promise<ToolResult> {
        const handler = this.handlers.get(toolName);
        if (!handler) {
            return { success: false, error: `Unknown tool: ${toolName}` };
        }

        const tracer = this.tracer ?? getContainer().get(TracingService);
        const spanOptions: SpanOptions = {
            traceId: options?.traceContext?.traceId,
            parentSpanId: options?.traceContext?.spanId,
            attributes: {
                'tool.name': toolName,
                'tool.type': handler.type,
                'tool.status': 'running',
            },
        };
        if (options?.toolCallId) {
            spanOptions.attributes = {
                ...spanOptions.attributes,
                'tool.call_id': options.toolCallId,
            };
        }
        const toolSpan = tracer.startSpan('frontend.tool.execute', spanOptions);
        toolSpan.addEvent('tool.execution_started');

        try {
            if (handler.type === 'write' || this.strategy.needsConfirmation(toolName, input)) {
                const approved = await this.requestConfirmation(handler, input);
                if (!approved) {
                    toolSpan.setAttribute('tool.status', 'rejected');
                    toolSpan.setError('User rejected the operation');
                    tracer.endSpan(toolSpan);
                    return { success: false, error: 'User rejected the operation' };
                }
            }

            const result = await handler.execute(input);
            if (!result.success) {
                toolSpan.setAttribute('tool.status', 'error');
                toolSpan.setError(result.error ?? 'Tool execution failed');
            } else {
                toolSpan.setAttribute('tool.status', 'success');
            }
            toolSpan.addEvent('tool.execution_completed');
            tracer.endSpan(toolSpan);
            return result;
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            toolSpan.setAttribute('tool.status', 'error');
            toolSpan.setError(message);
            tracer.endSpan(toolSpan);
            return {
                success: false,
                error: message,
            };
        }
    }
```

- [ ] **Step 5: Delete parseTraceparent function**

Delete the entire `parseTraceparent` function at the bottom of `apps/web/src/features/ai/tools/frontend-tool-executor.ts` (the `function parseTraceparent(...)` block).

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm --filter @my-km/web test -- frontend-tool-executor.test.ts`
Expected: PASS — all tests pass including the two new traceContext tests

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/features/ai/tools/frontend-tool-executor.ts apps/web/src/features/ai/tools/__tests__/frontend-tool-executor.test.ts
git commit -m "refactor(tracing): FrontendToolExecutor accepts traceContext from dispatch options"
```

---

## Task 4: useLangGraphStream — per-instance client, thread-level traceId, return traceContext

**Files:**
- Modify: `apps/web/src/hooks/use-langgraph-stream.ts`

- [ ] **Step 1: Update imports**

In `apps/web/src/hooks/use-langgraph-stream.ts`, replace the import on line 18:

```typescript
import { langgraphClient } from '@/features/ai/sdk/langgraph-client';
```

with:

```typescript
import { createLangGraphClient, withTraceparent } from '@/features/ai/sdk/langgraph-client';
```

And add `TraceContext` to the tracing import (line 20):

```typescript
import { type ActiveSpan, TracingService, type TraceContext } from '@/platform/tracing';
```

- [ ] **Step 2: Add threadTraceIds, pendingTraceId, and traceparentRef refs**

Inside `useLangGraphStream()`, after the existing refs (after `seenInterruptToolCallIds`), add:

```typescript
    const threadTraceIds = useRef<Map<string, string>>(new Map());
    const pendingTraceId = useRef<string | null>(null);
    const traceparentRef = useRef<string | null>(null);
```

> **Why pendingTraceId:** On the first message, `threadId` is `null` because the thread hasn't been created yet. The backend creates the thread during `stream.submit()` and returns the ID via `onThreadId`. We store the traceId in `pendingTraceId` temporarily, then persist it to `threadTraceIds` when `onThreadId` fires.

- [ ] **Step 3: Create per-instance client**

Inside `useLangGraphStream()`, before the `const stream = useStream(...)` call, add:

```typescript
    const client = useMemo(
        () => createLangGraphClient({
            onRequest: withTraceparent(() => traceparentRef.current),
        }),
        [],
    );
```

- [ ] **Step 4: Replace langgraphClient with per-instance client in useStream**

In the `useStream` call, change `client: langgraphClient` to `client`, and update `onThreadId` to persist pending traceId:

```typescript
    const stream = useStream<{ messages: Message[] }>({
        client,
        assistantId: 'default',
        threadId,
        messagesKey: 'messages',
        onThreadId: id => {
            // Persist pending traceId when the thread is first created
            if (pendingTraceId.current && !threadTraceIds.current.has(id)) {
                threadTraceIds.current.set(id, pendingTraceId.current);
                pendingTraceId.current = null;
            }
            activeTraceSpan.current?.addEvent('metadata_received', { threadId: id });
            setThreadId(id);
        },
        onCreated: info => {
            activeTraceSpan.current?.addEvent('metadata_received', { runId: info.run_id ?? null });
            setRunId(info.run_id ?? null);
        },
    });
```

- [ ] **Step 5: Update sendMessage to use thread-level traceId**

Replace the entire `sendMessage` callback with:

```typescript
    const sendMessage = useCallback(
        async (content: string, context?: Record<string, unknown>) => {
            const tracer = getContainer().get(TracingService);

            // 查找已有的 thread 级 traceId（首条消息时 threadId 可能为 null）
            const existingTraceId = threadId
                ? threadTraceIds.current.get(threadId)
                : undefined;

            // 创建 root span — 复用 traceId 或自动生成
            const rootSpan = tracer.startSpan('frontend.chat.sendMessage', {
                ...(existingTraceId ? { traceId: existingTraceId } : {}),
                attributes: {
                    'chat.messageLength': content.length,
                },
            });
            activeTraceSpan.current = rootSpan;
            activeTraceId.current = rootSpan.traceId;

            // 持久化 traceId：thread 已知时直接存入 map，否则暂存待 onThreadId 回调
            if (threadId) {
                if (!threadTraceIds.current.has(threadId)) {
                    threadTraceIds.current.set(threadId, rootSpan.traceId);
                }
            } else {
                pendingTraceId.current = rootSpan.traceId;
            }

            traceparentRef.current = tracer.getTraceparent(rootSpan.traceId, rootSpan.spanId);
            rootSpan.addEvent('request_submitted', {
                messageLength: content.length,
                hasContext: Boolean(context && Object.keys(context).length > 0),
            });

            await stream.submit(
                {
                    messages: [
                        {
                            type: 'human',
                            content,
                        } as Message,
                    ],
                },
                {
                    context: context as never,
                    metadata: { __trace: { traceId: rootSpan.traceId } },
                },
            );
        },
        [stream, threadId],
    );
```

- [ ] **Step 6: Update resumeWithToolResult**

Replace the `resumeWithToolResult` callback with:

```typescript
    const resumeWithToolResult = useCallback(
        async (toolCallId: string, result: unknown) => {
            const tracer = getContainer().get(TracingService);

            const traceId = (threadId && threadTraceIds.current.get(threadId))
                ?? activeTraceId.current
                ?? undefined;

            const resumeSpan = tracer.startSpan('POST /runs/resume', {
                ...(traceId ? { traceId } : {}),
                parentSpanId: activeTraceSpan.current?.spanId,
                attributes: {
                    'tool.call_id': toolCallId,
                },
            });
            traceparentRef.current = tracer.getTraceparent(resumeSpan.traceId, resumeSpan.spanId);

            await stream.submit(null, {
                command: {
                    resume: {
                        tool_call_id: toolCallId,
                        tool_result: result,
                    },
                },
            });

            tracer.endSpan(resumeSpan);
        },
        [stream, threadId],
    );
```

- [ ] **Step 7: Update stream-end effect**

Replace the stream-end `useEffect` with:

```typescript
    // 结束 trace span 当 stream 结束时
    useEffect(() => {
        if (!stream.isLoading && activeTraceSpan.current) {
            const tracer = getContainer().get(TracingService);
            if (stream.error) {
                activeTraceSpan.current.setError(String(stream.error));
            }
            activeTraceSpan.current.addEvent('stream_ended', {
                hasError: Boolean(stream.error),
            });
            tracer.endSpan(activeTraceSpan.current);
            traceparentRef.current = null;
            tracer.forceFlush();
            activeTraceSpan.current = null;
            hasSeenFirstMessageChunk.current = false;
            seenMessageToolCallIds.current.clear();
            seenInterruptToolCallIds.current.clear();
        }
    }, [stream.isLoading, stream.error]);
```

- [ ] **Step 8: Compute traceContext and add to return value**

Before the final `return useMemo(...)`, add:

```typescript
    const traceContext: TraceContext | null = activeTraceSpan.current
        ? getContainer().get(TracingService).toTraceContext(activeTraceSpan.current)
        : null;
```

In the `return useMemo(...)`, add `traceContext` to the returned object and the dependency array:

```typescript
    return useMemo(
        () => ({
            messages,
            isStreaming: stream.isLoading,
            isLastMessageStreaming,
            error: stream.error ? String(stream.error) : null,
            threadId,
            runId,
            interrupt,
            traceContext,
            sendMessage,
            resumeWithToolResult,
            stop,
        }),
        [
            messages,
            stream.isLoading,
            isLastMessageStreaming,
            stream.error,
            threadId,
            runId,
            interrupt,
            traceContext,
            sendMessage,
            resumeWithToolResult,
            stop,
        ],
    );
```

- [ ] **Step 9: Add traceContext to UseLangGraphStreamReturn interface**

In the `UseLangGraphStreamReturn` interface, add `traceContext`:

```typescript
export interface UseLangGraphStreamReturn {
    messages: ChatMessage[];
    isStreaming: boolean;
    /** AI 正在流式生成（最后一条消息仍在追加 token） */
    isLastMessageStreaming: boolean;
    error: string | null;
    threadId: string | null;
    runId: string | null;
    interrupt: ToolInterrupt | null;
    /** 当前活跃 trace 上下文（供下游消费者创建子 span） */
    traceContext: TraceContext | null;
    sendMessage: (content: string, context?: Record<string, unknown>) => Promise<void>;
    resumeWithToolResult: (toolCallId: string, result: unknown) => Promise<void>;
    stop: () => Promise<void>;
}
```

- [ ] **Step 10: Run type-check to verify compilation**

Run: `pnpm --filter @my-km/web type-check`
Expected: PASS for use-langgraph-stream.ts. Errors may remain in ai-panel.tsx (fixed in Task 5).

- [ ] **Step 11: Run existing tests**

Run: `pnpm --filter @my-km/web test -- use-langgraph-stream.test.ts`
Expected: PASS — existing pure function tests still pass

- [ ] **Step 12: Commit**

```bash
git add apps/web/src/hooks/use-langgraph-stream.ts
git commit -m "refactor(tracing): useLangGraphStream owns trace context with per-instance client and thread-level traceId"
```

---

## Task 5: AIPanel — pass traceContext to toolExecutor.dispatch

**Files:**
- Modify: `apps/web/src/components/workspace/ai-panel/ai-panel.tsx`

- [ ] **Step 1: Destructure traceContext from useLangGraphStream**

In `apps/web/src/components/workspace/ai-panel/ai-panel.tsx`, update the destructuring (around line 51) to include `traceContext`:

```typescript
    const {
        messages,
        isStreaming,
        isLastMessageStreaming,
        error,
        threadId,
        interrupt,
        traceContext,
        sendMessage,
        resumeWithToolResult,
        stop,
    } = useLangGraphStream();
```

- [ ] **Step 2: Pass traceContext to toolExecutor.dispatch**

Update the interrupt dispatch `useEffect` (around line 96) to pass `traceContext`:

```typescript
    useEffect(() => {
        if (!interrupt) return;
        let cancelled = false;
        toolExecutor
            .dispatch(interrupt.toolName, interrupt.input, {
                toolCallId: interrupt.toolCallId,
                traceContext: traceContext ?? undefined,
            })
            .then(result => {
                if (cancelled) return;
                resumeWithToolResult(interrupt.toolCallId, result);
            });
        return () => {
            cancelled = true;
        };
    }, [interrupt, toolExecutor, resumeWithToolResult, traceContext]);
```

- [ ] **Step 3: Run type-check to verify full compilation**

Run: `pnpm --filter @my-km/web type-check`
Expected: PASS — no errors

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/workspace/ai-panel/ai-panel.tsx
git commit -m "refactor(tracing): AIPanel passes traceContext to toolExecutor"
```

---

## Task 6: Remove old tracing state from TracingService

**Files:**
- Modify: `apps/web/src/platform/tracing/types.ts`
- Modify: `apps/web/src/platform/tracing/service.ts`
- Test: `apps/web/src/platform/tracing/__tests__/service.test.ts`

- [ ] **Step 1: Remove old test**

In `apps/web/src/platform/tracing/__tests__/service.test.ts`, delete the test `'stores and clears active traceparent'` (the entire `it(...)` block, lines 58-66).

- [ ] **Step 2: Run test to verify no old state tests remain**

Run: `pnpm --filter @my-km/web test -- service.test.ts`
Expected: PASS — all remaining tests pass

- [ ] **Step 3: Remove setActiveTraceparent and getActiveTraceparent from ITracingService**

In `apps/web/src/platform/tracing/types.ts`, remove these two lines from `ITracingService`:

```typescript
    setActiveTraceparent(traceparent: string | null): void;
    getActiveTraceparent(): string | null;
```

The final `ITracingService` should be:

```typescript
export interface ITracingService {
    startSpan(name: string, options?: SpanOptions): ActiveSpanLike;
    endSpan(span: ActiveSpanLike): SpanData;
    getTraceparent(traceId: string, spanId: string): string;
    toTraceContext(span: ActiveSpanLike): TraceContext;
    forceFlush(): void;
}
```

- [ ] **Step 4: Remove state field and methods from TracingService**

In `apps/web/src/platform/tracing/service.ts`:

Remove the field (around line 143):

```typescript
    private activeTraceparent: string | null = null;
```

Remove the two methods (around lines 174-180):

```typescript
    setActiveTraceparent(traceparent: string | null): void {
        this.activeTraceparent = traceparent;
    }

    getActiveTraceparent(): string | null {
        return this.activeTraceparent;
    }
```

- [ ] **Step 5: Run type-check to verify no consumers reference removed methods**

Run: `pnpm --filter @my-km/web type-check`
Expected: PASS — no errors (all consumers were updated in Tasks 2-5)

- [ ] **Step 6: Run all tracing-related tests**

Run: `pnpm --filter @my-km/web test -- service.test.ts langgraph-client.test.ts frontend-tool-executor.test.ts use-langgraph-stream.test.ts`
Expected: PASS — all tests pass

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/platform/tracing/types.ts apps/web/src/platform/tracing/service.ts apps/web/src/platform/tracing/__tests__/service.test.ts
git commit -m "refactor(tracing): remove global activeTraceparent state from TracingService"
```

---

## Task 7: Final verification

**Files:**
- No code changes unless verification reveals issues.

- [ ] **Step 1: Run full web type-check**

Run: `pnpm --filter @my-km/web type-check`
Expected: PASS

- [ ] **Step 2: Run full web test suite**

Run: `pnpm --filter @my-km/web test`
Expected: PASS (or only pre-existing unrelated failures)

- [ ] **Step 3: Run lint**

Run: `pnpm --filter @my-km/web lint 2>/dev/null || pnpm lint`
Expected: PASS (or only pre-existing unrelated warnings)

- [ ] **Step 4: Verify no dangling references**

Run: `grep -r "setActiveTraceparent\|getActiveTraceparent\|createLangGraphRequestHook\|parseTraceparent\|activeTraceparent" apps/web/src/ --include="*.ts" --include="*.tsx"`

Expected: No matches (all references removed)

- [ ] **Step 5: Manual acceptance test**

Start dev stack, send two messages in one conversation, then check traces:

1. Both messages share the same `traceId` (thread-level correlation)
2. `frontend.chat.sendMessage` spans are siblings under the same trace
3. Backend spans (`langgraph.run`, `llm_node.invoke`) are children of the corresponding message span
4. `frontend.tool.execute` spans link to the correct parent via `traceContext`
5. Trace UI shows the full conversation as one unified trace
