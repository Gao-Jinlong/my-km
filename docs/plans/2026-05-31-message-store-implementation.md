# Implementation: MessageStore + Provider 架构重构

> Based on: [docs/plans/2026-05-31-message-store-refactor.md](docs/plans/2026-05-31-message-store-refactor.md)
> Branch: `feat/message-store-provider`
> Created: 2026-05-31

## 实施原则

1. **Make the change easy, then make the easy change** — 先建接口和抽象，再改实现
2. **每个 Phase 完成后必须编译通过** — 不跨越 broken state
3. **先新建文件，再修改现有文件** — 降低回滚风险
4. **Provider 层先写实现再写测试** — 测试在 Phase 7 统一补齐

## 依赖图

```
Phase 1: 类型 + 接口层 (T1)
    ├─── Phase 2: Provider 实现 (T2, T3)
    │       └─── Phase 3: MessageStore 业务层 (T4)
    │               └─── Phase 6: DI 注册 (T9)
    │                       └─── Phase 7: 测试 (T10)
    │
Phase 4: BaseExecutor (T5)
    ├─── Phase 5: Executor 重构 (T6)
    │       └─── Phase 7: 测试 (T10)
    └─── Phase 5: AgentExecutor 重构 (T7)
            └─── Phase 7: 测试 (T10)

Phase 8: 死代码清理 (T8) — 可并行任意阶段
```

---

## Phase 1: 类型 + 接口层 (T1)

**目标**: 新建类型定义文件，不修改任何现有代码。编译通过后进入 Phase 2。

### 1.1 新建 `message-store.types.ts`

**文件**: `apps/server/src/ai/message/message-store.types.ts`

```typescript
import type { InFlightToolCall } from '../ai.types';

/**
 * 统一的消息记录结构 — 所有 MessageStoreProvider 必须映射到此格式。
 * MessageStore 业务层只操作此类型，不感知底层存储实现。
 */
export interface MessageRecord {
    id: string;
    roomId: string;
    role: string;               // 'user' | 'assistant' | 'tool' | 'system'
    content: string | null;
    toolCalls?: InFlightToolCall[];
    toolResultId?: string;
    tokenCount?: number;
    finishReason?: string;
    metadata?: Record<string, unknown>;
    createdAt: Date;
}

/**
 * Provider 创建输入 — 排除服务端自动生成的字段
 */
export type CreateMessageInput = Omit<MessageRecord, 'id' | 'createdAt'>;

/**
 * Provider 查询选项
 */
export interface FindByRoomOptions {
    limit?: number;
    offset?: number;
    orderBy?: 'asc' | 'desc';
}
```

### 1.2 新建 `message-store-provider.interface.ts`

**文件**: `apps/server/src/ai/message/providers/message-store-provider.interface.ts`

```typescript
import type { CreateMessageInput, FindByRoomOptions, MessageRecord } from '../message-store.types';

/**
 * MessageStoreProvider — 存储层抽象接口。
 * 只做纯 CRUD 操作，不关心消息格式转换、内存管理或事务语义。
 *
 * 实现此接口即可作为 MessageStore 的存储后端。
 * 当前提供: PrismaMessageStoreProvider, JsonlMessageStoreProvider
 */
export interface MessageStoreProvider {
    /**
     * 创建单条消息
     */
    create(record: CreateMessageInput): Promise<MessageRecord>;

    /**
     * 批量创建（要求事务语义 — Prisma 用 $transaction，JSONL 逐条追加）
     */
    createMany(records: CreateMessageInput[]): Promise<MessageRecord[]>;

    /**
     * 查询房间消息
     */
    findByRoom(roomId: string, opts?: FindByRoomOptions): Promise<MessageRecord[]>;

    /**
     * 聚合 token 使用量
     */
    aggregateTokens(roomId: string): Promise<number>;

    /**
     * 可选：健康检查（用于启动时验证 Provider 可用）
     */
    healthCheck?(): Promise<boolean>;
}

/**
 * NestJS 注入 Token — 用于 Symbol 方式注入 Provider
 */
export const MESSAGE_STORE_PROVIDER_TOKEN = Symbol('MESSAGE_STORE_PROVIDER');
```

### 1.3 新建 providers/index.ts

**文件**: `apps/server/src/ai/message/providers/index.ts`

```typescript
export type { MessageStoreProvider } from './message-store-provider.interface';
export { MESSAGE_STORE_PROVIDER_TOKEN } from './message-store-provider.interface';
```

### 1.4 新建 message-store.interface.ts

**文件**: `apps/server/src/ai/message/message-store.interface.ts`

```typescript
import type { LLMMessage } from '../ai.types';
import type { InFlightToolCall } from '../ai.types';

/**
 * MessageStore — 消息业务层接口。
 *
 * 负责：
 * - 消息格式转换（MessageRecord ↔ LLMMessage）
 * - 内存状态管理（init 加载，persist 增量更新）
 * - Token 裁剪策略
 * - Round 级事务语义编排
 *
 * 不负责：具体存储实现 — 委托给 MessageStoreProvider。
 */
export interface MessageStore {
    /** 初始化：从 Provider 加载历史到内存 */
    init(roomId: string, maxTokens?: number): Promise<void>;

    /** 持久化用户消息 */
    persistUser(content: string): Promise<void>;

    /** 持久化助手消息（含 tool calls） */
    persistAssistant(content: string, toolCalls?: InFlightToolCall[]): Promise<void>;

    /** 持久化工具结果 */
    persistToolResult(toolResultId: string, content: string): Promise<void>;

    /**
     * 批量持久化 round 数据
     * 一次性写入 assistant 消息 + 所有 tool results，事务语义
     */
    persistRound(
        assistantContent: string,
        toolCalls: InFlightToolCall[],
        toolResults: Record<string, unknown>,
    ): Promise<void>;

    /** 最终助手消息（无 tool calls 的场景） */
    persistFinal(content: string): Promise<void>;

    /** 构建 LLM 历史（从内存，O(1)） */
    buildHistory(): LLMMessage[];

    /** 获取 token 使用量 */
    getTokenUsage(): number;
}
```

