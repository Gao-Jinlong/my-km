# 移除旧 AI 对话接口 + 对齐 LangGraph Platform 协议

**生成时间**: 2026-06-06  
**Branch**: main  
**Skill**: /plan-eng-review

## 目标

1. **删除**旧 `AiChatController`（`/api/ai/threads/*`）和配套自研 SSE 协议 `ai-stream.protocol.ts`
2. **对齐** `ConcurrencyPolicy` → LangGraph `multitask_strategy` 标准值（`'reject' | 'interrupt' | 'rollback' | 'enqueue'`）
3. **修复** "No LLM provider configured" 启动问题：`AiModule.onModuleInit()` 注册 4 个 provider 工厂 + `setDefaultConfig()`（dashscope 作为 fallback）
4. **清理**前端 `conversation-api.ts` 死代码

## NOT in scope（明确推迟）

| 项 | 推迟原因 |
|---|---|
| 真正的 `enqueue` 持久化队列（RunQueue 服务） | 需要数据库表 + worker，超出本次范围。`enqueue` fallback 到 `reject` 并 log warn |
| `getThreadState` 从 checkpointer 读取真实状态 | 当前从 messages 表组装假数据，旧实现也没有 state 端点，未阻塞本次迁移 |
| `incrementMessageCount(threadId)` 应该 +2 而不是 +1 的 bug | 预存在的独立 bug，与协议迁移正交 |
| LangGraph `assistant_id` 多 assistant 路由 | 当前固定写死 `'default'`，未来若需要多图再加 |
| SuperTest E2E 集成测试 | 依赖单元测试 + 手动 QA |
| LangGraph stream rejoin (`GET /threads/:tid/runs/:rid/stream`) | 当前返回 501，本次不实现 |

## What already exists（不要重建）

| 已有 | 用途 |
|---|---|
| `apps/server/src/ai/langgraph/threads.controller.ts` | LangGraph 协议 controller，**保留并扩展**（移除 `mapMultitaskStrategy` 转换层） |
| `apps/server/src/ai/langgraph/langgraph-protocol.ts` | LangGraph SSE 事件编码器，**保留**（删除 sse/ 目录） |
| `apps/server/src/ai/ai.service.ts` 的 `executeRunProtocol()` / `resumeFromCommand()` | 标准协议执行器，**保留并补测试** |
| `apps/web/src/hooks/use-langgraph-stream.ts` | 前端 SDK 集成，**已对齐**，本次不动 |
| `apps/web/src/components/workspace/ai-panel/conversation-list.tsx` | 已用 `langgraphClient.threads.search()`，本次不动 |
| `apps/server/src/ai/llm/llm-default-config.ts:buildDefaultLlmConfig()` | env auto-detect 函数，**已存在但从未被调用**，本次接入 |
| `apps/server/src/ai/llm/{anthropic,openai,zhipu,dashscope}.provider.ts` | 4 个 provider 实现，本次只补注册逻辑 |

---

## 架构图

### 删除前（两套并行）

```
前端 (apps/web)
  ├── conversation-api.ts ──fetch──> AiChatController (/api/ai/threads/*)
  │                                    ├── SSE: ai-stream.protocol.ts
  │                                    │   (lifecycle/messages/tools 自研)
  │                                    └── ai.service.executeRun()
  │                                          ├── concurrency: ConcurrencyPolicy
  │                                          │   ('rejected'/'interrupt'/'rollback')
  │                                          └── resume({runId,toolCallId,result})
  │
  └── @langchain/langgraph-sdk ──> ThreadsController (/api/threads/*)
        useLangGraphStream            ├── SSE: langgraph-protocol.ts
                                      │   (metadata/values/end/error 标准)
                                      └── ai.service.executeRunProtocol()
                                            ├── concurrency: 转换 multitask_strategy
                                            │   → ConcurrencyPolicy（单复数差异）
                                            └── resumeFromCommand({threadId,command})
```

### 删除后（统一 LangGraph 协议）

