# Plan: MessageStore + Provider 架构重构

## Problem Statement

用户消息和 LLM 回复的消息持久化逻辑耦合在 `Executor.execute()` 方法中。虽然 commit 1df6019 已经修复了"assistant 消息未存储"的 bug，但架构上：
- `Executor` 直接调用 `MessageService` 4 次 `create()` 和 2 次 `buildLLMHistory()`
- 消息组装（用户/助手/tool 格式）和存储逻辑散落在 execute 流程中
- `Executor` 既负责编排控制流，又负责数据持久化细节
- `AgentExecutor` 完全不持久化消息
- `llm-node.ts:60-62` 追加 `state.messages` 是死代码（被 DB reload 覆盖）
- 当前 `MessageService` 与 Prisma 强耦合，无法切换存储方式

目标：引入 `MessageStore` (业务层) + `MessageStoreProvider` (存储层) 两层抽象，将消息组装、存储策略与具体存储实现完全解耦。`execute()` 只负责控制各模块执行顺序。

## Architecture Diagram

```
重构后架构 — 三层分离
══════════════════════════════════════════════════════════════════

  Executor.execute()                    MessageStore                   Provider
  ┌──────────────────────┐          ┌──────────────────────┐     ┌──────────────────┐
  │ 1. messageStore.init()│─────────→│ init():              │     │                  │
  │ 2. messageStore.      │─────────→│  load from provider  │     │                  │
  │    persistUser()      │─────────→│  persistUser():      │────→│ create(record)   │
  │ 3. messageStore.      │         │  → provider.create() │     │ createMany(...)  │
  │    buildHistory()     │←────────│  → memory.push()     │←────│ findByRoom()     │
  │ 4. graph.stream()     │         │                      │     │ aggregateTokens()│
  │    └─ llm-node        │         │ buildHistory():      │     │                  │
  │    └─ tool-node       │         │  → from memory, O(1) │     │ Prisma:          │
  │ 5. messageStore.      │         │                      │     │   PostgreSQL 表  │
  │    roundTx()          │─────────→│ roundTx():           │     │                  │
  │    (assistant+tools)  │─────────→│  → provider.         │────→│ Jsonl:           │
  │ 6. messageStore.      │         │    createMany()      │     │   .jsonl 文件     │
  │    buildHistory()     │←────────│                      │     │                  │
  │    (loop back to 4)   │         │                      │     │                  │
  │ 7. messageStore.      │─────────→│ persistFinal():      │────→│                  │
  │    persistFinal()     │─────────→│  → provider.create() │     │                  │
  └──────────────────────┘          └──────────────────────┘     └──────────────────┘

  依赖: MessageStore (接口),           依赖: MessageStoreProvider (接口)
        GraphRegistry, LLMResolver,
        ToolDispatcher, ToolRouter
```

```
依赖注入架构
══════════════════════════════════════════════════════════════════

  AiModule
    ├── MessageStore (单例, 注入到 Executor)
    │     └── MessageStoreProvider (通过 Symbol token 注入)
    │           ├── PrismaMessageStoreProvider  (默认)
    │           └── JsonlMessageStoreProvider   (可选)
    │
    ├── Executor (per-request, 注入 MessageStore)
    │
    └── 配置切换: APP_MESSAGE_STORE_PROVIDER=prisma|jsonl

  切换流程:
    1. 修改 .env: APP_MESSAGE_STORE_PROVIDER=jsonl
    2. NestJS useFactory 根据配置创建对应 Provider
    3. MessageStore 代码零修改 — 它只依赖 Provider 接口
```

```
目录结构
══════════════════════════════════════════════════════════════════

  apps/server/src/ai/message/
    ├── message-store.interface.ts          ← MessageStore 接口 (业务层)
    ├── message-store.impl.ts               ← MessageStore 实现
    ├── message-store.types.ts              ← MessageRecord 类型定义
    ├── providers/
    │   ├── message-store-provider.interface.ts  ← Provider 接口
    │   ├── prisma-message-store.provider.ts     ← Prisma 实现
    │   ├── jsonl-message-store.provider.ts      ← JSONL 实现
    │   └── index.ts
    └── index.ts

  修改:
    executor.ts                          ← 替换 messageService → messageStore
    executor.types.ts                    ← ExecutorDependencies 替换
    ai.module.ts                         ← Provider 注册 + useFactory
    langgraph/nodes/llm-node.ts          ← 移除 state.messages 死代码
    langgraph/types/workflow.types.ts    ← 移除 WorkflowState.messages
```

