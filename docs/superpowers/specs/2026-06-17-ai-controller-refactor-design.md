# AI 控制器层重构设计

> **范围**：聚焦 Thread/Run 控制器层。不引入 DDD、不动 service/聚合层的核心业务逻辑、不改 Prisma schema。
>
> **状态**：待实现
>
> **日期**：2026-06-17

---

## 1. 背景与问题

### 1.1 `threads.controller.ts` 承载了过多业务逻辑

`apps/server/src/ai/langgraph/threads.controller.ts` 的 `streamRun`（60 行）和 `joinStream`（53 行）里塞了大量 controller 不该关心的逻辑：

| 逻辑 | 现状位置 | 问题 |
|---|---|---|
| `extractLastUserMessage()` 从 LangChain messages 提取 human message | controller private method | 协议转换逻辑泄漏到 controller |
| `toLangGraphThread()` 内部模型 → SDK 格式映射 | controller private method | 同上 |
| SSE header 设置 + flush + `sendProtocolError` 写错误帧 | controller private method | 传输胶水逻辑泄漏 |
| `record.registerSink({push: writeSSE...})` 把 Express Response 注册成 RunEventSink | controller 内联 | sink 适配逻辑泄漏 |
| `res.on('close', () => cleanup())` 断线清理 | controller 内联 | 同上 |
| resume 路径判断 `body.command?.resume !== undefined` | controller 内联 | 业务编排逻辑泄漏 |
| `since` 参数解析与校验 | controller 内联 | 应由 pipe/DTO 处理 |
| `lookupRun` 后根据 `instanceof NotFoundException` 分支返回 404/500 | controller 内联 | 异常 filter 本应处理 |

结果：controller 变成半个 service，难测、难复用。

### 1.2 `threads.controller.ts` 放在 `langgraph/` 目录语义错乱

```
apps/server/src/ai/
├── langgraph/
│   ├── graphs/                    # 真正的图编排
│   ├── nodes/
│   ├── types/
│   ├── langgraph-protocol.ts      # SSE 编码器
│   └── threads.controller.ts      # ⚠️ HTTP 入口不该在图定义目录里
├── run/
│   └── runs.controller.ts         # Run 相关 controller 在这里
└── thread/
    └── thread.service.ts          # Thread 只有 service，没有 controller（职责分裂）
```

`langgraph/` 按语义应该只放图编排相关代码（graphs/nodes/types/protocol）。HTTP 入口（controller）放在里面语义错乱；Thread 的 service 在 `thread/`、controller 却跑到 `langgraph/`，**职责归属分裂**。

### 1.3 评估时附带发现的问题

1. **路由冲突（潜在 bug）**：`threads.controller.ts` 和 `runs.controller.ts` 都注册了 `POST :threadId/runs/:runId/cancel`（同一个 `@Controller('threads')` 前缀）。NestJS 注册顺序决定哪个生效。

2. **Controller 直接用 Prisma**：`runs.controller.ts:34` 直接 `this.prisma.run.findMany(...)`，绕过了 service 层（违反分层）。

3. **`SkipResponseWrap()` 重复且无清晰边界**：两个 controller 都各自标 `@SkipResponseWrap()`，LangGraph SDK 协议和内部统一响应格式 `{success, data}` 是两套世界，目前靠 controller 级装饰器硬切，没有"协议边界"概念。

4. **协议 DTO 散落在 controller 文件里**：`CreateThreadBody` / `SearchThreadsBody` / `RunsStreamBody` / `LangGraphThread` 等类型内联在 `threads.controller.ts`，无法复用和独立测试。

### 1.4 架构文档已过期

`docs/backend/architecture.md` 描述的 AI 模块结构（`conversation/`、`dispatch/`、`message/`、`session/`、`workflow/`、`ws/`）与真实代码（`thread/`、`run/`、`store/`、`event/`、`checkpointer/`）完全不符。**本次重构不修复文档过期问题**（属另一范围），但目标目录结构会作为未来文档更新的基线。

