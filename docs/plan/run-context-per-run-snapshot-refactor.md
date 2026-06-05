# RunContext 按 Run 快照重构方案

生成日期：2026-06-06  
状态：已实施 ✅  
范围：后端 AI Run 生命周期、RunContext、RunRecord、RunManager、AiChatService

## 背景

当前后端的 `RunContext` 通过 `AiModule` 作为 NestJS provider 注册：

```ts
{
    provide: 'RunContext',
    useFactory: async (checkpointerProvider, eventStore) => {
        const checkpointer = await checkpointerProvider.getCheckpointer();
        return new RunContext(checkpointer, eventStore);
    },
}
```

这会在 AI module 生命周期内创建一个共享的 `RunContext`。所有 run 都复用这个对象。

这和目标设计冲突。目标设计是：

- 每个 run 在创建时持有自己的 `RunContext`。
- `RunContext` 是该 run 创建瞬间的上下文快照。
- run 创建后，默认模型、动态配置、request context 的后续变化不影响这个 run。
- `eventStore`、`checkpointer`、未来的 LangGraph `store` / cross-thread memory 等 singleton infra 通过 `RunContext` 统一传递。
- graph 编译不属于 `RunContext`，应移动到 `executeRun()` 流程中，基于当前 run 的 context 编译。
- `RunContext` 保存 `llmConfig`，供 `executeRun()` 决定 provider/model。

## 当前问题

### 1. RunContext 生命周期错误

当前代码把 `RunContext` 注册为 module 级对象。`AiChatService` 注入后，所有 run 共用同一个实例。

影响：

- 配置快照语义不存在。
- 后续动态配置进入 `RunContext` 后，会污染已创建 run。
- resume / interrupt / tool loop 过程中无法保证仍使用创建 run 时的上下文。

### 2. RunRecord 存在隐藏执行状态

当前 `RunRecord` 内部有这些字段：

```ts
_llmProvider?: LLMProvider;
_content?: string;
_context?: Record<string, unknown>;
```

`AiChatService.startRun()` 写入这些字段，`executeRun()` 再通过 `any` 读取。

问题：

- 执行输入没有类型边界。
- 这些字段不是明确的 run snapshot。
- 后续扩展 llmConfig、tools、memory、request context 时容易继续堆隐藏状态。

### 3. graph cache 放错位置

当前 `RunContext` 持有 LRU graph cache，并提供 `getCompiledGraph()`。

在 per-run `RunContext` 设计下，这个 cache 语义不再清楚：

- 如果 RunContext 是每个 run 一个，LRU cache 基本没有跨 run 价值。
- 如果保留 cache，容易误导为 compiled graph 可跨 run 共享。
- 动态配置未来参与 graph compile 后，错误复用 graph 会造成配置串扰。

## 目标架构

```text
POST /ai/threads/:threadId/runs
        │
        ▼
AiChatController.startRun()
        │
        ▼
AiChatService.startRun()
        ├─ findOrCreate thread
        ├─ handleConcurrency()
        ├─ resolve + validate llmConfig
        ├─ RunContextFactory.create()
        │     ├─ get checkpointer singleton
        │     ├─ attach eventStore singleton
        │     ├─ deep clone + freeze llmConfig
        │     └─ deep clone + freeze requestContext
        ├─ RunManager.createRun(threadId, runContext, snapshot)
        └─ return RunRecord
        │
        ▼
AiChatService.executeRun(record, res)
        ├─ compile ChatGraph with record.runContext.checkpointer/store
        ├─ llmFactory.getOrCreate(record.runContext.llmConfig)
        ├─ stream graph
        ├─ emit SSE + eventStore events
        └─ finalize RunRecord
```

## 关键设计决策

### 决策 1：使用显式 RunContextFactory，不使用 NestJS scope

采用：新增 `RunContextFactory`，在 `AiChatService.startRun()` 中显式创建。

不采用：

- `Scope.TRANSIENT`
- `Scope.REQUEST`

原因：

- run 生命周期不是 NestJS provider 生命周期。
- transient 是“每个 consumer 一份”，不是“每个 run 一份”。
- request scope 是“每个 HTTP request 一份”，但 run 可能经历 SSE、interrupt、resume，不能等同于一次 HTTP request。
- 显式 factory 能把业务生命周期写在业务入口中，测试也最直接。