## Decisions Made

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | MessageStore + Provider 两层抽象 | Store 管业务（格式转换/内存管理/事务语义），Provider 管存储（CRUD） |
| 2 | 统一 MessageRecord 类型 | 所有 Provider 映射到同一结构，Store 零修改切换 Provider |
| 3 | 接口按操作语义拆分 | persistUser / persistAssistant / persistToolResult / buildHistory |
| 4 | 内存状态缓存 | Store 内部维护内存数组，首次加载后增量更新 |
| 5 | Round 级事务 | Provider.createMany() 保证 assistant + N tool results 原子写入 |
| 6 | 移除 state.messages 死代码 | 不被消费的写入 |
| 7 | 抽取 BaseExecutor | 共享 graph 循环，差异化策略模式 |
| 8 | AgentExecutor 保持独立 | 不同通信模式，通过基类共享循环 |
| 9 | NestJS DI + 配置切换 | useFactory + Symbol token，环境变量一键切换 |
| 10 | 完整补齐测试 | 所有新/改路径都有测试 |

## Implementation Steps

### Step 1: 定义 MessageRecord 类型和 Provider 接口

```typescript
// apps/server/src/ai/message/message-store.types.ts

/** 统一的消息记录结构 — 所有 Provider 必须映射到此格式 */
export interface MessageRecord {
  id: string;
  roomId: string;
  role: string;              // 'user' | 'assistant' | 'tool' | 'system'
  content: string | null;
  toolCalls?: InFlightToolCall[];
  toolResultId?: string;
  tokenCount?: number;
  finishReason?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

// apps/server/src/ai/message/providers/message-store-provider.interface.ts

export interface MessageStoreProvider {
  /** 创建单条消息 */
  create(record: Omit<MessageRecord, 'id' | 'createdAt'>): Promise<MessageRecord>;

  /** 批量创建（事务语义） */
  createMany(records: Array<Omit<MessageRecord, 'id' | 'createdAt'>>): Promise<MessageRecord[]>;

  /** 查询房间消息 */
  findByRoom(roomId: string, opts?: { limit?: number; offset?: number; orderBy?: 'asc' | 'desc' }): Promise<MessageRecord[]>;

  /** 聚合 token 使用量 */
  aggregateTokens(roomId: string): Promise<number>;

  /** 可选：健康检查 */
  healthCheck?(): Promise<boolean>;
}
```

### Step 2: 实现 PrismaMessageStoreProvider

```typescript
// apps/server/src/ai/message/providers/prisma-message-store.provider.ts

@Injectable()
export class PrismaMessageStoreProvider implements MessageStoreProvider {
  constructor(private prisma: PrismaService) {}

  async create(record) {
    const result = await this.prisma.message.create({
      data: { /* record → Prisma data */ },
    });
    return this._toRecord(result);
  }

  async createMany(records) {
    // Prisma 事务: $transaction
    const results = await this.prisma.$transaction(
      records.map(r => this.prisma.message.create({ data: { /* ... */ } }))
    );
    return results.map(r => this._toRecord(r));
  }

  async findByRoom(roomId, opts) { /* ... */ }
  async aggregateTokens(roomId) { /* ... */ }

  private _toRecord(dbRow: any): MessageRecord { /* 映射 */ }
}
```

### Step 3: 实现 JsonlMessageStoreProvider