```
前端 (apps/web)
  └── @langchain/langgraph-sdk ──> ThreadsController (/api/threads/*)
        useLangGraphStream            ├── SSE: langgraph-protocol.ts
                                      │   (metadata/values/end/error 标准)
                                      └── ai.service
                                            ├── multitask_strategy: 
                                            │   'reject'|'interrupt'|'rollback'|'enqueue'
                                            │   (enqueue → fallback reject + warn)
                                            ├── startRun(...) 
                                            ├── executeRunProtocol(...)
                                            └── resumeFromCommand(threadId, command)

AiModule
  └── onModuleInit():
        registry.register('anthropic', cfg => new AnthropicProvider(cfg))
        registry.register('openai',    cfg => new OpenAiProvider(cfg))
        registry.register('zhipu',     cfg => new ZhipuProvider(cfg))
        registry.register('dashscope', cfg => new DashscopeProvider(cfg))
        const cfg = buildDefaultLlmConfig() ?? {provider:'dashscope', model:'qwen-plus'}
        registry.setDefaultConfig(cfg)
```

### multitask_strategy 数据流（修改后）

```
前端 SDK
  POST /api/threads/:tid/runs/stream
  body.multitask_strategy: 'reject'|'interrupt'|'rollback'|'enqueue'
        │
        ▼
ThreadsController.streamRun()
        │   strategy 直接透传，无 mapping 函数
        ▼
AiChatService.startRun({multitaskStrategy})
        │
        ▼
AiChatService.handleConcurrency(activeRun, strategy)
  switch (strategy) {
    case 'reject':    throw ConflictException
    case 'interrupt': activeRun.abort()
    case 'rollback':  activeRun.abort() + (rollback TODO)
    case 'enqueue':   this.logger.warn('enqueue not supported, falling back to reject')
                      throw ConflictException
  }
```

---

## 决策摘要（已与用户确认）

| ID | 决策 | 选择 |
|---|---|---|
| D1 | 默认 provider 策略 | 保持 `buildDefaultLlmConfig()` 现有优先级，所有 key 缺失时 fallback 到 `{provider:'dashscope', model:'qwen-plus'}` |
| D2 | Provider 注册位置 | `AiModule.onModuleInit()` |
| D3 | ConcurrencyPolicy 对齐 | 删除 enum，改为 union type `MultitaskStrategy` |
| D4 | `enqueue` 处理 | fallback `reject` + `logger.warn` |
| D5 | `resume({runId, toolCallId, result})` | 删除，只保留 `resumeFromCommand({threadId, command})` |
| D6 | `executeRun()` 旧方法 | 删除 |
| D8 | `conversation-api.ts` | 删除文件，`ThreadRecord` type 迁移到 `features/ai/types/thread.types.ts` |
| D9 | SSE 协议文件位置 | 保持 `langgraph-protocol.ts` 在 `langgraph/`，删除 `sse/` 目录 |
| D10 | `getThreadState` 完整化 | 推迟（TODO） |
| D11 | Bootstrap 回归测试 | 独立 `ai.module.bootstrap.spec.ts` |
| D12 | `executeRunProtocol` 测试 | 完整 4-5 个 `it()` |
| D13 | `resumeFromCommand` 测试 | 三个分支 |
| D14 | `ThreadsController` 测试 | 完整 spec，约 6-8 个 `it()` |
| D15 | E2E | 跳过，依赖单元测试 + 手动 QA |

---

## 实施任务（按依赖顺序）

> 标记规则：P0 = 阻塞 ship；P1 = 同 PR 内必做；P2 = 跟进 TODO

### 阶段 1：类型与协议对齐（无副作用，先做）

#### T1 (P0, human: ~10min / CC: ~3min) — 重构 `MultitaskStrategy` union type

**文件**: `apps/server/src/ai/types/run.types.ts`

- 删除 `enum ConcurrencyPolicy`
- 新增 `export type MultitaskStrategy = 'reject' | 'interrupt' | 'rollback' | 'enqueue';`
- 保留 `enum RunStatus` 与 `RunDto`（不动）

**Verify**: `pnpm --filter server typecheck` 报错位置即为后续需要修改的调用点

#### T2 (P0, human: ~15min / CC: ~5min) — `ai.service.ts` 删除旧路径

**文件**: `apps/server/src/ai/ai.service.ts`

