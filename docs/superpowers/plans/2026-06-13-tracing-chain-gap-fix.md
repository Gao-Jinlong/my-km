# Tracing Chain Gap Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the current chat trace show backend LLM execution, stream lifecycle, and frontend receive/render handling in one trace.

**Architecture:** Fix backend OTel initialization order with a bootstrap entrypoint, then add low-cardinality span events around LangGraph streaming and frontend stream state transitions. Keep `frontend.chat.sendMessage` as the browser root span and avoid one span per token.

**Tech Stack:** NestJS 11, OpenTelemetry Node SDK, LangGraph SDK, React 19, Vitest/Jest, pnpm

---

## File Structure

- Modify: `apps/server/src/main.ts` — export `bootstrap()` and remove direct tracing initialization.
- Create: `apps/server/src/bootstrap.ts` — load env, initialize tracing, then start Nest app.
- Modify: `apps/server/package.json` — run `dist/bootstrap` in production and `src/bootstrap` in dev if supported by Nest CLI entryFile.
- Modify: `apps/server/src/ai/ai.service.ts` — add `langgraph.run` stream lifecycle events.
- Modify: `apps/server/src/tracing/instrumentations/llm-node.span.ts` — improve usage/error events.
- Modify: `apps/web/src/hooks/use-langgraph-stream.ts` — add frontend receive/render events and force flush on completion.
- Modify/Test: existing server Jest tests and web tracing tests where practical.

---

## Task 1: Backend tracing bootstrap order

**Files:**
- Modify: `apps/server/src/main.ts`
- Create: `apps/server/src/bootstrap.ts`
- Modify: `apps/server/package.json`

- [ ] **Step 1: Implement bootstrap split**

Create `apps/server/src/bootstrap.ts`:

```typescript
import './config/load-env';
import { initTracing } from './tracing/tracing.init';

initTracing(() => {
    const { PrismaClient, PrismaPg } = require('@my-km/prisma') as typeof import('@my-km/prisma');
    return new PrismaClient({
        adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
    });
});

void import('./main').then(({ bootstrap }) => bootstrap());
```

Update `apps/server/src/main.ts`:

```typescript
// remove: import './config/load-env';
// remove: import { initTracing } from './tracing/tracing.init';
// remove the top-level initTracing(...) block
export async function bootstrap() {
    // existing body unchanged
}
```

- [ ] **Step 2: Update server entry scripts**

Update `apps/server/package.json` scripts:

```json
{
  "start": "nest start --entryFile bootstrap",
  "dev": "nest start --watch --debug --entryFile bootstrap",
  "start:dev": "nest start --watch --entryFile bootstrap",
  "start:debug": "nest start --debug --watch --entryFile bootstrap",
  "start:prod": "node dist/bootstrap"
}
```

- [ ] **Step 3: Verify**

Run:

```bash
pnpm --filter @my-km/server build
```

Expected: build succeeds and `apps/server/dist/bootstrap.js` exists.

---

## Task 2: Backend stream and LLM events

**Files:**
- Modify: `apps/server/src/ai/ai.service.ts`
- Modify: `apps/server/src/tracing/instrumentations/llm-node.span.ts`

- [ ] **Step 1: Add LangGraph stream events**

In `executeRunProtocol()`:

```typescript
langgraphSpan.addEvent('stream_started', {
    runId: record.id,
    threadId: record.threadId,
    provider: record.runContext.llmConfig.provider,
    model: record.runContext.llmConfig.model,
});

let firstChunkEmitted = false;

// inside for-await, after mode is known:
if (!firstChunkEmitted) {
    langgraphSpan.addEvent('first_chunk_emitted', { mode });
    firstChunkEmitted = true;
}

// inside values branch after data is serialized:
langgraphSpan.addEvent('values_emitted', {
    hasInterrupt,
    messageCount: Array.isArray((data as Record<string, unknown>)?.messages)
        ? ((data as Record<string, unknown>).messages as unknown[]).length
        : 0,
});

// before end event:
langgraphSpan.addEvent('stream_completed', { status: record.status });
```