### 1.5 新建 message/index.ts

**文件**: `apps/server/src/ai/message/index.ts`

```typescript
export type { MessageRecord, CreateMessageInput, FindByRoomOptions } from './message-store.types';
export type { MessageStore } from './message-store.interface';
export { MESSAGE_STORE_PROVIDER_TOKEN } from './providers/message-store-provider.interface';
export type { MessageStoreProvider } from './providers/message-store-provider.interface';
```

### ✅ Phase 1 验收

```bash
cd apps/server && npx tsc --noEmit
# 预期：0 errors（新增纯类型文件，不影响现有代码）
```

---

## Phase 2: Provider 实现 (T2, T3)

**目标**: 实现两个 Provider，可并行执行。

### 2.1 PrismaMessageStoreProvider

**文件**: `apps/server/src/ai/message/providers/prisma-message-store.provider.ts`

```typescript
import { Injectable } from '@nestjs/common';
import { Prisma } from '@my-km/prisma';
import { PrismaService } from '../../../prisma/prisma.service';
import type { CreateMessageInput, FindByRoomOptions, MessageRecord } from '../message-store.types';
import type { MessageStoreProvider } from './message-store-provider.interface';

@Injectable()
export class PrismaMessageStoreProvider implements MessageStoreProvider {
    constructor(private prisma: PrismaService) {}

    async create(record: CreateMessageInput): Promise<MessageRecord> {
        const result = await this.prisma.message.create({
            data: {
                roomId: record.roomId,
                role: record.role,
                content: record.content,
                toolCalls: record.toolCalls?.length
                    ? (record.toolCalls as unknown as Prisma.InputJsonValue)
                    : undefined,
                toolResultId: record.toolResultId,
                tokenCount: record.tokenCount,
                finishReason: record.finishReason,
                metadata: record.metadata ? (record.metadata as Prisma.InputJsonValue) : undefined,
            },
        });
        return this._toRecord(result);
    }

    async createMany(records: CreateMessageInput[]): Promise<MessageRecord[]> {
        const results = await this.prisma.$transaction(
            records.map(r =>
                this.prisma.message.create({
                    data: {
                        roomId: r.roomId,
                        role: r.role,
                        content: r.content,
                        toolCalls: r.toolCalls?.length
                            ? (r.toolCalls as unknown as Prisma.InputJsonValue)
                            : undefined,
                        toolResultId: r.toolResultId,
                        tokenCount: r.tokenCount,
                        finishReason: r.finishReason,
                        metadata: r.metadata
                            ? (r.metadata as Prisma.InputJsonValue)
                            : undefined,
                    },
                }),
            ),
        );
        return results.map(r => this._toRecord(r));
    }

    async findByRoom(roomId: string, opts: FindByRoomOptions = {}): Promise<MessageRecord[]> {
        const { limit, offset = 0, orderBy = 'asc' } = opts;

        const results = await this.prisma.message.findMany({
            where: { roomId },
            orderBy: { createdAt: orderBy },
            ...(limit !== undefined && { take: limit }),
            ...(offset > 0 && { skip: offset }),
            select: {
                id: true,
                roomId: true,
                role: true,
                content: true,
                toolCalls: true,
                toolResultId: true,
                tokenCount: true,
                finishReason: true,
                metadata: true,
                createdAt: true,
            },
        });

        return results.map(r => this._toRecord(r));
    }

    async aggregateTokens(roomId: string): Promise<number> {
        const result = await this.prisma.message.aggregate({
            where: { roomId },
            _sum: { tokenCount: true },
        });
        return result._sum.tokenCount ?? 0;
    }

    async healthCheck(): Promise<boolean> {
        try {
            await this.prisma.message.count({ take: 1 });
            return true;
        } catch {
            return false;
        }
    }

    // ========== 私有方法 ==========

    /**
     * 将 Prisma 记录映射为 MessageRecord
     */
    private _toRecord(db: {
        id: string;
        roomId: string;
        role: string;
        content: string | null;
        toolCalls: Prisma.JsonValue | null;
        toolResultId: string | null;
        tokenCount: number | null;
        finishReason: string | null;
        metadata: Prisma.JsonValue | null;
        createdAt: Date;
    }): MessageRecord {
        return {
            id: db.id,
            roomId: db.roomId,
            role: db.role,
            content: db.content,
            toolCalls: db.toolCalls
                ? (db.toolCalls as unknown as MessageRecord['toolCalls'])
                : undefined,
            toolResultId: db.toolResultId ?? undefined,
            tokenCount: db.tokenCount ?? undefined,
            finishReason: db.finishReason ?? undefined,
            metadata: db.metadata
                ? (db.metadata as Record<string, unknown>)
                : undefined,
            createdAt: db.createdAt,
        };
    }
}
```

### 2.2 JsonlMessageStoreProvider

**文件**: `apps/server/src/ai/message/providers/jsonl-message-store.provider.ts`