### 决策 2：RunContext 只保存上下文快照，不编译 graph

采用：`RunContext` 移除 `graphCache` 和 `getCompiledGraph()`。

`executeRun()` 负责基于 `record.runContext` 编译 graph：

```ts
private compileGraph(context: RunContext) {
    const chatGraph = new ChatGraph();
    const graph = chatGraph.createGraph();

    return graph.compile({
        checkpointer: context.checkpointer,
        ...(context.store ? { store: context.store } : {}),
    });
}
```

原因：

- graph 编译是执行流程的一部分，不是 context 快照本身。
- per-run context 中保留 LRU cache 收益低，语义脏。
- 未来如果 graph compile 成本变成瓶颈，再新增显式 `GraphCompiler`，并设计包含 compile-affecting config 的 cache key。

### 决策 3：RunRecord 持有 typed snapshot

采用：`RunRecord` 构造时接收 `RunContext` 和 `RunExecutionSnapshot`。

移除：

```ts
_llmProvider
_content
_context
```

建议类型：

```ts
export interface RunExecutionSnapshot {
    readonly content: string;
    readonly requestContext?: Readonly<Record<string, unknown>>;
}

export interface RunRecordOpts {
    id: string;
    threadId: string;
    runContext: RunContext;
    snapshot: RunExecutionSnapshot;
}
```

`llmConfig` 放在 `RunContext` 中，`executeRun()` 使用：

```ts
const llmProvider = this.llmFactory.getOrCreate(record.runContext.llmConfig);
const content = record.snapshot.content;
```

原因：

- 执行输入必须是显式、类型化、可测试的。
- provider 实例不应该冻结进 snapshot，避免缓存 provider 的内部状态进入 run 快照。
- run 的模型选择来自 `llmConfig` 快照，而不是执行时读取默认配置。

### 决策 4：动态配置必须深克隆并冻结

采用：对 `llmConfig` 和 `requestContext` 做 `structuredClone + deepFreeze`。

原因：

- `readonly` 只能保护 TypeScript 编译期。
- 浅拷贝不能阻止嵌套对象被外部引用修改。
- per-run snapshot 的核心承诺是：run 创建后的动态配置变化不影响已创建 run。

建议工具函数：

```ts
function snapshotValue<T>(value: T): Readonly<T> {
    return deepFreeze(structuredClone(value));
}
```

约束：

- `llmConfig` 和 `requestContext` 应被视为 JSON-like 数据。
- 如果传入函数、class instance、不可克隆对象，应明确失败，而不是偷偷共享引用。

### 决策 5：本阶段只保证进程内 resume

当前 `RunManager` 用内存 `Map` 保存 `RunRecord`。因此本阶段语义是：

- 同进程内的 interrupted run 可以 resume，并复用原 `RunContext`。
- 服务重启后，`RunRecord` 和 `RunContext` 快照不存在。
- 即使 LangGraph checkpointer 能恢复图状态，应用层 `llmConfig/requestContext` 快照也无法恢复。

因此跨重启 / 多实例 resume 不在本次范围内，必须列为后续 TODO。

## 拟改文件

### `apps/server/src/ai/ai.module.ts`

修改：

- 删除 `'RunContext'` provider。
- 注册新的 `RunContextFactory`。
- `AiChatService` 不再注入 `'RunContext'`。

### `apps/server/src/ai/run/run-context.ts`

修改为纯 per-run 快照对象：

- 保留 `checkpointer`
- 保留 `eventStore`
- 新增 `llmConfig`
- 新增 `requestContext`
- 预留可选 `store`，但不实现真实 memory 行为
- 移除 LRU cache
- 移除 `getCompiledGraph()`
- 更新文件注释，明确“每 run 创建一次”

### `apps/server/src/ai/run/run-context-factory.ts`

新增 injectable factory：

```ts
@Injectable()
export class RunContextFactory {
    constructor(
        private readonly checkpointerProvider: CheckpointerProvider,
        private readonly eventStore: RunEventStore,
    ) {}

    async create(opts: CreateRunContextOpts): Promise<RunContext> {
        const checkpointer = await this.checkpointerProvider.getCheckpointer();
        return new RunContext({
            checkpointer,
            eventStore: this.eventStore,
            llmConfig: opts.llmConfig,
            requestContext: opts.requestContext,
        });
    }
}
```