- 删除 `executeRun(record, res)` 方法（行 126-254）
- 删除 `resume({runId, toolCallId, result})` 方法（行 261-277）
- 删除导入：`encodeSSE`, `contentBlockFinish`, `contentBlockStart`, `errorEvent`, `lifecycleCompleted`, `lifecycleFailed`, `lifecycleInterrupted`, `lifecycleStarted`, `messageFinish`, `messageStart`, `resetMessageSeq`, `textDelta`, `toolStarted`, `valuesSnapshot`（来自 `./sse/ai-stream.protocol`）
- 删除 `ResumeOpts` interface
- 将 `StartRunOpts.concurrency: ConcurrencyPolicy` 改为 `multitaskStrategy: MultitaskStrategy`
- 将 `startRun()` 默认值 `ConcurrencyPolicy.Rejected` 改为 `'reject'`
- 将 `handleConcurrency()` switch 改为：
  ```ts
  switch (strategy) {
    case 'reject':    throw new ConflictException(...);
    case 'interrupt': activeRun.abort(); await wait(100); break;
    case 'rollback':  activeRun.abort(); await wait(100); /* TODO checkpoint rollback */ break;
    case 'enqueue':   this.logger.warn(`Strategy 'enqueue' not yet supported, falling back to 'reject'`);
                      throw new ConflictException(...);
  }
  ```

**Verify**: `pnpm --filter server typecheck && pnpm --filter server test ai.service`

#### T3 (P0, human: ~10min / CC: ~3min) — 删除旧 controller

**文件**: 
- 删除 `apps/server/src/ai/ai.controller.ts`（整文件）
- 删除 `apps/server/src/ai/sse/ai-stream.protocol.ts`（整文件）
- 删除 `apps/server/src/ai/sse/`（空目录）
- 修改 `apps/server/src/ai/ai.module.ts`：
  - 移除 `import { AiChatController } from './ai.controller'`
  - `controllers: [ThreadsController]`（移除 `AiChatController`）

**Verify**: `pnpm --filter server build`

#### T4 (P0, human: ~10min / CC: ~3min) — 对齐 `ThreadsController` 透传策略

**文件**: `apps/server/src/ai/langgraph/threads.controller.ts`

- 删除 `mapMultitaskStrategy()` 私有方法（行 322-337）
- `streamRun()` 直接传：`multitaskStrategy: body.multitask_strategy ?? 'reject'`
- 修改 `RunsStreamBody` 中 `multitask_strategy` 字段保持 union type 不变
- 修改 `import` 语句更新 `ConcurrencyPolicy` → `MultitaskStrategy`

**Verify**: `pnpm --filter server build`

### 阶段 2：Bootstrap 修复（核心 bug 修复）

#### T5 (P0, human: ~20min / CC: ~7min) — `AiModule.onModuleInit()` 注册 provider

**文件**: `apps/server/src/ai/ai.module.ts`

实现 `OnModuleInit` 接口：

```ts
import { Module, OnModuleInit } from '@nestjs/common';
import { AnthropicProvider } from './llm/anthropic.provider';
import { DashscopeProvider } from './llm/dashscope.provider';
import { OpenAiProvider } from './llm/openai.provider';
import { ZhipuProvider } from './llm/zhipu.provider';
import { buildDefaultLlmConfig } from './llm/llm-default-config';

@Module({...})
export class AiModule implements OnModuleInit {
    constructor(private readonly registry: ProviderRegistry) {}

    onModuleInit(): void {
        this.registry.register('anthropic', cfg => new AnthropicProvider(cfg));
        this.registry.register('openai',    cfg => new OpenAiProvider(cfg));
        this.registry.register('zhipu',     cfg => new ZhipuProvider(cfg));
        this.registry.register('dashscope', cfg => new DashscopeProvider(cfg));

        const cfg = buildDefaultLlmConfig() ?? { 
            provider: 'dashscope', 
            model: 'qwen-plus' 
        };
        this.registry.setDefaultConfig(cfg);
    }
}
```

> 注意：每个 provider 的实际类名需根据现有文件确认（`AnthropicProvider` / `OpenAIProvider` 等大小写差异）

**Verify**: 启动 server，访问 `POST /api/threads`，不应再报 "No LLM provider configured"

### 阶段 3：前端清理

#### T6 (P1, human: ~10min / CC: ~3min) — 迁移 `ThreadRecord` type 并删除 `conversation-api.ts`

**文件**:
- 新建 `apps/web/src/features/ai/types/thread.types.ts`：
  ```ts
  export interface ThreadRecord {
      id: string;
      userId: string | null;
      title: string | null;
      status: 'active' | 'archived' | 'deleted';
      model: string | null;
      provider: string | null;
      messageCount: number;
      createdAt: string;
      updatedAt: string;
  }
  ```