```typescript
import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { CreateMessageInput, FindByRoomOptions, MessageRecord } from '../message-store.types';
import type { MessageStoreProvider } from './message-store-provider.interface';

@Injectable()
export class JsonlMessageStoreProvider implements MessageStoreProvider {
    private readonly logger = new Logger(JsonlMessageStoreProvider.name);
    private baseDir: string;

    constructor(config: { dataDir: string }) {
        this.baseDir = path.join(config.dataDir, 'messages');
    }

    async init(): Promise<void> {
        await fs.mkdir(this.baseDir, { recursive: true });
    }

    private _filePath(roomId: string): string {
        return path.join(this.baseDir, `${roomId}.jsonl`);
    }

    async create(record: CreateMessageInput): Promise<MessageRecord> {
        const entry: MessageRecord = {
            ...record,
            id: crypto.randomUUID(),
            createdAt: new Date(),
        };
        const line = JSON.stringify(entry) + '\n';
        await fs.mkdir(path.dirname(this._filePath(record.roomId)), { recursive: true });
        await fs.appendFile(this._filePath(record.roomId), line, 'utf-8');
        return entry;
    }

    async createMany(records: CreateMessageInput[]): Promise<MessageRecord[]> {
        const results: MessageRecord[] = [];
        for (const record of records) {
            results.push(await this.create(record));
        }
        return results;
    }

    async findByRoom(roomId: string, opts: FindByRoomOptions = {}): Promise<MessageRecord[]> {
        const file = this._filePath(roomId);
        try {
            const content = await fs.readFile(file, 'utf-8');
            const records = this._parseLines(content);
            return this._applyOptions(records, opts);
        } catch (err) {
            if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
                return [];
            }
            this.logger.error(`Failed to read JSONL file for room ${roomId}: ${err}`);
            throw err;
        }
    }

    async aggregateTokens(roomId: string): Promise<number> {
        const records = await this.findByRoom(roomId);
        return records.reduce((sum, r) => sum + (r.tokenCount ?? 0), 0);
    }

    async healthCheck(): Promise<boolean> {
        try {
            await fs.mkdir(this.baseDir, { recursive: true });
            await fs.access(this.baseDir, fs.constants.W_OK);
            return true;
        } catch {
            return false;
        }
    }

    // ========== 私有方法 ==========

    private _parseLines(content: string): MessageRecord[] {
        return content
            .trim()
            .split('\n')
            .filter(Boolean)
            .map((line, idx) => {
                try {
                    return JSON.parse(line) as MessageRecord;
                } catch {
                    this.logger.warn(`Skipping invalid JSONL line ${idx + 1}`);
                    return null;
                }
            })
            .filter((r): r is MessageRecord => r !== null);
    }

    private _applyOptions(records: MessageRecord[], opts: FindByRoomOptions): MessageRecord[] {
        let result = records;
        if (opts.orderBy === 'desc') {
            result = [...result].reverse();
        }
        if (opts.offset) {
            result = result.slice(opts.offset);
        }
        if (opts.limit !== undefined) {
            result = result.slice(0, opts.limit);
        }
        return result;
    }
}
```

### 2.3 更新 providers/index.ts

```typescript
export type { MessageStoreProvider } from './message-store-provider.interface';
export { MESSAGE_STORE_PROVIDER_TOKEN } from './message-store-provider.interface';
export { PrismaMessageStoreProvider } from './prisma-message-store.provider';
export { JsonlMessageStoreProvider } from './jsonl-message-store.provider';
```

### ✅ Phase 2 验收

```bash
cd apps/server && npx tsc --noEmit
# 预期：0 errors
```

---

## Phase 3: MessageStore 业务层 (T4)

**依赖**: Phase 1 接口 + Phase 2 Provider

### 3.1 实现 MessageStoreImpl

**文件**: `apps/server/src/ai/message/message-store.impl.ts`

```typescript
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { LLMMessage, InFlightToolCall } from '../ai.types';
import type { CreateMessageInput, MessageRecord } from './message-store.types';
import type { MessageStoreProvider } from './providers/message-store-provider.interface';
import { MESSAGE_STORE_PROVIDER_TOKEN } from './providers/message-store-provider.interface';
import type { MessageStore } from './message-store.interface';

@Injectable()
export class MessageStoreImpl implements MessageStore {
    private readonly logger = new Logger(MessageStoreImpl.name);
    private roomId!: string;
    private memory: MessageRecord[] = [];
    private tokenUsage = 0;

    constructor(
        @Inject(MESSAGE_STORE_PROVIDER_TOKEN)
        private provider: MessageStoreProvider,
    ) {}

    async init(roomId: string, maxTokens?: number): Promise<void> {
        this.roomId = roomId;
        const records = await this.provider.findByRoom(roomId, { orderBy: 'asc' });
        this.memory = maxTokens !== undefined
            ? this._trimToTokenLimit(records, maxTokens)
            : records;
        this.tokenUsage = await this.provider.aggregateTokens(roomId);
        this.logger.debug(`MessageStore.init: loaded ${this.memory.length} messages for room ${roomId}`);
    }

    async persistUser(content: string): Promise<void> {
        const record = await this.provider.create({
            roomId: this.roomId,
            role: 'user',
            content,
        });
        this.memory.push(record);
    }

    async persistAssistant(content: string, toolCalls?: InFlightToolCall[]): Promise<void> {
        const record = await this.provider.create({
            roomId: this.roomId,
            role: 'assistant',
            content,
            toolCalls,
        });
        this.memory.push(record);
    }

    async persistToolResult(toolResultId: string, content: string): Promise<void> {
        const record = await this.provider.create({
            roomId: this.roomId,
            role: 'tool',
            content,
            toolResultId,
        });
        this.memory.push(record);
    }

    async persistRound(
        assistantContent: string,
        toolCalls: InFlightToolCall[],
        toolResults: Record<string, unknown>,
    ): Promise<void> {
        const records: CreateMessageInput[] = [
            {
                roomId: this.roomId,
                role: 'assistant',
                content: assistantContent,
                toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
            },
            ...Object.entries(toolResults).map(([toolId, result]) => ({
                roomId: this.roomId,
                role: 'tool' as const,
                content: typeof result === 'string' ? result : JSON.stringify(result),
                toolResultId: toolId,
            })),
        ];

        const persisted = await this.provider.createMany(records);
        this.memory.push(...persisted);
    }

    async persistFinal(content: string): Promise<void> {
        const record = await this.provider.create({
            roomId: this.roomId,
            role: 'assistant',
            content,
        });
        this.memory.push(record);
    }

    buildHistory(): LLMMessage[] {
        return this.memory.map(r => this._toLLMMessage(r));
    }

    getTokenUsage(): number {
        return this.tokenUsage;
    }

    // ========== 私有方法 ==========

    private _toLLMMessage(record: MessageRecord): LLMMessage {
        if (record.role === 'tool' && record.toolResultId) {
            return {
                role: 'tool' as const,
                content: [
                    {
                        type: 'tool_result' as const,
                        tool_use_id: record.toolResultId,
                        content: record.content ?? '',
                    },
                ],
            };
        }
        return {
            role: record.role as 'user' | 'assistant' | 'tool',
            content: record.content ?? '',
        };
    }

    private _trimToTokenLimit(records: MessageRecord[], maxTokens: number): MessageRecord[] {
        const withTokens = records.map(msg => ({
            ...msg,
            estimatedTokens: msg.tokenCount ?? Math.ceil((msg.content?.length ?? 0) / 4),
        }));

        const result: MessageRecord[] = [];
        let total = 0;

        for (let i = withTokens.length - 1; i >= 0; i--) {
            const msg = withTokens[i];
            if (total + msg.estimatedTokens > maxTokens) {
                break;
            }
            result.unshift(msg);
            total += msg.estimatedTokens;
        }

        this.logger.debug(
            `Trimmed history to ${result.length} messages (${total} tokens, limit: ${maxTokens})`,
        );
        return result;
    }
}
```