---

## 2. 目标与范围

### 2.1 目标

1. 消除 `threads.controller.ts` 中的业务逻辑泄漏，让 controller 回归纯路由。
2. 把 controller 文件迁移到语义正确的位置（跟随 service 同目录）。
3. 修复路由冲突。
4. 消除 controller 直接用 Prisma 的分层违规。
5. 把协议胶水代码收敛到单一归属点。

### 2.2 范围内

- `threads.controller.ts`、`runs.controller.ts` 的迁移与瘦身
- `AiChatService` 新增 `streamRun` / `joinStream` 门面方法
- 新增 `sse-helpers.ts`、`RunQueryService`、DTO mapper 与 DTO 文件
- 新增与迁移相关单测

### 2.3 范围外

- 不引入 DDD（聚合、Repository、领域事件）—— 见 `docs/backend/ddd-redesign.md`，属另一范围
- 不改 Prisma schema
- 不改 `startRun` / `resumeFromCommand` / `executeRunProtocol` / `cancel` 的内部实现（仅 `streamRun`/`joinStream` 组合调用它们）
- 不改 `JoinStreamService` / `RunManager` / `ThreadService` 内部
- 不修复 `docs/backend/architecture.md` 过期问题
- 不引入 WebSocket 等新传输

---

## 3. 目标目录结构

```
apps/server/src/ai/
├── ai.module.ts
├── ai.service.ts                    # AiChatService（新增 streamRun/joinStream 编排入口）
│
├── thread/
│   ├── thread.service.ts            # 不变
│   ├── threads.controller.ts        # ← 从 langgraph/ 迁入；只保留 Thread CRUD + getThreadState
│   ├── thread-dto.mapper.ts         # ← 新增：内部 Thread ↔ LangGraphThread 映射
│   ├── langgraph-thread.dto.ts      # ← 新增：CreateThreadBody / SearchThreadsBody / UpdateThreadBody / LangGraphThread
│   └── __tests__/
│       └── threads.controller.spec.ts
│
├── run/
│   ├── runs.controller.ts           # ← 合并所有 Run 端点（listRuns/getRun/streamRun/cancel/joinStream）
│   ├── run-query.service.ts         # ← 新增：替代 controller 直接用 Prisma
│   ├── run-dto.mapper.ts            # ← 新增：Prisma Run ↔ RunDto + extractLastUserMessage
│   ├── langgraph-run.dto.ts         # ← 新增：RunsStreamBody
│   ├── sse-helpers.ts               # ← 从 langgraph/langgraph-protocol.ts 迁入并精简：writeSSE/setSseHeaders/sendProtocolError
│   ├── run-record.ts / run-manager.ts / join-stream.service.ts / ...  # 不变
│   └── __tests__/
│       ├── runs.controller.spec.ts   # ← 新增（覆盖 streamRun/cancel/join）
│       └── sse-helpers.spec.ts       # ← 从 langgraph-protocol.spec.ts 迁入并调整
│
├── langgraph/                        # ← 回归纯图编排语义
│   ├── graphs/
│   ├── nodes/
│   └── types/
│   # 不再有 threads.controller.ts / langgraph-protocol.ts
│
└── ... (llm/, tools/, store/, event/, checkpointer/, types/ 不变)
```

### 3.1 关键变化

1. `langgraph/` 目录回归本义 —— 只放图编排（graphs/nodes/types）。controller 和 SSE 协议代码全部迁出。
2. controller 跟随 service 同目录：`threads.controller.ts` → `thread/`，`runs.controller.ts` 留在 `run/`。
3. 路由冲突消除：Thread CRUD + getThreadState 归 `threads.controller`；所有 Run 相关（含 streamRun、cancel、join）归 `runs.controller`。`cancel` 只在一个地方注册。
4. 协议胶水集中：`sse-helpers.ts` 提供 3 个纯函数工具；调用点集中在 `AiChatService`。
5. 协议 DTO 独立成文件，可单测。