### `apps/server/src/ai/run/run-record.ts`

修改：

- `RunRecordOpts` 接收 `runContext` 和 `snapshot`。
- 删除 `checkpointer` 字段。
- 删除 `_llmProvider/_content/_context`。
- `emitEvent()` 使用 `this.runContext.eventStore`，或者保留 `eventStore` 派生字段，但只能有一个来源。

推荐只有一个来源：`this.runContext.eventStore`。

### `apps/server/src/ai/run/run-manager.ts`

修改：

- `createRun(threadId, runContext, snapshot)`。
- 不再接收 checkpointer。
- 如果 `RunRecord` 通过 `runContext.eventStore` emit event，则 `RunManager` 也不需要注入 `RunEventStore`。

建议进一步简化：

```ts
@Injectable()
export class RunManager {
    private readonly runs = new Map<string, RunRecord>();

    createRun(threadId: string, runContext: RunContext, snapshot: RunExecutionSnapshot): RunRecord {
        ...
    }
}
```

### `apps/server/src/ai/ai.service.ts`

修改：

- 注入 `RunContextFactory`，不注入 `'RunContext'`。
- `startRun()`：
  - 先处理并发。
  - resolve + validate `llmConfig`。
  - 创建 per-run `RunContext`。
  - 创建 typed `RunRecord`。
- `executeRun()`：
  - 使用 `record.runContext`。
  - 在 execute 流程中编译 graph。
  - 用 `record.runContext.llmConfig` 创建 provider。
  - 不读取 `ProviderRegistry.defaultConfig`。
  - 不读取 `record as any`。
- `resume()`：
  - 返回原 `RunRecord`。
  - 不重新创建 `RunContext`。

## llmConfig 解析与校验

`startRun()` 应负责生成 run 的最终 `llmConfig` 快照。

建议规则：

1. 读取 `ProviderRegistry.defaultConfig`。
2. 与 `opts.llmConfig` 合并。
3. 校验：
   - provider 必填
   - model 必填
   - provider 已注册
4. 创建快照。
5. 后续 `executeRun()` 只使用快照，不再读取默认配置。

注意：如果 provider 改变但 model 沿用旧 provider 的默认 model，可能产生不兼容组合。当前可以先按显式 merge 处理，但测试应覆盖 provider/model 同时覆盖的场景。更完整的 provider-specific 默认值解析可后续做。

## 并发顺序

`RunContext` 创建应发生在并发控制之后：

```text
findOrCreate thread
  └─ getActiveRunForThread
       ├─ Rejected: throw，不创建 RunContext
       ├─ Interrupt: abort old run，再创建新 RunContext
       └─ Rollback: 当前仍未实现 rollback，只保留现状或列 TODO
```

原因：

- Rejected 情况下不应创建无用 snapshot。
- Interrupt/Rollback 需要先处理旧 run，再创建新 run。

## 测试计划

测试框架：Jest。

无需真实 LLM。使用 fake provider / fake graph mocks。

### RunContext tests

文件：`apps/server/src/ai/run/__tests__/run-context.spec.ts`

覆盖：

- `RunContext` 暴露 `checkpointer/eventStore/llmConfig/requestContext`。
- 不再暴露 `getCompiledGraph()`。
- `llmConfig` 被 deep clone + deep freeze。
- `requestContext` 被 deep clone + deep freeze。
- 原始对象后续 mutation 不影响 `RunContext`。

### RunContextFactory tests

文件：`apps/server/src/ai/run/__tests__/run-context-factory.spec.ts`

覆盖：

- 每次 `create()` 返回不同 `RunContext` 实例。
- 不同 context 共享同一个 `checkpointer` 和 `eventStore` 引用。
- `CheckpointerProvider.getCheckpointer()` 被调用。
- 不可克隆 `requestContext` 失败明确。

### RunManager tests

文件：`apps/server/src/ai/run/__tests__/run-manager.spec.ts`

覆盖：

- 更新 stale constructor 断言。
- `createRun(threadId, runContext, snapshot)` 创建并追踪 record。
- active run lookup 行为不变。
- cleanup 行为不变。

### RunRecord tests

文件：`apps/server/src/ai/run/__tests__/run-record.spec.ts`