### 3.2 更新 message/index.ts

```typescript
export type { MessageRecord, CreateMessageInput, FindByRoomOptions } from './message-store.types';
export type { MessageStore } from './message-store.interface';
export { MessageStoreImpl } from './message-store.impl';
export { MESSAGE_STORE_PROVIDER_TOKEN } from './providers/message-store-provider.interface';
export type { MessageStoreProvider } from './providers/message-store-provider.interface';
export { PrismaMessageStoreProvider } from './providers/prisma-message-store.provider';
export { JsonlMessageStoreProvider } from './providers/jsonl-message-store.provider';
```

### ✅ Phase 3 验收

```bash
cd apps/server && npx tsc --noEmit
# 预期：0 errors
```

---

## Phase 4: 抽取 BaseExecutor (T5)

**目标**: 新建独立文件，不修改现有代码。编译通过后进入 Phase 5。

### 4.1 新建 base-executor.ts

**文件**: `apps/server/src/ai/workflow/base-executor.ts`

```typescript
import { Logger } from '@nestjs/common';
import type { LLMMessage } from '../ai.types';
import type {
    BaseGraph,
    CompiledWorkflowGraph,
    GraphConfig,
    WorkflowState,
} from '../langgraph';
import type { LLMConfig, NodeLLMConfigMap } from '../llm/provider.types';
import type { LLMResolver } from './llm-resolver';
import type { ToolDispatcher } from '../tools/tool.dispatcher';
import type { ToolRouter } from '../tools/tool-router';

/**
 * BaseExecutor — 共享的 LangGraph 循环逻辑。
 *
 * 提供:
 * - Graph 编译缓存
 * - LLM caller 桥接
 * - Tool loop (while + stream + abort + hasToolCalls)
 *
 * 子类实现:
 * - persistRound / persistFinal (持久化策略)
 * - routeToolCalls / waitForToolResults (工具通信)
 * - onTextChunk / onToolCall / onError (事件发射)
 * - isAborted / onAbort (中断处理)
 */
export abstract class BaseExecutor {
    protected readonly logger = new Logger(this.constructor.name);
    protected graphCache = new Map<string, CompiledWorkflowGraph>();
    protected maxToolRounds = 10;

    constructor(
        protected llmResolver: LLMResolver,
        protected toolDispatcher: ToolDispatcher,
        protected toolRouter: ToolRouter,
    ) {}

    /**
     * 获取或缓存编译后的 graph 实例
     */
    protected getOrCreateGraph(graphDef: BaseGraph): CompiledWorkflowGraph {
        const cacheKey = graphDef.name;
        if (!this.graphCache.has(cacheKey)) {
            const graph = graphDef.createGraph();
            this.graphCache.set(cacheKey, graph);
            this.logger.debug(`Graph compiled: ${cacheKey}`);
        }
        const graph = this.graphCache.get(cacheKey);
        if (!graph) {
            throw new Error(`Failed to compile graph: ${cacheKey}`);
        }
        return graph;
    }

    /**
     * 创建 LLM caller — 桥接 LLMProvider 到 LangGraph LLMCaller
     */
    protected createLLMCaller(
        configMap?: NodeLLMConfigMap,
        defaultConfig?: LLMConfig,
    ) {
        return async function* (messages: LLMMessage[], signal?: AbortSignal) {
            const provider = this.llmResolver.resolve('llm_call', configMap, defaultConfig);
            const tools = this.toolDispatcher.getDefinitions();
            yield* provider.chat(messages, tools, signal);
        }.bind(this);
    }

    /**
     * 通用 tool loop — 子类通过抽象方法注入持久化和通信行为
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

            // No more tool calls — done
            if (!lastState?.hasToolCalls || !lastState.pendingToolCalls?.length) {
                break;
            }

            hadToolCalls = true;

            // 委托子类持久化
            await this.persistRound(lastState);

            // 委托子类路由工具调用
            await this.routeToolCalls(lastState.pendingToolCalls);

            // 等待前端工具结果
            const results = await this.waitForToolResults(lastState.pendingToolCalls);
            if (!results) {
                this.logger.warn(`Tool execution timed out for room ${initialState.roomId}`);
                this.onTimeout(lastState.pendingToolCalls);
                break;
            }

            // 准备下一轮状态
            initialState.pendingToolCalls = [];
            initialState.hasToolCalls = false;
            initialState.toolResults = results;
        }

        if (round >= this.maxToolRounds) {
            this.logger.warn(`Max tool rounds (${this.maxToolRounds}) exceeded`);
        }

        return { lastState, hadToolCalls };
    }

    // ========== 子类必须实现的抽象方法 ==========

    /** 持久化一个 tool round 的结果（assistant + tool results） */
    protected abstract persistRound(state: Partial<WorkflowState>): Promise<void>;

    /** 持久化最终的 assistant 消息（无 tool calls 场景） */
    protected abstract persistFinal(state: Partial<WorkflowState>): Promise<void>;

    /** 路由工具调用到对应的 handler */
    protected abstract routeToolCalls(
        toolCalls: Array<{ id: string; name: string; arguments: Record<string, unknown> }>,
    ): Promise<void>;

    /** 等待前端工具结果返回 */
    protected abstract waitForToolResults(
        toolCalls: Array<{ id: string; name: string; arguments: Record<string, unknown> }>,
    ): Promise<Record<string, unknown> | null>;

    /** 检查是否已中断 */
    protected abstract isAborted(): boolean;

    /** 处理中断事件 */
    protected abstract onAbort(): void;

    /** 处理工具超时事件 */
    protected abstract onTimeout(
        toolCalls: Array<{ id: string; name: string; arguments: Record<string, unknown> }>,
    ): void;
}
```