---

## 4. Controller 职责重新划分

### 4.1 `threads.controller.ts`（瘦身到 Thread CRUD + state）

```typescript
@Controller('threads')
@SkipResponseWrap()
export class ThreadsController {
    constructor(
        private readonly threadService: ThreadService,
        private readonly checkpointReader: CheckpointReaderService,
    ) {}

    @Post()            createThread(...)       // body → mapper → threadService.create
    @Post('search')    searchThreads(...)      // body → threadService.findAll → mapper[]
    @Get(':threadId')  getThread(...)          // threadService.findById → mapper
    @Patch(':threadId') updateThread(...)
    @Delete(':threadId') deleteThread(...)
    @Get(':threadId/state') getThreadState(...) // checkpointReader.getThreadState
}
```

**消除**：`streamRun` / `cancelRun` / `joinStream` / `setSseHeaders` / `sendProtocolError` / `extractLastUserMessage` / `toLangGraphThread` 全部迁出。依赖 `REPLICA_ID` / `JoinStreamService` / `AiChatService` / `writeSSE` 一并移除。

预计从 ~423 行 → ~80 行，纯路由 + DTO 转换。`NotFoundException` 由全局异常 filter 处理，controller 不 catch。

### 4.2 `runs.controller.ts`（合并所有 Run 端点）

```typescript
@Controller('threads')          // 路由前缀不变，保持 SDK 兼容
@SkipResponseWrap()
export class RunsController {
    constructor(
        private readonly aiService: AiChatService,
        private readonly runQueryService: RunQueryService,
        @Inject(REPLICA_ID) private readonly replicaId: string,
    ) {}

    // Run 查询
    @Get(':threadId/runs')           listRuns(...)
    @Get(':threadId/runs/:runId')    getRun(...)

    // Run 生命周期
    @Post(':threadId/runs/stream')        streamRun(...)
    @Post(':threadId/runs/:runId/cancel') cancelRun(...)   // 唯一注册点
    @Get(':threadId/runs/:runId/stream')  joinStream(...)
}
```

**关键设计**：
- `streamRun` 方法体收敛到 ~10 行：转发到 `aiService.streamRun(cmd, res)`，不 catch。
- `cancelRun` 保留 204/202 分支（依赖 `replicaId` 区分本副本 owner），取消逻辑委托 `aiService.cancel()`。
- `joinStream` 仅 catch `NotFoundException`（spec 3.5 硬约束：404 必须在 SSE flush 前以 JSON 返回），其他错误 service 内部已写成错误帧。

### 4.3 新增 `RunQueryService`（解决 controller 直接用 Prisma）

```typescript
// apps/server/src/run/run-query.service.ts
@Injectable()
export class RunQueryService {
    constructor(private prisma: PrismaService) {}
    listByThread(threadId: string, limit = 50) { /* prisma.run.findMany */ }
    findById(runId: string) { /* prisma.run.findUnique */ }
}
```

`runs.controller` 通过它查询 Run，不再直接持有 `PrismaService`。DTO 映射用 `run-dto.mapper.ts`。

---

## 5. Service 层接口扩展（AiChatService）

### 5.1 新增 `streamRun(cmd, res)` —— 统一新 run / resume 编排