```typescript
// apps/server/src/ai/message/providers/jsonl-message-store.provider.ts

@Injectable()
export class JsonlMessageStoreProvider implements MessageStoreProvider {
  private baseDir: string;

  constructor(config: { dataDir: string }) {
    this.baseDir = path.join(config.dataDir, 'messages');
  }

  private _filePath(roomId: string): string {
    return path.join(this.baseDir, `${roomId}.jsonl`);
  }

  async create(record) {
    const entry: MessageRecord = {
      ...record,
      id: generateId(),
      createdAt: new Date(),
    };
    const line = JSON.stringify(entry) + '\n';
    await fs.appendFile(this._filePath(record.roomId), line, 'utf-8');
    return entry;
  }

  async createMany(records) {
    // JSONL 天然追加写入，逐条 append 即可（原子性由文件系统保证）
    const results: MessageRecord[] = [];
    for (const record of records) {
      results.push(await this.create(record));
    }
    return results;
  }

  async findByRoom(roomId, opts) {
    const file = this._filePath(roomId);
    if (!existsSync(file)) return [];
    const content = await fs.readFile(file, 'utf-8');
    const records = content
      .trim()
      .split('\n')
      .filter(Boolean)
      .map(line => JSON.parse(line) as MessageRecord);
    // 应用 limit/offset/orderBy 过滤
    return this._applyOptions(records, opts);
  }

  async aggregateTokens(roomId) {
    const records = await this.findByRoom(roomId);
    return records.reduce((sum, r) => sum + (r.tokenCount ?? 0), 0);
  }
}
```

### Step 4: 定义 MessageStore 接口和实现

```typescript
// apps/server/src/ai/message/message-store.interface.ts

export interface MessageStore {
  /** 初始化：从 Provider 加载历史到内存 */
  init(roomId: string, maxTokens?: number): Promise<void>;

  /** 持久化用户消息 */
  persistUser(content: string): Promise<void>;

  /** 持久化助手消息（含 tool calls） */
  persistAssistant(content: string, toolCalls?: InFlightToolCall[]): Promise<void>;

  /** 持久化工具结果 */
  persistToolResult(toolResultId: string, content: string): Promise<void>;

  /** 批量持久化 round 数据（assistant + tool results，事务语义） */
  persistRound(assistantContent: string, toolCalls: InFlightToolCall[], toolResults: Record<string, unknown>): Promise<void>;

  /** 构建 LLM 历史（从内存，O(1)） */
  buildHistory(): LLMMessage[];

  /** 获取 token 使用量 */
  getTokenUsage(): number;
}
```

```typescript
// apps/server/src/ai/message/message-store.impl.ts

@Injectable()
export class MessageStoreImpl implements MessageStore {
  private roomId!: string;
  private memory: MessageRecord[] = [];
  private tokenUsage = 0;

  constructor(
    @Inject(MESSAGE_STORE_PROVIDER_TOKEN)
    private provider: MessageStoreProvider,
  ) {}

  async init(roomId: string, maxTokens?: number) {
    this.roomId = roomId;
    this.memory = await this.provider.findByRoom(roomId, { orderBy: 'asc' });
    if (maxTokens !== undefined) {
      this.memory = this._trimToTokenLimit(this.memory, maxTokens);
    }
    this.tokenUsage = await this.provider.aggregateTokens(roomId);
  }

  async persistUser(content: string) {
    const record = await this.provider.create({
      roomId: this.roomId,
      role: 'user',
      content,
    });
    this.memory.push(record);
  }

  async persistRound(
    assistantContent: string,
    toolCalls: InFlightToolCall[],
    toolResults: Record<string, unknown>,
  ) {
    const records: Array<Omit<MessageRecord, 'id' | 'createdAt'>> = [
      { roomId: this.roomId, role: 'assistant', content: assistantContent, toolCalls },
      ...Object.entries(toolResults).map(([toolId, result]) => ({
        roomId: this.roomId,
        role: 'tool' as const,
        content: typeof result === 'string' ? result : JSON.stringify(result),
        toolResultId: toolId,
      })),
    ];

    // Provider.createMany 保证事务语义
    const persisted = await this.provider.createMany(records);
    this.memory.push(...persisted);
  }

  async persistFinal(assistantContent: string) {
    const record = await this.provider.create({
      roomId: this.roomId,
      role: 'assistant',
      content: assistantContent,
    });
    this.memory.push(record);
  }

  buildHistory(): LLMMessage[] {
    // 直接从内存转换，无需查 DB
    return this.memory.map(r => this._toLLMMessage(r));
  }

  private _toLLMMessage(record: MessageRecord): LLMMessage {
    if (record.role === 'tool' && record.toolResultId) {
      return {
        role: 'tool',
        content: [{ type: 'tool_result', tool_use_id: record.toolResultId, content: record.content ?? '' }],
      };
    }
    return { role: record.role as 'user' | 'assistant' | 'tool', content: record.content ?? '' };
  }

  private _trimToTokenLimit(records: MessageRecord[], maxTokens: number): MessageRecord[] {
    // 从后向前累加 token，超过 maxTokens 截断
    let total = 0;
    const result: MessageRecord[] = [];
    for (let i = records.length - 1; i >= 0; i--) {
      const tokens = records[i].tokenCount ?? Math.ceil((records[i].content?.length ?? 0) / 4);
      if (total + tokens > maxTokens) break;
      result.unshift(records[i]);
      total += tokens;
    }
    return result;
  }
}
```