### ✅ Phase 4 验收

```bash
cd apps/server && npx tsc --noEmit
# 预期：0 errors（新建独立文件，无引用）
```

---

## Phase 5: 重构 Executor + AgentExecutor (T6, T7)

**依赖**: Phase 3 (MessageStore) + Phase 4 (BaseExecutor)

### 5.1 更新 executor.types.ts

**文件**: `apps/server/src/ai/workflow/executor.types.ts`

替换 `messageService: MessageService` 为 `messageStore: MessageStore`：

```diff
 import type { RoomService } from '../conversation/room.service';
 import type { LLMConfig, NodeLLMConfigMap } from '../llm/provider.types';
-import type { MessageService } from '../message/message.service';
+import type { MessageStore } from '../message/message-store.interface';
 import type { ToolDispatcher } from '../tools/tool.dispatcher';
 import type { ToolRouter } from '../tools/tool-router';

 export interface ExecutorDependencies {
-    messageService: MessageService;
+    messageStore: MessageStore;
     roomService: RoomService;
     graphRegistry: GraphRegistry;
     llmResolver: LLMResolver;
     toolDispatcher: ToolDispatcher;
     toolRouter: ToolRouter;
 }
```

### 5.2 重构 executor.ts

**文件**: `apps/server/src/ai/workflow/executor.ts`

完整重写为继承 BaseExecutor：

```typescript
import type { GraphConfig, WorkflowState } from '../langgraph';
import type { ExecutionCtx, ExecutorDependencies } from './executor.types';
import { BaseExecutor } from './base-executor';

/**
 * Executor — 实时对话模式。
 *
 * 继承 BaseExecutor 共享 graph 循环逻辑，
 * 通过 MessageStore 处理消息持久化，
 * 通过 WorkflowCallbacks 处理 WebSocket 事件发射。
 */
export class Executor extends BaseExecutor {
    constructor(
        private ctx: ExecutionCtx,
        private deps: ExecutorDependencies,
    ) {
        super(deps.llmResolver, deps.toolDispatcher, deps.toolRouter);
    }

    async execute(): Promise<void> {
        const { roomId, content, callbacks, abortSignal, llmConfigMap, graphName = 'chat' } = this.ctx;

        const graphDef = this.deps.graphRegistry.get(graphName);
        const graph = this.getOrCreateGraph(graphDef);
        const llmCaller = this.createLLMCaller(llmConfigMap, this.ctx.defaultConfig);

        // 通过 MessageStore 加载历史
        await this.deps.messageStore.init(roomId, this.ctx.tokenLimit);
        await this.deps.messageStore.persistUser(content);
        this.deps.roomService.incrementMessageCount(roomId).catch(() => {});

        const history = this.deps.messageStore.buildHistory();
        const tools = this.deps.toolDispatcher.getDefinitions() as GraphConfig['tools'];

        const configurable: Partial<GraphConfig> = {
            llmCaller,
            tools,
            onChunk: (chunkContent: string) => {
                callbacks.onTextChunk(roomId, chunkContent);
            },
        };

        const initialState: Partial<WorkflowState> = {
            messages: [...history],
            roomId,
            lastAssistantMessage: '',
            hasToolCalls: false,
            pendingToolCalls: [],
            toolResults: {},
            error: undefined,
            isDone: false,
        };

        try {
            const { lastState, hadToolCalls } = await this.runToolLoop(graph, initialState, configurable);

            // Persist final assistant message when no tool calls occurred
            if (!hadToolCalls && lastState?.lastAssistantMessage) {
                await this.deps.messageStore.persistFinal(lastState.lastAssistantMessage);
                this.deps.roomService.incrementMessageCount(roomId).catch(() => {});
            }

            callbacks.onLlmDone(roomId);
        } catch (error) {
            if (abortSignal.aborted) {
                callbacks.onStop?.(roomId);
                return;
            }
            this.logger.error(`Executor failed for room ${roomId}: ${error}`);
            callbacks.onError(
                roomId,
                'WORKFLOW_ERROR',
                error instanceof Error ? error.message : 'Execution failed',
            );
        }
    }

    // ========== BaseExecutor 抽象方法实现 ==========

    protected async persistRound(state: Partial<WorkflowState>): Promise<void> {
        await this.deps.messageStore.persistRound(
            state.lastAssistantMessage || '',
            (state.pendingToolCalls ?? []).map(tc => ({
                id: tc.id,
                name: tc.name,
                arguments: tc.arguments,
                timestamp: new Date(),
            })),
            state.toolResults || {},
        );
    }

    protected async persistFinal(state: Partial<WorkflowState>): Promise<void> {
        await this.deps.messageStore.persistFinal(state.lastAssistantMessage || '');
    }

    protected async routeToolCalls(
        toolCalls: Array<{ id: string; name: string; arguments: Record<string, unknown> }>,
    ): Promise<void> {
        const { roomId, callbacks } = this.ctx;
        for (const tc of toolCalls) {
            const requiresConfirmation = this.deps.toolRouter.needsConfirmation(tc.name);
            this.deps.toolRouter.route(tc.name, tc.arguments, roomId, tc.id);
            callbacks.onToolCall(roomId, {
                toolCallId: tc.id,
                toolName: tc.name,
                input: tc.arguments,
                requiresConfirmation,
            });
        }
    }

    protected async waitForToolResults(
        toolCalls: Array<{ id: string; name: string; arguments: Record<string, unknown> }>,
    ): Promise<Record<string, unknown> | null> {
        return this.deps.toolDispatcher.waitForResultsByRoom(
            this.ctx.roomId,
            toolCalls.map(tc => ({
                id: tc.id,
                name: tc.name,
                arguments: tc.arguments,
                timestamp: new Date(),
            })),
            30000,
        );
    }

    protected isAborted(): boolean {
        return this.ctx.abortSignal.aborted;
    }

    protected onAbort(): void {
        this.ctx.callbacks.onStop?.(this.ctx.roomId);
    }

    protected onTimeout(
        toolCalls: Array<{ id: string; name: string; arguments: Record<string, unknown> }>,
    ): void {
        this.ctx.callbacks.onTimeout?.(
            this.ctx.roomId,
            `Tool execution timed out after 30s for ${toolCalls.map(tc => tc.name).join(', ')}`,
        );
    }
}
```