```typescript
export interface StreamRunCommand {
    threadId: string;
    input?: { messages?: Array<{ type: string; content: string }> } | null;
    command?: { resume?: unknown } | null;
    context?: Record<string, unknown>;
    multitaskStrategy?: MultitaskStrategy;
}

export class InvalidRunInputError extends BadRequestException {}

class AiChatService {
    /**
     * 统一编排入口：设 SSE 头 → 判断 resume vs 新 run → 提取 user message →
     * 建 sink + registerSink → executeRunProtocol。controller 只需 await。
     *
     * 异常约定（service 内部 catch 并映射成 SSE 错误帧）：
     *   - InvalidRunInputError → code: 'invalid_input'
     *   - ConflictException    → code: 'busy'        (multitask reject)
     *   - 其他                 → code: 'execution_error'
     */
    async streamRun(cmd: StreamRunCommand, res: Response): Promise<void> {
        setSseHeaders(res);
        let unregister: () => void = () => {};
        try {
            let record: RunRecord;
            if (cmd.command?.resume !== undefined) {
                record = await this.resumeFromCommand(cmd.threadId, cmd.command);
            } else {
                const content = extractLastUserMessage(cmd.input?.messages ?? []);
                if (!content) throw new InvalidRunInputError('No user message in input');
                record = await this.startRun({
                    content, threadId: cmd.threadId, context: cmd.context,
                    multitaskStrategy: cmd.multitaskStrategy ?? 'reject',
                });
            }

            const sink: RunEventSink = {
                push: e => writeSSE(res, e.eventType, e.payload, e.seq),
                close: () => { if (!res.writableEnded) res.end(); },
            };
            unregister = record.registerSink(sink);
            await this.executeRunProtocol(record);
        } catch (error) {
            this.logger.error(`streamRun failed: ${(error as Error).message}`);
            const code = error instanceof InvalidRunInputError ? 'invalid_input'
                       : error instanceof ConflictException ? 'busy'
                       : 'execution_error';
            sendProtocolError(res, code, (error as Error).message);
        } finally {
            unregister();
            if (!res.writableEnded) res.end();
        }
    }
}
```

**变化点**：
- `extractLastUserMessage` 从 controller private method → `run-dto.mapper.ts` 中的模块级纯函数，可单测。
- resume 判断、message 提取、sink 注册、协议执行 —— 全部内聚到 service。
- 用明确的异常类型代替内联 `sendProtocolError`，错误码映射集中在 service。

### 5.2 新增 `joinStream(runId, since, res)` —— 统一重连编排

```typescript
class AiChatService {
    /**
     * 统一重连入口。
     *
     * 注意 spec 3.5 Step 1 约束：lookupRun 的 404 必须在 SSE flush 前返回。
     * 因此 lookupRun 抛 NotFoundException 时不设 SSE 头，直接向上抛出，
     * 让 controller 用 res.status(404).json(...) 返回。
     */
    async joinStream(runId: string, since: number, res: Response): Promise<void> {
        // 1. 先校验 run 存在（抛 NotFoundException 让 controller 返回 JSON）
        await this.joinStreamService.lookupRun(runId);

        // 2. 校验通过后才设 SSE 头
        setSseHeaders(res);
        const sink: RunEventSink = {
            push: e => writeSSE(res, e.eventType, e.payload, e.seq),
            close: () => { if (!res.writableEnded) res.end(); },
        };

        // 3. 注册断线清理
        let cleanup: () => void = () => {};
        res.on('close', () => cleanup());

        try {
            cleanup = await this.joinStreamService.joinStream(runId, since, sink);
        } catch (error) {
            this.logger.error(`joinStream failed: ${(error as Error).message}`);
            sendProtocolError(res, 'execution_error', (error as Error).message);
        }
    }
}
```

**关键设计**：
- `lookupRun` 校验抛 `NotFoundException` 时 `res` 尚未 flush，service 不 catch、直接向上抛，controller catch 后返回 404 JSON。
- 校验通过后才设 SSE 头，之后任何异常都只能写错误帧。
- 实际的回放 + 订阅逻辑继续委托给 `JoinStreamService`。
- `res.on('close')` 清理注册在 service（service 持有 `res`），cleanup 函数由 `JoinStreamService` 返回。

### 5.3 保留不变的方法

`startRun` / `resumeFromCommand` / `executeRunProtocol` / `cancel` 全部保留原签名，`streamRun`/`joinStream` 内部组合调用它们。这样：
- 现有测试不会全挂
- `streamRun` 只是新增的"门面方法"，不破坏既有接口
- 未来若有非 SSE 场景，可直接复用 `startRun` + 自定义 sink