### Step 5: 注册 Provider（NestJS DI + 配置切换）

```typescript
// apps/server/src/ai/ai.module.ts

export const MESSAGE_STORE_PROVIDER_TOKEN = Symbol('MESSAGE_STORE_PROVIDER');

@Module({
  imports: [ConfigModule, PrismaModule],
  providers: [
    MessageStoreImpl,

    // Provider 工厂 — 根据配置切换实现
    {
      provide: MESSAGE_STORE_PROVIDER_TOKEN,
      useFactory: (config: ConfigService, prisma: PrismaService) => {
        const providerType = config.get<string>('MESSAGE_STORE_PROVIDER', 'prisma');

        switch (providerType) {
          case 'prisma':
            return new PrismaMessageStoreProvider(prisma);
          case 'jsonl':
            return new JsonlMessageStoreProvider({
              dataDir: config.get<string>('DATA_DIR', './data'),
            });
          default:
            throw new Error(`Unknown MESSAGE_STORE_PROVIDER: ${providerType}`);
        }
      },
      inject: [ConfigService, PrismaService],
    },

    // ... 其他 providers
  ],
  exports: [MessageStoreImpl],
})
export class AiModule {}
```

### Step 6: 抽取 BaseExecutor

```typescript
// apps/server/src/ai/workflow/base-executor.ts

export abstract class BaseExecutor {
  protected graphCache = new Map<string, CompiledWorkflowGraph>();
  protected maxToolRounds = 10;

  protected getOrCreateGraph(graphDef: BaseGraph): CompiledWorkflowGraph {
    const cacheKey = graphDef.name;
    if (!this.graphCache.has(cacheKey)) {
      this.graphCache.set(cacheKey, graphDef.createGraph());
    }
    return this.graphCache.get(cacheKey)!;
  }

  protected createLLMCaller(configMap?: NodeLLMConfigMap, defaultConfig?: LLMConfig) {
    return async function* (messages: LLMMessage[], signal?: AbortSignal) {
      const provider = this.llmResolver.resolve('llm_call', configMap, defaultConfig);
      const tools = this.toolDispatcher.getDefinitions();
      yield* provider.chat(messages, tools, signal);
    }.bind(this);
  }

  /**
   * 通用 tool loop — 子类只需实现持久化和通信
   */
  protected async runToolLoop(
    graph: CompiledWorkflowGraph,
    initialState: Partial<WorkflowState>,
    configurable: Partial<GraphConfig>,
  ): Promise<{ lastState: Partial<WorkflowState> | null; hadToolCalls: boolean }> {
    let round = 0;
    let hadToolCalls = false;
    let lastState: Partial<WorkflowState> | null = null;

    while (round < this.maxToolRounds) {
      round++;

      if (this.isAborted()) {
        this.onAbort();
        return { lastState, hadToolCalls };
      }

      const stream = await graph.stream(initialState, { configurable });
      for await (const state of stream) {
        lastState = state as Partial<WorkflowState>;
        if (this.isAborted()) {
          this.onAbort();
          return { lastState, hadToolCalls };
        }
      }

      if (!lastState?.hasToolCalls || !lastState.pendingToolCalls?.length) {
        break;
      }

      hadToolCalls = true;

      // 子类实现持久化
      await this.persistRound(lastState);

      // 子类实现工具路由和事件发射
      await this.routeToolCalls(lastState.pendingToolCalls);

      // 等待工具结果
      const results = await this.waitForToolResults(lastState.pendingToolCalls);
      if (!results) {
        this.onTimeout(lastState.pendingToolCalls);
        break;
      }

      // 准备下一轮
      initialState.pendingToolCalls = [];
      initialState.hasToolCalls = false;
      initialState.toolResults = results;
      this.onToolResults(results);
    }

    return { lastState, hadToolCalls };
  }

  // 抽象方法
  protected abstract persistRound(state: Partial<WorkflowState>): Promise<void>;
  protected abstract persistFinal(state: Partial<WorkflowState>): Promise<void>;
  protected abstract routeToolCalls(toolCalls: InFlightToolCall[]): Promise<void>;
  protected abstract waitForToolResults(toolCalls: InFlightToolCall[]): Promise<Record<string, unknown> | null>;
  protected abstract onToolResults(results: Record<string, unknown>): void;
  protected abstract onTimeout(toolCalls: InFlightToolCall[]): void;
  protected abstract isAborted(): boolean;
  protected abstract onAbort(): void;
}
```