- 修改 `apps/web/src/components/workspace/ai-panel/conversation-list.tsx`：
  `import type { ThreadRecord } from '@/features/ai/api/conversation-api'` → `from '@/features/ai/types/thread.types'`
- 修改 `apps/web/src/components/workspace/ai-panel/conversation-item.tsx`：同上
- 删除 `apps/web/src/features/ai/api/conversation-api.ts`

**Verify**: `pnpm --filter web build && pnpm --filter web test`

### 阶段 4：测试覆盖（与代码同 PR）

#### T7 (P0, human: ~30min / CC: ~10min) — 重构 `ai.service.spec.ts`

**文件**: `apps/server/src/ai/__tests__/ai.service.spec.ts`

- 删除 `describe('resume')` 区块（已删除该方法）
- 将所有 `ConcurrencyPolicy.Rejected` → `'reject'`，调用 `concurrency:` → `multitaskStrategy:`
- 新增 `describe('resumeFromCommand')`，包含 3 个 `it()`：
  - 无活跃 run → `NotFoundException`
  - 状态非 `Interrupted` → `ConflictException`
  - 成功 → 设置 `Running` 状态，返回 record
- 新增 `describe('executeRunProtocol')`，包含 4-5 个 `it()`：
  - happy path: 发送 `metadata`、`values`、`end` 事件序列
  - 异常 path: 发送 `error` 事件，`record.status = Failed`
  - abort: `record.status = Cancelled`
  - tool interrupt: `record.status = Interrupted`
- 新增 `describe('multitask_strategy')`，包含：
  - `'enqueue'` 触发 `logger.warn` + 抛 `ConflictException`

**Verify**: `pnpm --filter server test ai.service`

#### T8 (P0, human: ~25min / CC: ~10min) — 新增 `ai.module.bootstrap.spec.ts`

**文件**: `apps/server/src/ai/__tests__/ai.module.bootstrap.spec.ts`（新建）

```ts
describe('AiModule bootstrap', () => {
    let registry: ProviderRegistry;
    
    beforeEach(async () => {
        const module = await Test.createTestingModule({
            imports: [AiModule],
        })
        .overrideProvider(PrismaService).useValue({...})
        .compile();
        await module.init();
        registry = module.get(ProviderRegistry);
    });

    it('registers all 4 provider factories', () => {
        expect(registry.registeredProviders.sort()).toEqual([
            'anthropic', 'dashscope', 'openai', 'zhipu',
        ]);
    });

    it('sets defaultConfig when DASHSCOPE_API_KEY is present', () => {
        process.env.DASHSCOPE_API_KEY = 'test-key';
        // re-init module ...
        expect(registry.defaultConfig).toBeDefined();
        expect(registry.defaultConfig?.provider).toBeDefined();
    });

    it('falls back to dashscope with qwen-plus when no API key set', () => {
        delete process.env.ANTHROPIC_API_KEY;
        delete process.env.OPENAI_API_KEY;
        delete process.env.ZHIPUAI_API_KEY;
        delete process.env.DASHSCOPE_API_KEY;
        // re-init module ...
        expect(registry.defaultConfig).toEqual({
            provider: 'dashscope',
            model: 'qwen-plus',
        });
    });
});
```

**Verify**: `pnpm --filter server test ai.module.bootstrap`

#### T9 (P0, human: ~30min / CC: ~10min) — 新增 `threads.controller.spec.ts`

**文件**: `apps/server/src/ai/langgraph/__tests__/threads.controller.spec.ts`（新建）

包含 6-8 个 `it()`：

1. `streamRun` 新 run path: mock `startRun` + `executeRunProtocol`，验证被调用
2. `streamRun` resume path (`body.command.resume`)：验证 `resumeFromCommand` 被调用
3. `streamRun` 无 user message → 写入 `error` 事件 `'invalid_input'`
4. `streamRun` `multitask_strategy='enqueue'` → 转发 'enqueue' 给 service
5. `streamRun` 异常 → 写入 `error` 事件 `'execution_error'`
6. `createThread` 转换 SDK 格式（metadata.title → ThreadService.create({title}))
7. `searchThreads` 透传 `limit/offset`
8. `getThreadState` 返回 `{values:{messages}, next:[], checkpoint, ...}` 形状

**Verify**: `pnpm --filter server test threads.controller`

---

## Failure modes（关键失败模式）