---

## 6. SSE Helper 归属与胶水约定

### 6.1 `sse-helpers.ts`（从 `langgraph-protocol.ts` 迁移并精简）

```typescript
// apps/server/src/run/sse-helpers.ts

import type { Response } from 'express';

/** 写一条 SSE 事件。seq 作为标准 id: 行透传，供前端 joinStream 重连去重。 */
export function writeSSE(res: Response, event: string, data: unknown, seq?: number): void {
    if (!res.writableEnded) {
        const idLine = seq !== undefined ? `id: ${seq}\n` : '';
        res.write(`event: ${event}\n${idLine}data: ${JSON.stringify(data)}\n\n`);
    }
}

/** 设置 SSE 响应头并 flush。 */
export function setSseHeaders(res: Response): void {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
}

/** 写 SSE 错误帧并结束响应。 */
export function sendProtocolError(res: Response, code: string, message: string): void {
    if (!res.writableEnded) {
        res.write(`event: error\ndata: ${JSON.stringify({ error: code, message })}\n\n`);
        res.end();
    }
}
```

**变化**：
- 从 `langgraph/langgraph-protocol.ts` 迁到 `run/sse-helpers.ts`（语义归属正确 —— SSE 是 run streaming 的传输细节）。
- 删除 `writeMetadata` / `writeEnd` / `writeError`（现在这些事件都通过 `record.emitEvent` + sink 推送，不再由 controller 直接写）。
- 删除原文件 `langgraph/langgraph-protocol.ts`。

### 6.2 胶水归属决策（重要）

**决策**：SSE 胶水代码（建 sink、设 header、写错误帧、断线清理）内聚在 `AiChatService`，**不单独抽 adapter 文件**。

**理由**：`AiChatService` 已经是协议感知的（`executeRunProtocol` 里已经在主动发 `'metadata'`/`'values'`/`'end'`/`'error'` 这些 LangGraph 协议事件名），再多承担"Express Response → 事件流"这一层胶水不构成新的架构边界突破，反而消除了 sink vs res 的不对称。单一胶水归属点比分散的 adapter 更易维护。

**`RunEventSink` 接口保留**：`record.registerSink` 和 `joinStreamService.joinStream` 的内部契约依赖它，但 sink 对象在 service 方法内**内联构造**（不再单独建 adapter 文件）。

### 6.3 Controller 方法体（极简，纯路由）

```typescript
// runs.controller.ts
@Post(':threadId/runs/stream')
async streamRun(
    @Param('threadId') threadId: string,
    @Body() body: RunsStreamBody,
    @Res() res: Response,
): Promise<void> {
    await this.aiService.streamRun({ threadId, ...body }, res);
}

@Get(':threadId/runs/:runId/stream')
async joinStream(
    @Param('runId') runId: string,
    @Query('since') since: string | undefined,
    @Res() res: Response,
): Promise<void> {
    const n = Number.parseInt(since ?? '0', 10);
    try {
        await this.aiService.joinStream(runId, Number.isFinite(n) && n >= 0 ? n : 0, res);
    } catch (error) {
        if (!res.writableEnded && error instanceof NotFoundException) {
            // spec 3.5：404 必须在 SSE flush 前以 JSON 返回
            res.status(404).json({ error: 'not_found', message: (error as Error).message });
        }
        // 其他错误 service 内部已写成错误帧，无需处理
    }
}
```

### 6.4 Controller 方法体长度对比

| 方法 | 重构前 | 重构后 |
|---|---|---|
| `streamRun` | 60 行（含 resume 判断、message 提取、sink 注册、异常映射） | ~5 行（转发到 service） |
| `joinStream` | 53 行（含 since 解析、lookupRun、sink 构造、cleanup、错误分支） | ~10 行（since 解析 + 仅 catch NotFoundException） |
| `cancelRun` | 13 行 | 不变（依赖 replicaId 做 204/202） |