### 5.3 重构 orchestrator.ts

**文件**: `apps/server/src/ai/workflow/orchestrator.ts`

```diff
 import { Injectable, Logger } from '@nestjs/common';
 import { RoomService } from '../conversation/room.service';
+import { MessageStore } from '../message/message-store.interface';
-import { MessageService } from '../message/message.service';

 constructor(
     private roomSessionRegistry: RoomSessionRegistry,
-    private messageService: MessageService,
+    private messageStore: MessageStore,
     private roomService: RoomService,
     ...
 ) {}

 const deps: ExecutorDependencies = {
-    messageService: this.messageService,
+    messageStore: this.messageStore,
     roomService: this.roomService,
     ...
 };
```

### 5.4 重构 agent-executor.ts

**文件**: `apps/server/src/ai/agents/agent-executor.ts`

```typescript
import { Logger } from '@nestjs/common';
import type { GraphConfig, WorkflowState } from '../langgraph';
import type { LLMConfig } from '../llm/provider.types';
import type { ToolDispatcher } from '../tools/tool.dispatcher';
import type { ToolRouter } from '../tools/tool.router';
import type { GraphRegistry } from '../workflow/graph-registry';
import type { LLMResolver } from '../workflow/llm-resolver';
import type { AgentCallbacks } from './agent.types';
import { BaseExecutor } from '../workflow/base-executor';
import type { AgentExecutorCtx } from './agent-executor'; // 保持原有类型

/**
 * AgentExecutor — 离线推理模式。
 *
 * 继承 BaseExecutor 共享 graph 循环逻辑，
 * 不持久化任何消息（纯内存状态），
 * 通过回调一次性返回输出。
 */
export class AgentExecutor extends BaseExecutor {
    private ctx: AgentExecutorCtx;
    private graphRegistry: GraphRegistry;
    private llmConfig?: LLMConfig;
    private graphName: string;
    private graphCache = new Map<string, unknown>();

    constructor(
        ctx: AgentExecutorCtx,
        deps: {
            graphRegistry: GraphRegistry;
            llmResolver: LLMResolver;
            toolDispatcher: ToolDispatcher;
            toolRouter: ToolRouter;
        },
    ) {
        super(deps.llmResolver, deps.toolDispatcher, deps.toolRouter);
        this.ctx = ctx;
        this.graphRegistry = deps.graphRegistry;
        this.llmConfig = ctx.llmConfig;
        this.graphName = ctx.graphName || 'chat';
    }

    async execute(): Promise<{ output: string }> {
        const { sessionId, agentId, callbacks, abortSignal } = this.ctx;

        const graphDef = this.graphRegistry.get(this.graphName);
        const graph = this.getOrCreateGraph(graphDef);
        const llmCaller = this.createLLMCaller(this.llmConfig);
        const tools = this.deps.toolDispatcher.getDefinitions() as GraphConfig['tools'];

        const configurable: Partial<GraphConfig> = {
            llmCaller,
            tools,
            onChunk: (chunkContent: string) => {
                callbacks.onThinking(sessionId, agentId, chunkContent);
            },
        };

        const initialState: Partial<WorkflowState> = {
            messages: [{ role: 'user' as const, content: this.ctx.input }],
            roomId: sessionId,
            lastAssistantMessage: '',
            hasToolCalls: false,
            pendingToolCalls: [],
            toolResults: {},
            error: undefined,
            isDone: false,
        };

        try {
            const { lastState } = await this.runToolLoop(graph, initialState, configurable);
            const output = lastState?.lastAssistantMessage ?? '';
            callbacks.onOutput(sessionId, agentId, output);
            return { output };
        } catch (error) {
            if (abortSignal.aborted) {
                callbacks.onStatus(sessionId, agentId, 'cancelled');
                return { output: '' };
            }
            this.logger.error(`AgentExecutor failed for ${agentId}: ${error}`);
            callbacks.onError(sessionId, agentId, error instanceof Error ? error.message : 'Execution failed');
            return { output: '' };
        }
    }

    // ========== BaseExecutor 抽象方法实现 ==========
    // 离线模式：不需要持久化

    protected async persistRound(): Promise<void> {
        this.logger.warn('AgentExecutor: persistRound called but offline mode does not persist.');
    }

    protected async persistFinal(): Promise<void> {
        // no-op
    }

    protected async routeToolCalls(): Promise<void> {
        this.logger.warn('AgentExecutor: tool calls not supported in offline mode.');
    }

    protected async waitForToolResults(): Promise<Record<string, unknown> | null> {
        // 离线模式不支持等待前端工具结果
        return null;
    }

    protected isAborted(): boolean {
        return this.ctx.abortSignal.aborted;
    }

    protected onAbort(): void {
        this.ctx.callbacks.onStatus(this.ctx.sessionId, this.ctx.agentId, 'cancelled');
    }

    protected onTimeout(): void {
        this.logger.warn('AgentExecutor: tool execution timed out (offline mode, no action)');
    }
}
```