### Step 7: 重构 Executor

```typescript
// apps/server/src/ai/workflow/executor.ts

export class Executor extends BaseExecutor {
  constructor(
    private ctx: ExecutionCtx,
    private deps: ExecutorDependencies,  // 含 MessageStore 替代 MessageService
  ) {
    super();
  }

  async execute(): Promise<void> {
    const graph = this.getOrCreateGraph(this.deps.graphRegistry.get(this.ctx.graphName));
    const llmCaller = this.createLLMCaller(this.ctx.llmConfigMap, this.ctx.defaultConfig);

    // 通过 MessageStore 加载历史
    await this.deps.messageStore.init(this.ctx.roomId, this.ctx.tokenLimit);
    await this.deps.messageStore.persistUser(this.ctx.content);
    const history = this.deps.messageStore.buildHistory();

    const configurable: Partial<GraphConfig> = {
      llmCaller,
      tools: this.deps.toolDispatcher.getDefinitions(),
      onChunk: (chunk) => this.ctx.callbacks.onTextChunk(this.ctx.roomId, chunk),
    };

    const initialState: Partial<WorkflowState> = {
      messages: [...history],
      roomId: this.ctx.roomId,
      // ...
    };

    const { lastState, hadToolCalls } = await this.runToolLoop(graph, initialState, configurable);

    if (!hadToolCalls && lastState?.lastAssistantMessage) {
      await this.deps.messageStore.persistFinal(lastState.lastAssistantMessage);
    }

    this.ctx.callbacks.onLlmDone(this.ctx.roomId);
  }

  // BaseExecutor 抽象方法实现
  protected async persistRound(state: Partial<WorkflowState>) {
    await this.deps.messageStore.persistRound(
      state.lastAssistantMessage || '',
      state.pendingToolCalls || [],
      state.toolResults || {},
    );
  }

  protected async persistFinal(state: Partial<WorkflowState>) {
    await this.deps.messageStore.persistFinal(state.lastAssistantMessage || '');
  }

  // ... 其余抽象方法
}
```

### Step 8: 重构 AgentExecutor

```typescript
// apps/server/src/ai/agents/agent-executor.ts

export class AgentExecutor extends BaseExecutor {
  async execute(): Promise<{ output: string }> {
    // 离线模式：不需要持久化，内存状态即可
    const graph = this.getOrCreateGraph(/* ... */);
    // ... 初始化 state（纯内存）

    const { lastState } = await this.runToolLoop(graph, initialState, configurable);
    return { output: lastState?.lastAssistantMessage ?? '' };
  }

  protected async persistRound() { /* 空实现 — 离线模式不需要持久化 */ }
  protected async persistFinal() { /* 空实现 */ }
  // ...
}
```

### Step 9: 清理 llm-node 死代码