---

## 7. 错误处理边界与约定

### 7.1 分层职责

| 层 | 职责 | 抛出/处理方式 |
|---|---|---|
| **Controller** | 纯路由 + 入参解析 + DTO 映射 | 不 catch（除 `joinStream` 的 404 前置校验例外） |
| **AiChatService** | 编排 + SSE 胶水 + 协议错误帧映射 | 内部 try/catch，把业务异常映射成 `sendProtocolError(res, code, msg)` |
| **ThreadService / RunQueryService** | 数据访问 | 抛标准 NestJS 异常 |
| **JoinStreamService / RunManager** | 流式执行细节 | 抛领域异常，由上层 service 统一捕获 |

### 7.2 错误码约定（统一在 `AiChatService` 内部映射）

| 异常 | SSE 错误帧 code | HTTP 状态（非流式调用） |
|---|---|---|
| `InvalidRunInputError extends BadRequestException` | `invalid_input` | 400 |
| `ConflictException`（multitask reject） | `busy` | 409 |
| `NotFoundException`（run/thread 不存在，**非 joinStream**） | `not_found` | 404 |
| `NotFoundException`（**joinStream** 的 lookupRun） | —（不写帧） | controller 返回 404 JSON |
| 其他 Error | `execution_error` | 500 |

### 7.3 `joinStream` 的特殊例外

spec 3.5 Step 1 要求 404 在 SSE flush 前以 JSON 返回。所以 `lookupRun` 抛 `NotFoundException` 时 `res` 尚未 flush，service 不 catch、直接向上抛，controller catch 后返回 JSON。这是 controller 唯一需要 catch 的场景，且语义清晰（"流还没开始"）。校验通过后 service 设 SSE 头，之后任何异常都只能写错误帧。

---

## 8. 测试策略

### 8.1 Controller 单测（`runs.controller.spec.ts` 新增 / `threads.controller.spec.ts` 迁移瘦身）

**目标**：验证 controller 是纯路由 —— 只验证"调了 service 的哪个方法 + 传了什么参数"，不验证业务逻辑。

覆盖点：
- `streamRun`：验证只转发到 `aiService.streamRun({threadId, ...body}, res)`，调一次。
- `joinStream` 404 前置校验路径：service 抛 `NotFoundException` 时 `res.status(404).json` 被调用，且 `res.setHeader` 未被调用（SSE 头未设）。
- `joinStream` since 参数解析：`'10'→10`、`'abc'→0`、`undefined→0`。
- `cancelRun`：本副本 owner 返回 202、非 owner 返回 204。
- `listRuns` / `getRun`：转发到 `runQueryService`。

### 8.2 Service 单测（`ai.service.spec.ts` 新增，重点覆盖新方法）

**目标**：覆盖 `streamRun` / `joinStream` 的编排逻辑 + 错误映射。

`streamRun` 覆盖点：
- `command.resume` 存在时路由到 `resumeFromCommand`，不调 `startRun`。
- input 无 user message 时写 `invalid_input` 错误帧（异常被内部 catch，不抛出）。
- `startRun` 抛 `ConflictException` 时写 `busy` 错误帧。
- 成功路径：建 sink + registerSink + executeRunProtocol。
- `executeRunProtocol` 抛异常时 finally 块仍 unregister sink。
- 所有路径结束后 `res.end` 被调用（若未 ended）。

`joinStream` 覆盖点：
- run 不存在时抛 `NotFoundException`（service 不 catch），`res.setHeader` 未调用。
- lookup 成功后设 SSE 头并委托 `joinStreamService.joinStream`。
- `joinStream` 执行中抛异常时写 `execution_error` 错误帧。
- `res.on('close')` 注册 cleanup。

### 8.3 Helper 单测（`sse-helpers.spec.ts` 新增）

**目标**：覆盖 SSE 帧格式正确性（被多模块复用的底层工具）。