**注意**: AgentExecutor 重构后需要更新其测试文件 `agent-executor.spec.ts` 中 mock 的部分（详见 Phase 7）。

### ✅ Phase 5 验收

```bash
cd apps/server && npx tsc --noEmit
# 预期：0 errors
# 如果有 error，必须在此修复，不允许跳过
```

---

## Phase 6: DI 注册 + 死代码清理 (T9, T8)

**依赖**: Phase 3 (MessageStore) + Phase 2 (Provider)

### 6.1 更新 ai.module.ts 注册 Provider

**文件**: `apps/server/src/ai/ai.module.ts`

```diff
+import { MessageStoreImpl } from './message/message-store.impl';
+import { MESSAGE_STORE_PROVIDER_TOKEN } from './message/providers/message-store-provider.interface';
+import { PrismaMessageStoreProvider } from './message/providers/prisma-message-store.provider';
 import { MessageService } from './message/message.service';

 @Module({
     providers: [
         RoomService,
         MessageService,    // 保留向后兼容（如有其他消费者）
+        MessageStoreImpl,
+        {
+            provide: MESSAGE_STORE_PROVIDER_TOKEN,
+            useFactory: (config: ConfigService, prisma: PrismaService) => {
+                const providerType = config.get<string>('MESSAGE_STORE_PROVIDER', 'prisma');
+                switch (providerType) {
+                    case 'prisma':
+                        return new PrismaMessageStoreProvider(prisma);
+                    // case 'jsonl':
+                    //     return new JsonlMessageStoreProvider({ dataDir: config.get('DATA_DIR', './data') });
+                    default:
+                        throw new Error(`Unknown MESSAGE_STORE_PROVIDER: ${providerType}`);
+                }
+            },
+            inject: [ConfigService, PrismaService],
+        },
         ...
     ],
     exports: [
         MessageService,
+        MessageStoreImpl,
         ...
     ],
 })
```

### 6.2 清理 llm-node 死代码

**文件**: `apps/server/src/ai/langgraph/nodes/llm-node.ts`

移除 `messages` 追加：

```diff
 return {
     lastAssistantMessage: assistantText,
     hasToolCalls: toolCalls.length > 0,
     pendingToolCalls: toolCalls,
-    // 追加助手消息到消息历史
-    messages: [
-        { role: 'assistant' as const, content: assistantText || '(tool calls only)' },
-    ],
 };
```

### 6.3 清理 WorkflowState messages 字段

**文件**: `apps/server/src/ai/langgraph/types/workflow.types.ts`

```diff
 export const WorkflowStateAnnotation = Annotation.Root({
-    /** 用户输入消息 */
-    messages: Annotation<LLMMessage[]>({
-        reducer: (existing: LLMMessage[], update: LLMMessage[]) => [
-            ...existing,
-            ...update,
-        ],
-        default: () => [],
-    }),
     /** 当前房间 ID */
     roomId: Annotation<string>,
     ...
 });

 export interface WorkflowState {
-    /** 用户输入消息 */
-    messages: LLMMessage[];
     /** 当前房间 ID */
     roomId: string;
     ...
 }
```

### 6.4 清理 executor.ts 中的 messages 类型引用

**文件**: `apps/server/src/ai/workflow/executor.ts`

executor.ts 中 `initialState.messages` 的引用需要更新 — 因为 WorkflowState 不再包含 messages。

**方案**: 在 Executor 内部用 `messages: LLMMessage[]` 单独传递历史，不通过 WorkflowState：

```typescript
// initialState 不再设 messages
const initialState: Partial<WorkflowState> = {
    roomId,
    lastAssistantMessage: '',
    hasToolCalls: false,
    pendingToolCalls: [],
    toolResults: {},
    error: undefined,
    isDone: false,
};

// 在 configurable 中传递 history
const configurable: Partial<GraphConfig> = {
    llmCaller,
    tools,
    history,  // 新增字段
    onChunk: ...
};
```

**但这会修改 GraphConfig 接口** — 更好的方案是保持 `messages` 在 WorkflowState 中，因为 llm-node 仍然需要它。

**修正方案**: WorkflowState.messages 暂时保留，但标注为 "仅供 LangGraph 内部使用，不由 MessageStore 管理"。真正的清理需要等 llm-node 改为从 configurable.history 读取。