```
文件: apps/server/src/ai/langgraph/nodes/llm-node.ts
- 移除 state.messages 追加（line 60-62）

文件: apps/server/src/ai/langgraph/types/workflow.types.ts
- WorkflowStateAnnotation 移除 messages Reducer
- WorkflowState 移除 messages 字段
```

### Step 10: 更新类型定义

```
文件: apps/server/src/ai/workflow/executor.types.ts
- ExecutorDependencies.messageService → messageStore: MessageStore
```

## Test Plan

### Provider 测试 (新建 `message/providers/__tests__/prisma-message-store.provider.spec.ts`)
- [ ] create 写入 DB 并返回 MessageRecord
- [ ] createMany 事务成功（全部写入 / 全部回滚）
- [ ] findByRoom 分页 + 排序
- [ ] aggregateTokens 聚合计算
- [ ] _toRecord 映射正确性

### Provider 测试 (新建 `message/providers/__tests__/jsonl-message-store.provider.spec.ts`)
- [ ] create 追加写入 JSONL 文件
- [ ] createMany 逐条追加
- [ ] findByRoom 从文件读取并解析
- [ ] 文件不存在时返回空数组
- [ ] aggregateTokens 从文件计算

### MessageStore 测试 (新建 `message/__tests__/message-store.spec.ts`)
- [ ] init 从 Provider 加载到内存
- [ ] persistUser → provider.create + memory.push
- [ ] persistRound → provider.createMany + memory.push (多条)
- [ ] persistFinal → provider.create + memory.push
- [ ] buildHistory 返回内存转换（不调用 Provider）
- [ ] _trimToTokenLimit 截断逻辑

### Executor 测试 (新建 `workflow/__tests__/executor.spec.ts`)
- [ ] 无 tool 场景 — 用户消息 + assistant 消息通过 MessageStore 持久化
- [ ] 有 tool 场景 — round 事务持久化
- [ ] tool timeout — 超时后中断
- [ ] error handling — graph 异常时 emit error
- [ ] max rounds exceeded
- [ ] abort signal
- [ ] onLlmDone callback

### BaseExecutor 测试 (新建 `workflow/__tests__/base-executor.spec.ts`)
- [ ] graph stream 正常循环
- [ ] abort 检查 (stream 前 / stream 中)
- [ ] maxToolRounds 限制
- [ ] graph 缓存
- [ ] 抽象方法被正确调用

### MessageService 测试 (新建 `message/__tests__/message.service.spec.ts`)
- [ ] create 各角色消息
- [ ] findByRoomId 分页 + 排序
- [ ] buildLLMHistory 三种格式转换
- [ ] trimToTokenLimit 边界条件

## Failure Modes

| 代码路径 | 可能失败 | 测试覆盖 | 错误处理 | 用户体验 |
|----------|----------|----------|----------|----------|
| Provider.create() | DB/文件写入失败 | [GAP] | throw → 事务回滚 | 用户消息丢失 |
| Provider.createMany() | 部分写入 | [GAP] | Prisma transaction | assistant 或 tool 丢失 |
| Provider.findByRoom() | 文件损坏 (JSONL) | [GAP] | skip invalid lines | 丢失部分历史 |
| MessageStore.buildHistory() | 内存状态不一致 | [GAP] | 从 Provider 重新加载 | LLM 收到错误历史 |
| MessageStore.init() | Provider 不可用 | [GAP] | throw → error callback | 对话无法开始 |
| BaseExecutor.runToolLoop() | graph 内部错误 | 需要测试 | catch → error callback | 错误反馈给前端 |

**Critical Gaps:**
1. JSONL Provider 文件损坏无恢复机制 — 需要 backup/repair 策略
2. MessageStore 内存/Provider 不一致 — DB 写入失败后内存状态需要回滚
3. BaseExecutor 抽象方法 mock 测试设计 — 需要仔细构造 mock 子类

## NOT in scope