覆盖点：
- `writeSSE`：event + data 行格式；seq 提供/不提供时的 id 行；`res.writableEnded` 时跳过。
- `sendProtocolError`：写错误帧并 end；`res` 已 ended 时 no-op。

### 8.4 Mapper 单测（`thread-dto.mapper.spec.ts` / `run-dto.mapper.spec.ts` 新增）

**目标**：覆盖内部模型 ↔ LangGraph 协议 DTO 的转换。

覆盖点：
- `toLangGraphThread`：映射字段、省略 null 字段。
- `extractLastUserMessage`：提取最后一个 human message 内容；无 human message 时返回 undefined。

### 8.5 路由冲突回归测试（集成层）

**目标**：防回归 —— 确保两个 controller 不再注册同一个 cancel 路由。

实现方式（二选一，writing-plans 阶段定）：
- 方式 A：通过 NestJS `HttpAdapterHost` 列路由，断言 `POST /threads/:threadId/runs/:runId/cancel` 只出现一次。
- 方式 B：静态扫描 `grep -rn "runs/:runId/cancel" apps/server/src/ai`，断言只匹配一处。

### 8.6 现有测试迁移

- `langgraph/__tests__/threads.controller.spec.ts` → `thread/__tests__/threads.controller.spec.ts`，删除 streamRun/cancel/joinStream 用例（迁到 `run/__tests__/runs.controller.spec.ts`）。
- `langgraph/__tests__/langgraph-protocol.spec.ts` → `run/__tests__/sse-helpers.spec.ts`，调整断言到新的 3 个函数。

### 8.7 不测的东西

- 不测 `startRun` / `resumeFromCommand` / `executeRunProtocol` 的内部行为 —— 签名不变，已有覆盖。
- 不测 `JoinStreamService` / `RunManager` 内部 —— 同上。
- 不做全量 e2e（保留现有 e2e 不动，仅新增路由冲突回归）。

---

## 9. 迁移步骤（高层级，供 writing-plans 细化）

建议的提交粒度（每步可独立编译、测试通过）：

1. **抽 DTO + Mapper（无行为变更）**
   - 新增 `thread/langgraph-thread.dto.ts`、`thread/thread-dto.mapper.ts`、`run/langgraph-run.dto.ts`、`run/run-dto.mapper.ts`。
   - 把内联在 `threads.controller.ts` 的类型和 `extractLastUserMessage` 迁到这些文件。
   - controller import 新文件，原行为不变。

2. **抽 `RunQueryService`（无行为变更）**
   - 新增 `run/run-query.service.ts`，把 `runs.controller.ts` 里的 Prisma 查询迁入。
   - controller 注入 `RunQueryService` 替代 `PrismaService`。
   - 注册到 `ai.module.ts`。

3. **迁移 `sse-helpers.ts`（无行为变更）**
   - 新建 `run/sse-helpers.ts`，从 `langgraph/langgraph-protocol.ts` 迁 `writeSSE`/`setSseHeaders`/`sendProtocolError`。
   - 删除 `writeMetadata`/`writeEnd`/`writeError`（已无调用方）。
   - 更新 import。删除原 `langgraph-protocol.ts`。迁移 spec 文件。

4. **新增 service 编排入口**
   - `AiChatService` 新增 `streamRun(cmd, res)` / `joinStream(runId, since, res)`。
   - 新增 `InvalidRunInputError`。
   - 新增对应的 service 单测。

5. **瘦身 controller**
   - `threads.controller.ts`：删除 `streamRun`/`cancelRun`/`joinStream` 及相关 private methods（迁出后无引用）。
   - `runs.controller.ts`：合并 `streamRun`/`cancelRun`/`joinStream`，方法体收敛。
   - 更新 controller 单测。

6. **迁移文件位置 + 修复路由冲突**
   - `langgraph/threads.controller.ts` → `thread/threads.controller.ts`。
   - 更新 `ai.module.ts` 的 controller 注册路径。
   - 删除 `runs.controller.ts` 里原有的 `cancelRun`（已被合并版覆盖），确认 `cancel` 只注册一次。
   - 迁移 `langgraph/__tests__/threads.controller.spec.ts` → `thread/__tests__/`。