覆盖：

- record 持有 `runContext`。
- record 持有 typed `snapshot`。
- 不再存在 `_llmProvider/_content/_context` 路径。
- `emitEvent()` 仍写入 SSE 和 eventStore。
- cancel/finalize/status 行为不变。

### AiChatService tests

文件：`apps/server/src/ai/__tests__/ai.service.spec.ts`

覆盖：

- `startRun()` 在并发接受后调用 `RunContextFactory.create()`。
- rejected concurrency 不创建 context。
- 两个 run 得到不同 `RunContext`。
- 修改 `ProviderRegistry.defaultConfig` 后，不影响已创建 run 的 `llmConfig`。
- 修改原始 `opts.context` 后，不影响已创建 run 的 `requestContext`。
- `executeRun()` 使用 `record.runContext.checkpointer` 编译 graph。
- `executeRun()` 使用 `record.runContext.llmConfig` 创建 provider。
- `executeRun()` 不读取 `ProviderRegistry.defaultConfig`。
- `resume()` 返回同一个 record/context，不调用 factory。

## 覆盖图

```text
CODE PATHS                                                   USER/API FLOWS

[+] AiChatService.startRun()                                 [+] POST /ai/threads/:threadId/runs
  ├── [GAP] findOrCreate thread                                ├── [★★ TESTED today] creates run basic path
  ├── [GAP] concurrency rejected/interrupt/rollback             ├── [GAP] per-run context isolation
  ├── [GAP] resolve + validate llmConfig snapshot               ├── [GAP] default config changes after startRun
  ├── [GAP] RunContextFactory.create                            ├── [GAP] request context mutated after startRun
  └── [GAP] RunManager.createRun(context, snapshot)             └── [GAP] invalid provider/model error event

[+] RunContextFactory.create()
  ├── [GAP] getCheckpointer async lazy singleton
  ├── [GAP] shares checkpointer/eventStore references
  ├── [GAP] creates distinct RunContext per call
  ├── [GAP] structuredClone + deepFreeze llmConfig
  └── [GAP] structuredClone + deepFreeze requestContext

[+] RunRecord
  ├── [GAP] stores runContext readonly
  ├── [GAP] stores typed snapshot readonly
  ├── [GAP] no _llmProvider/_content/_context
  └── [★★ TESTED today] status/cancel/cleanup basics, but stale constructor tests

[+] AiChatService.executeRun()
  ├── [GAP] compiles ChatGraph in execute flow
  ├── [GAP] compile uses record.runContext.checkpointer
  ├── [GAP] LLMFactory.getOrCreate(record.runContext.llmConfig)
  ├── [GAP] no ProviderRegistry.defaultConfig read during execute
  ├── [GAP] lifecycle failed if provider/model invalid
  └── [GAP] SSE closes cleanly on execution error

[+] AiChatService.resume()
  ├── [GAP] returns same in-memory RunRecord
  ├── [GAP] does not call RunContextFactory again
  └── [GAP] uses original runContext after default config changes
```

## 失败模式

| Codepath | Failure mode | Required handling |
|---|---|---|
| `startRun()` config snapshot | defaultConfig 在 run 创建后变化污染旧 run | deep clone/freeze + regression test |
| `startRun()` invalid provider | provider 不存在 | startRun 阶段校验，避免 SSE 后才失败 |
| `RunContextFactory.create()` | checkpointer 初始化失败 | throw before record enters running state |
| `executeRun()` graph compile | compile 抛错 | emit `lifecycle:failed` and close SSE |
| `executeRun()` provider creation | API key/model 错误 | emit error event + failed lifecycle |
| `resume()` | 服务重启后找不到 RunRecord | 本阶段明确不支持跨重启 resume |
| `interrupt` concurrency | 新旧 run 事件交错 | 保持 status/event 明确，补测试 |
| `requestContext` snapshot | 不可 clone 值传入 | 明确抛错，不共享引用 |

## 性能取舍

本次不做跨 run graph cache。

理由：

- 当前目标是生命周期正确性。
- graph compile 是否是瓶颈还没有 profiling。
- 过早做跨 run cache 需要设计复杂 cache key。
- 动态配置未来可能影响 graph compile，错误 cache key 会造成配置串扰。

后续如果首 token 延迟增加，再新增：