| 项目 | 原因 |
|------|------|
| AgentExecutor 工具调用支持 | 需要前端工具结果传输协议 |
| LangGraph Checkpointer 集成 | checkpoint blob 与 MessageRecord 格式不匹配 |
| WebSocket 协议变更 | 纯后端重构 |
| 前端代码改动 | 纯后端重构 |
| Redis/Vector DB Provider | 当前只实现 Prisma + JSONL，其他按需新增 |
| 消息加密 | 存储层职责之外，可在 Provider 内部装饰 |

## What already exists

| 现有代码 | 功能 | 是否复用 |
|----------|------|----------|
| MessageService | DB CRUD + 格式转换 | 是 — PrismaProvider 内部复用 |
| GraphRegistry | 图编译缓存 | 是 — 移到 BaseExecutor |
| LLMResolver | LLM 实例解析 | 是 — 移到 BaseExecutor |
| ToolDispatcher | 工具结果等待 | 是 — 保留在 Executor |
| ToolRouter | 工具路由确认 | 是 — 保留在 Executor |
| AgentExecutor 测试 | 3 个测试 | 是 — 更新为使用基类 |

## TODOS.md

### TODO-1: AgentExecutor 工具调用支持
- **What:** AgentExecutor 不支持前端工具调用（warn + break）
- **Why:** 多 Agent 场景中如果 Agent 需要调用工具，当前无法完成
- **Depends on:** 需要定义 Agent 工具结果传输协议

### TODO-2: LangGraph Checkpointer 探索
- **What:** 评估是否可以同时使用 LangGraph Checkpointer 做 state 级 fault-tolerance
- **Why:** 当前如果 server 重启，正在进行的对话无法恢复
- **Blocked by:** 需要先评估 checkpoint 格式与现有 Message 模型的兼容性

### TODO-3: JSONL Provider 备份策略
- **What:** JSONL 文件损坏后的恢复机制
- **Why:** 本地文件存储没有数据库级别的 ACID 保证
- **Depends on:** 需要确定 backup 频率和 retention 策略

### TODO-4: 消息历史分页加载
- **What:** 超长对话（1000+ 消息）的 init 阶段可能 OOM
- **Why:** 当前全量加载到内存
- **Depends on:** 需要确定 token 上限策略

## Worktree Parallelization

| Step | Modules touched | Depends on |
|------|----------------|------------|
| 1. MessageRecord + Provider 接口 | message/providers/ | — |
| 2. PrismaProvider 实现 | message/providers/ | Step 1 |
| 3. JsonlProvider 实现 | message/providers/ | Step 1 |
| 4. MessageStore 接口 + 实现 | message/ | Step 1 |
| 5. BaseExecutor | workflow/ | — |
| 6. NestJS DI 注册 | ai.module.ts | Step 2, 3, 4 |
| 7. 重构 Executor | workflow/ | Step 4, 5 |
| 8. 重构 AgentExecutor | agents/ | Step 5 |
| 9. 清理 llm-node 死代码 | langgraph/ | — |

**Parallel lanes:**
- Lane A: Step 1 + Step 2 + Step 3 (Provider 层 — 独立)
- Lane B: Step 4 (MessageStore 业务层 — 依赖 Step 1)
- Lane C: Step 5 (BaseExecutor — 独立)
- Lane D: Step 9 (llm-node 清理 — 独立)
- Lane E: Step 6 (NestJS 注册 — 依赖 Step 2,3,4)
- Lane F: Step 7 (Executor 重构 — 依赖 Step 4,5)
- Lane G: Step 8 (AgentExecutor 重构 — 依赖 Step 5)

**Execution order:**
1. Launch A + C + D in parallel
2. Then B (依赖 A)
3. Then E (依赖 A, B)
4. Then F + G in parallel (依赖 C, B)
5. Then tests

**Conflict flags:** 无 — 各 lane 模块不重叠。

## Lake Score

| 决策 | 选择 | 完整性 |
|------|------|--------|
| Store + Provider 两层 | A (接口分离) | 10/10 |
| 统一 MessageRecord | A (统一类型) | 9/10 |
| 接口按操作拆分 | A (语义拆分) | 9/10 |
| 内存状态缓存 | A (内存数组) | 9/10 |
| Round 级事务 | A (createMany) | 9/10 |
| 死代码清理 | A (移除) | 9/10 |
| BaseExecutor | A (基类抽取) | 8/10 |
| AgentExecutor 独立 | B (基类共享) | 3/10 |
| NestJS DI 切换 | A (useFactory) | 9/10 |
| 测试覆盖 | A (完整补齐) | 10/10 |