- [ ] **Step 2: Improve LLM span endings**

In `endLLMSpan()`:

```typescript
if ('error' in result) {
    span.addEvent('llm.error', { message: result.error });
    span.setStatus({ code: SpanStatusCode.ERROR, message: result.error });
} else {
    const usage = ...;
    if (usage) {
        span.setAttributes({
            'llm.inputTokens': usage.input_tokens ?? 0,
            'llm.outputTokens': usage.output_tokens ?? 0,
            'llm.usageAvailable': true,
        });
    } else {
        span.setAttribute('llm.usageAvailable', false);
    }
    span.addEvent('completion_received');
    span.setStatus({ code: SpanStatusCode.OK });
}
```

- [ ] **Step 3: Verify server tests/build**

Run:

```bash
pnpm --filter @my-km/server test -- ai.service.spec.ts
pnpm --filter @my-km/server build
```

Expected: tests and build pass.

---

## Task 3: Frontend receive/render events

**Files:**
- Modify: `apps/web/src/hooks/use-langgraph-stream.ts`

- [ ] **Step 1: Add event refs**

Inside `useLangGraphStream()` add:

```typescript
const hasSeenMetadata = useRef(false);
const hasSeenFirstMessageChunk = useRef(false);
```

- [ ] **Step 2: Add send event**

After creating `rootSpan` and before `stream.submit()`:

```typescript
rootSpan.addEvent('request_submitted', {
    messageLength: content.length,
    hasContext: Boolean(context && Object.keys(context).length > 0),
});
```

- [ ] **Step 3: Add metadata event**

In `onThreadId` and `onCreated`, add events when `activeTraceSpan.current` exists:

```typescript
activeTraceSpan.current?.addEvent('metadata_received', {
    threadId: id,
});
```

and

```typescript
activeTraceSpan.current?.addEvent('metadata_received', {
    runId: info.run_id ?? null,
});
```

- [ ] **Step 4: Add message/render events**

In the `useEffect([stream.messages])` body after `pendingRef.current` is computed:

```typescript
if (activeTraceSpan.current && pendingRef.current.length > 0) {
    activeTraceSpan.current.addEvent('values_received', {
        messageCount: pendingRef.current.length,
    });

    if (!hasSeenFirstMessageChunk.current && pendingRef.current.some(msg => msg.role === 'ai')) {
        activeTraceSpan.current.addEvent('first_message_chunk_received', {
            messageCount: pendingRef.current.length,
        });
        hasSeenFirstMessageChunk.current = true;
    }
}
```

- [ ] **Step 5: Add stream end event and flush**

Before `tracer.endSpan(activeTraceSpan.current)`:

```typescript
activeTraceSpan.current.addEvent('stream_ended', {
    hasError: Boolean(stream.error),
});
```

After clearing active traceparent:

```typescript
tracer.forceFlush();
hasSeenMetadata.current = false;
hasSeenFirstMessageChunk.current = false;
```

- [ ] **Step 6: Verify web typecheck**

Run:

```bash
pnpm --filter @my-km/web type-check
```

Expected: typecheck passes.

---

## Task 4: Final verification

**Files:**
- No additional code files unless tests require updates.

- [ ] **Step 1: Run focused checks**

```bash
pnpm --filter @my-km/server test -- ai.service.spec.ts
pnpm --filter @my-km/server build
pnpm --filter @my-km/web type-check
```

- [ ] **Step 2: Run repo lint**

```bash
pnpm lint
```

Expected: all checks pass or existing unrelated failures are documented with exact output.

- [ ] **Step 3: Manual acceptance**

Start dev stack, send one chat message, open trace detail, and confirm:

1. same trace has `my-km-web` and `my-km-server` spans;
2. `frontend.chat.sendMessage` contains receive/end events;
3. `langgraph.run` contains stream events;
4. `llm_node.invoke` contains prompt/completion or error events.