7. **路由冲突回归测试**
   - 新增集成测试断言 cancel 路由唯一。

---

## 10. 已知权衡

### 10.1 `AiChatService` 依赖 Express `Response` 类型

**代价**：
- **可测性**：service 单测需要 mock `res`（setHeader/flushHeaders/write/end/writableEnded/on）—— 可接受，已有 `threads.controller.spec.ts` 里的 mock response 模式可复用。
- **复用性**：若未来要把 run streaming 接到 WebSocket 而非 SSE，需要重抽 sink 边界。当前所有 streaming 都是 HTTP/SSE，无 WS 计划，可接受。

**收益**：controller 极简（纯路由）+ SSE 胶水单一归属点（不用在 controller 和 service 间来回切）+ 两个 service 方法签名对称（都接 `res`）。

### 10.2 `joinStream` 404 校验不对称

`streamRun` controller 不 catch 任何异常；`joinStream` controller 只 catch `NotFoundException`。这是 spec 3.5 硬约束导致的必然不对称，已在 7.3 说明。

### 10.3 未修复的更大问题（显式标记范围外）

- `docs/backend/architecture.md` 与实际代码不符 —— 属文档维护，另一范围。
- DDD 重构（聚合/Repository/领域事件）—— 见 `docs/backend/ddd-redesign.md`，另一范围。
- 协议边界（LangGraph SDK 协议 vs 内部 `{success, data}` 响应）未引入显式抽象 —— 本次仅靠 `@SkipResponseWrap()` 区分，符合现状最小改动。

---

## 附录 A：受影响文件清单

| 文件 | 操作 |
|---|---|
| `apps/server/src/ai/langgraph/threads.controller.ts` | 删除（迁出） |
| `apps/server/src/ai/thread/threads.controller.ts` | 新增（迁移 + 瘦身） |
| `apps/server/src/ai/run/runs.controller.ts` | 修改（合并 + 瘦身） |
| `apps/server/src/ai/run/run-query.service.ts` | 新增 |
| `apps/server/src/ai/run/sse-helpers.ts` | 新增（从 `langgraph-protocol.ts` 迁移） |
| `apps/server/src/ai/run/run-dto.mapper.ts` | 新增 |
| `apps/server/src/ai/run/langgraph-run.dto.ts` | 新增 |
| `apps/server/src/ai/thread/thread-dto.mapper.ts` | 新增 |
| `apps/server/src/ai/thread/langgraph-thread.dto.ts` | 新增 |
| `apps/server/src/ai/langgraph/langgraph-protocol.ts` | 删除 |
| `apps/server/src/ai/ai.service.ts` | 修改（新增 streamRun/joinStream + InvalidRunInputError） |
| `apps/server/src/ai/ai.module.ts` | 修改（更新 controller 注册 + 注册 RunQueryService） |
| `apps/server/src/ai/langgraph/__tests__/threads.controller.spec.ts` | 删除（迁出） |
| `apps/server/src/ai/thread/__tests__/threads.controller.spec.ts` | 新增（迁移 + 瘦身） |
| `apps/server/src/ai/run/__tests__/runs.controller.spec.ts` | 新增 |
| `apps/server/src/ai/run/__tests__/sse-helpers.spec.ts` | 新增（从 langgraph-protocol.spec.ts 迁移） |
| `apps/server/src/ai/__tests__/ai.service.spec.ts`（若存在则改，否则新建） | 新增（streamRun/joinStream 单测） |
| `apps/server/src/ai/thread/__tests__/thread-dto.mapper.spec.ts` | 新增 |
| `apps/server/src/ai/run/__tests__/run-dto.mapper.spec.ts` | 新增 |
| 路由冲突回归测试文件 | 新增 |