**Lake Score: 9/10** — 选择了完整方案，未选择捷径。

## Implementation Tasks

Synthesized from this review's findings. Each task derives from a specific finding above.

- [ ] **T1 (P1, human: ~30min / CC: ~5min)** — message — 定义 MessageRecord + Provider 接口
  - Surfaced by: 架构决策 1, 2
  - Files: `message-store.types.ts`, `providers/message-store-provider.interface.ts`
  - Verify: TypeScript 编译通过

- [ ] **T2 (P1, human: ~1.5h / CC: ~15min)** — message — 实现 PrismaMessageStoreProvider
  - Surfaced by: 架构决策 1
  - Files: `providers/prisma-message-store.provider.ts`
  - Verify: 单元测试通过

- [ ] **T3 (P2, human: ~1.5h / CC: ~15min)** — message — 实现 JsonlMessageStoreProvider
  - Surfaced by: 架构决策 1 — 存储可扩展性
  - Files: `providers/jsonl-message-store.provider.ts`
  - Verify: 单元测试通过

- [ ] **T4 (P1, human: ~1.5h / CC: ~15min)** — message — 实现 MessageStore 业务层
  - Surfaced by: 架构决策 1, 3, 4
  - Files: `message-store.interface.ts`, `message-store.impl.ts`
  - Verify: 单元测试通过

- [ ] **T5 (P1, human: ~2h / CC: ~20min)** — workflow — 抽取 BaseExecutor
  - Surfaced by: 架构决策 7
  - Files: `base-executor.ts`
  - Verify: Executor 和 AgentExecutor 编译通过

- [ ] **T6 (P1, human: ~1h / CC: ~15min)** — workflow — 重构 Executor
  - Surfaced by: 问题定义
  - Files: `executor.ts`, `executor.types.ts`
  - Verify: 对话流程正常

- [ ] **T7 (P1, human: ~1h / CC: ~15min)** — agents — 重构 AgentExecutor
  - Surfaced by: 架构决策 8
  - Files: `agent-executor.ts`
  - Verify: AgentExecutor 测试通过

- [ ] **T8 (P1, human: ~30min / CC: ~10min)** — langgraph — 清理 llm-node 死代码
  - Surfaced by: 架构决策 6
  - Files: `llm-node.ts`, `workflow.types.ts`
  - Verify: TypeScript 编译通过

- [ ] **T9 (P1, human: ~30min / CC: ~5min)** — ai.module — Provider DI 注册
  - Surfaced by: 架构决策 9
  - Files: `ai.module.ts`
  - Verify: 应用启动正常

- [ ] **T10 (P2, human: ~4h / CC: ~50min)** — tests — 补齐所有测试
  - Surfaced by: 测试评审
  - Files: `providers/__tests__/*.spec.ts`, `message/__tests__/*.spec.ts`, `workflow/__tests__/executor.spec.ts`, `workflow/__tests__/base-executor.spec.ts`
  - Verify: `pnpm test` 全部通过

## Completion Summary
- Step 0: Scope Challenge — scope accepted (10 个文件变更，3 层抽象，复杂度可控)
- Architecture Review: 5 issues found (耦合/DB reload/死代码/存储锁定/内存缓存)
- Code Quality Review: 4 issues found (接口设计/事务保护/DRY 违反/Provider 注册)
- Test Review: diagram produced, 15+ gaps identified (Executor/Provider/Store 0% coverage)
- Performance Review: 1 issue found (N 次 DB reload)
- NOT in scope: written (6 items)
- What already exists: written (6 items)
- TODOS.md updates: 4 items proposed
- Failure modes: 1 critical gap flagged (内存/Provider 不一致)
- Outside voice: skipped
- Parallelization: 7 lanes, 4 parallel / 3 sequential
- Lake Score: 9/10 recommendations chose complete option