```diff
 // WorkflowState 保留 messages（llm-node 需要），但添加注释
 export interface WorkflowState {
+    /** LLM 内部消息列表 — 由 executor 通过 buildHistory() 注入，llm-node 消费 */
     messages: LLMMessage[];
```

即：死代码清理分两步 — **本次只移除 llm-node 的 append，保留 messages 字段**。

### ✅ Phase 6 验收

```bash
cd apps/server && npx tsc --noEmit
# 预期：0 errors
```

---

## Phase 7: 测试补齐 (T10)

**依赖**: Phase 5 + Phase 6 完成

### 7.1 Provider 测试

**文件**: `apps/server/src/ai/message/providers/__tests__/prisma-message-store.provider.spec.ts`

测试覆盖：
- `create` 写入 DB 并返回 MessageRecord
- `createMany` 事务原子性
- `findByRoom` 分页 + 排序
- `aggregateTokens` 聚合
- `_toRecord` 映射正确性

**文件**: `apps/server/src/ai/message/providers/__tests__/jsonl-message-store.provider.spec.ts`

测试覆盖：
- `create` 追加写入 JSONL
- `createMany` 逐条追加
- `findByRoom` 文件不存在时返回空
- `findByRoom` 解析有效文件
- 跳过无效 JSONL 行

### 7.2 MessageStore 测试

**文件**: `apps/server/src/ai/message/__tests__/message-store.spec.ts`

Mock `MessageStoreProvider`，测试：
- `init` 从 Provider 加载
- `persistUser` → create + memory.push
- `persistRound` → createMany + memory.push (多条)
- `persistFinal` → create + memory.push
- `buildHistory` 从内存转换（不调用 Provider）
- `_trimToTokenLimit` 截断

### 7.3 BaseExecutor 测试

**文件**: `apps/server/src/ai/workflow/__tests__/base-executor.spec.ts`

创建 mock 子类实现所有抽象方法，测试：
- `runToolLoop` 正常流程 (无 tool calls)
- `runToolLoop` tool round (hasToolCalls → persistRound → routeToolCalls → waitForToolResults)
- `runToolLoop` max rounds 限制
- `runToolLoop` abort 检查
- `getOrCreateGraph` 缓存行为

### 7.4 Executor 测试

**文件**: `apps/server/src/ai/workflow/__tests__/executor.spec.ts`

Mock `MessageStore` 和所有依赖，测试：
- 无 tool 场景 — persistUser + persistFinal
- 有 tool 场景 — persistUser + persistRound (N rounds)
- tool timeout — 超时后中断
- error handling — graph 异常 → onError
- max rounds exceeded
- abort signal

### 7.5 更新 AgentExecutor 测试

**文件**: `apps/server/src/ai/agents/__tests__/agent-executor.spec.ts`

更新现有 3 个测试以适配新的 BaseExecutor 继承结构。

### ✅ Phase 7 验收

```bash
cd apps/server && pnpm test
# 预期：全部通过
```

---

## Phase 顺序总结

| Phase | 任务 | 文件数 | 预计耗时 | 验收标准 |
|-------|------|--------|----------|----------|
| **Phase 1** | 类型 + 接口 | 5 新 | 30min | `tsc --noEmit` 通过 |
| **Phase 2** | Provider 实现 | 3 新 | 1.5h | `tsc --noEmit` 通过 |
| **Phase 3** | MessageStore 实现 | 2 新 | 1h | `tsc --noEmit` 通过 |
| **Phase 4** | BaseExecutor | 1 新 | 1.5h | `tsc --noEmit` 通过 |
| **Phase 5** | 重构 Executor + AgentExecutor | 4 改 | 1.5h | `tsc --noEmit` 通过 |
| **Phase 6** | DI 注册 + 死代码清理 | 3 改 | 30min | `tsc --noEmit` 通过 |
| **Phase 7** | 测试补齐 | 5 新 | 3h | `pnpm test` 全部通过 |

**总预计**: ~9h 人工 / ~9h CC

## 变更文件清单

| Phase | 操作 | 文件 |
|-------|------|------|
| 1 | 新建 | `message/message-store.types.ts` |
| 1 | 新建 | `message/providers/message-store-provider.interface.ts` |
| 1 | 新建 | `message/providers/index.ts` |
| 1 | 新建 | `message/message-store.interface.ts` |
| 1 | 新建 | `message/index.ts` |
| 2 | 新建 | `message/providers/prisma-message-store.provider.ts` |
| 2 | 新建 | `message/providers/jsonl-message-store.provider.ts` |
| 2 | 修改 | `message/providers/index.ts` |
| 3 | 新建 | `message/message-store.impl.ts` |
| 3 | 修改 | `message/index.ts` |
| 4 | 新建 | `workflow/base-executor.ts` |
| 5 | 修改 | `workflow/executor.types.ts` |
| 5 | 修改 | `workflow/executor.ts` |
| 5 | 修改 | `workflow/orchestrator.ts` |
| 5 | 修改 | `agents/agent-executor.ts` |
| 5 | 修改 | `agents/__tests__/agent-executor.spec.ts` |
| 6 | 修改 | `ai.module.ts` |
| 6 | 修改 | `langgraph/nodes/llm-node.ts` |
| 6 | 修改 | `langgraph/types/workflow.types.ts` |
| 7 | 新建 | `message/providers/__tests__/prisma-message-store.provider.spec.ts` |
| 7 | 新建 | `message/providers/__tests__/jsonl-message-store.provider.spec.ts` |
| 7 | 新建 | `message/__tests__/message-store.spec.ts` |
| 7 | 新建 | `workflow/__tests__/base-executor.spec.ts` |
| 7 | 新建 | `workflow/__tests__/executor.spec.ts` |

**总计**: 14 新文件, 6 修改文件