```text
GraphCompiler
  key = graphName + graphVersion + compile-affecting config hash
```

## NOT in scope

- RunContext snapshot 数据库持久化。
- 服务重启后 resume 恢复 `llmConfig/requestContext`。
- 多实例 / sticky session / 横向扩展 run 管理。
- 真实 LangGraph store / cross-thread memory 实现。
- GraphCompiler 跨 run cache。
- 真实 LLM E2E。
- Rollback checkpoint 语义实现。

## 后续 TODO

### TODO 1：持久化 RunContext snapshot

**What:** 将 `llmConfig/requestContext/tool config/graph version` 等 run snapshot 写入数据库。  
**Why:** 当前 `RunManager` 是进程内 Map，服务重启后无法恢复 run 的应用层上下文。  
**Value:** 让 LangGraph checkpointer 和应用层 run context 恢复能力对齐。  
**Cost:** 需要 schema、migration、版本化、敏感字段脱敏、多实例恢复策略。  
**Depends on:** 本次 per-run RunContext 语义落地。

### TODO 2：实现 rollback checkpoint 语义

**What:** 明确定义 `ConcurrencyPolicy.Rollback` 的 checkpoint 回滚点和事件语义。  
**Why:** 当前代码只有注释，没有实际 rollback 行为。  
**Value:** 避免用户以为 rollback 已生效。  
**Cost:** 需要理解 LangGraph checkpoint API 和 eventStore 补偿策略。  
**Depends on:** RunContext 快照和 checkpoint 使用路径稳定。

### TODO 3：按 profiling 引入 GraphCompiler

**What:** 如果 graph compile 成为首 token 延迟瓶颈，引入显式 `GraphCompiler`。  
**Why:** 避免每个 execute 都重复编译 graph。  
**Value:** 降低 SSE 首包延迟。  
**Cost:** 需要稳定 cache key，包含 graph version 和 compile-affecting config。  
**Depends on:** 观测到真实性能问题。

## 实施任务

- [x] **T1 (P1)** — 新增 `RunContextFactory`，移除 AiModule singleton `'RunContext'` provider。
- [x] **T2 (P1)** — `RunContext` 改为 per-run readonly snapshot，移除 graph cache 和 `getCompiledGraph()`。
- [x] **T3 (P1)** — `RunRecord` 持有 `runContext` 和 typed `RunExecutionSnapshot`，移除 `_llmProvider/_content/_context`。
- [x] **T4 (P1)** — `RunManager.createRun()` 接收 `RunContext` 和 snapshot，清理重复的 `eventStore/checkpointer` 来源。
- [x] **T5 (P1)** — `AiChatService.startRun()` 创建 context 快照，`executeRun()` 基于 `record.runContext` 编译 graph 和创建 provider。
- [x] **T6 (P1)** — 增加 `structuredClone + deepFreeze` 工具函数，并覆盖 mutation regression tests。
- [x] **T7 (P1)** — 更新 Jest 测试，覆盖 per-run isolation、llmConfig snapshot、requestContext snapshot、resume reuse、execute provider selection。
- [x] **T8 (P2)** — 更新注释和后端架构文档，明确本阶段只支持进程内 resume。

## 建议实现顺序

```text
1. 新增 RunContextFactory + 改 RunContext 类型
2. 改 RunRecord / RunManager 构造参数
3. 改 AiChatService.startRun()
4. 改 AiChatService.executeRun()
5. 修测试编译错误
6. 补完整 regression tests
7. 更新注释和 docs
8. 跑 apps/server Jest suite
```

## 验证命令

```bash
cd apps/server
pnpm test -- run-context run-manager run-record ai.service
pnpm test
```

## 评审结论

采用完整生命周期修正，不做最小补丁。

核心判断：这不是“把 DI provider scope 改一下”的问题，而是业务生命周期建模错误。正确边界是：

```text
RunRecord = 单次 run 的生命周期状态
RunContext = 单次 run 创建时的执行上下文快照
RunContextFactory = 从 singleton infra + 动态配置创建 run 快照
executeRun = 使用 RunRecord 持有的快照执行 graph/LLM
```

这个方案能解决当前所有 run 共享同一个 `RunContext` 的 bug，也给未来 `store`、cross-thread memory、持久化 resume 留出清楚位置。