| 失败模式 | 测试覆盖？ | 错误处理？ | 用户可见？ |
|---|---|---|---|
| `AiModule.onModuleInit()` 抛异常（如 provider 构造函数出错） | T8 部分（mock provider）但**未覆盖真实 provider 构造异常** | NestJS 会终止启动，可见 | 启动失败，日志清晰 |
| `DashscopeProvider` 实例化时 API key 缺失 → 抛 "DashScope API key is required" | ❌ 未测试 | 抛 Error，会传播到 startRun → SSE error event | 用户看到 SSE error，但**信息不清晰**（说 "DashScope API key is required" 但默认 provider 选择是 dashscope，可能误导） |
| Bootstrap 后所有 4 个 env key 都缺失 → registry.defaultConfig 是 `{dashscope, qwen-plus}` 但 `LLMFactory.getOrCreate` 调用 DashscopeProvider 抛错 | T8 覆盖 fallback path | startRun 时报错，**用户看到 SSE error** | **关键**：建议在 onModuleInit 中 log warn 提示用户配置 key |
| `enqueue` strategy 被前端发送 | T7 覆盖 | logger.warn + ConflictException | SDK 会显示 conflict 错误 |

### 🔴 关键失败缺口（待评估）

**[CRITICAL GAP]** 如果 `onModuleInit()` fallback 到 dashscope，但 `DASHSCOPE_API_KEY` 未设置，第一个用户请求才会失败。建议：

```ts
onModuleInit(): void {
    // ... register all providers
    const cfg = buildDefaultLlmConfig();
    if (!cfg) {
        this.logger.warn(
            'No LLM API key found in env (ANTHROPIC_API_KEY / OPENAI_API_KEY / ZHIPUAI_API_KEY / DASHSCOPE_API_KEY). ' +
            'Falling back to dashscope/qwen-plus; first request will fail unless DASHSCOPE_API_KEY is set.',
        );
        this.registry.setDefaultConfig({ provider: 'dashscope', model: 'qwen-plus' });
    } else {
        this.registry.setDefaultConfig(cfg);
    }
}
```

---

## TODOS（独立跟进项）

> 这些不在本次 PR scope，但需要记录

1. **真正实现 `enqueue` 持久化队列**：增加 `RunQueue` 服务（Redis 或 DB-backed），handle 真正的排队语义。
2. **`getThreadState` 从 checkpointer 读取真实状态**：当前从 messages 表组装假数据。
3. **`incrementMessageCount(threadId)` bug**：当前每次 run +1，应该 +2（user message + assistant message）。
4. **`rollback` 策略的真实 checkpoint 回滚**：当前只 abort，不回滚 checkpoint。
5. **LangGraph stream rejoin**：`GET /threads/:tid/runs/:rid/stream` 当前返回 501。

---

## 并行化策略

所有任务集中在 `apps/server/src/ai/` 和少量 `apps/web/src/features/ai/`、`apps/web/src/components/workspace/ai-panel/`，**同一模块内强耦合**，无法有效并行。

**结论**: 顺序实施（按 T1 → T9 顺序）。如果用 CC 编辑，可以在一个会话中按阶段连续完成。

---

## 不确定决策（用户未明确回答）

无。所有 D1-D15 决策均已确认。

---

## Completion Summary

- Step 0: Scope Challenge — 用户确认按完整范围推进（10 文件，大部分删除，~20 行新增）
- Architecture Review: 7 issues raised (D1-D7), all resolved
- Code Quality Review: 3 issues raised (D8-D10), 2 resolved + 1 deferred to TODO
- Test Review: diagram produced, 5 gaps identified (D11-D15), all resolved
- Performance Review: 0 issues found (纯删除/配置)
- NOT in scope: written (6 项推迟)
- What already exists: written (7 项复用)
- TODOS.md updates: 5 项
- Failure modes: 1 critical gap flagged (dashscope fallback log warn)
- Outside voice: 跳过（用户未要求）
- Parallelization: Sequential implementation, no parallelization opportunity
- Lake Score: 12/13 recommendations chose complete option

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | — | — |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR (PLAN) | 15 issues across all sections, 0 unresolved, 1 critical gap flagged |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — (无 UI 改动) | — |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

- **UNRESOLVED:** 0
- **CRITICAL GAPS:** 1 (DashScope fallback 缺少 onModuleInit warn log，建议但未阻塞)
- **VERDICT:** ENG CLEARED — ready to implement

