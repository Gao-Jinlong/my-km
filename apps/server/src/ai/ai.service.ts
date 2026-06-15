/**
 * AiChatService — AI 对话业务逻辑层
 *
 * 重构(Plan A1):
 * - 使用 LangChain `BaseChatModel` 替代自定义 LLMOutput 流
 * - 通过 `graph.stream({...}, { streamMode: ['messages', 'values', 'tasks'] })`
 *   让 LangGraph 运行时按 Platform 协议自然发出 messages / values / tasks 事件
 * - 直接将 `[mode, payload]` 透传为 SSE 事件 `{event: mode, data: payload}`
 * - 节点和 service 不再手动累积 chunk / 推送 messages/partial
 *
 * 职责:
 * - startRun: 创建 thread + run
 * - resumeFromCommand: 注入 resume payload，由 executeRunProtocol 用 `Command({resume})` 恢复
 * - executeRunProtocol: 透传 LangGraph 协议事件
 * - cancel: 取消活跃的 run
 * - 并发控制 (multitask_strategy)
 */

import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { Command } from '@langchain/langgraph';
import { ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { context as otelContext, SpanStatusCode, trace } from '@opentelemetry/api';
import { CheckpointReaderService } from './checkpointer/checkpoint-reader.service';
import { ChatGraph } from './langgraph/graphs/chat-graph';
import { LLMFactory } from './llm/llm-factory';
import type { LLMConfig } from './llm/provider.types';
import { ProviderRegistry } from './llm/provider-registry';
import type { LeaseResult } from './run/lease.types';
import { REPLICA_ID } from './run/replica-id';
import type { RunContext } from './run/run-context';
import { RunContextFactory } from './run/run-context-factory';
import { RunManager } from './run/run-manager';
import { RunRecord } from './run/run-record';
import { RunStateRepository } from './run/run-state.repository';
import { ThreadService } from './thread/thread.service';
import { frontendTools } from './tools/tool-definitions';
import { type MultitaskStrategy, RunStatus } from './types/run.types';
import { formatEditorContext } from './utils/format-editor-context';

export interface StartRunOpts {
    content: string;
    threadId?: string;
    context?: Record<string, unknown>;
    /** LangGraph Platform multitask_strategy（默认 'reject'） */
    multitaskStrategy?: MultitaskStrategy;
    llmConfig?: { provider?: string; model?: string };
}

@Injectable()
export class AiChatService {
    private readonly logger = new Logger(AiChatService.name);

    constructor(
        private readonly threadService: ThreadService,
        private readonly runManager: RunManager,
        private readonly runContextFactory: RunContextFactory,
        private readonly providerRegistry: ProviderRegistry,
        private readonly llmFactory: LLMFactory,
        // checkpointReader 保留供 GET /state 等用途；本服务不再依赖它读取消息
        private readonly _checkpointReader: CheckpointReaderService,
        private readonly runStateRepo: RunStateRepository,
        @Inject(REPLICA_ID) private readonly replicaId: string,
    ) {
        // 避免 TS unused 警告，保持构造依赖以便测试与未来用途
        void this._checkpointReader;
    }

    /**
     * 启动一个新的 Run
     */
    async startRun(opts: StartRunOpts): Promise<RunRecord> {
        const { content, threadId, multitaskStrategy = 'reject' } = opts;

        const thread = await this.threadService.findOrCreate(threadId, {
            title: content.slice(0, 20) || 'New Chat',
        });

        const activeRun = this.runManager.getActiveRunForThread(thread.id);
        if (activeRun) {
            await this.handleConcurrency(activeRun, multitaskStrategy);
        }

        const llmConfig = this.resolveLlmConfig(opts.llmConfig);

        const runContext = await this.runContextFactory.create({
            llmConfig,
        });

        const record = await this.runManager.createRun(thread.id, runContext, {
            content,
            requestContext: opts.context,
        });
        await this.runManager.setStatus(record.id, RunStatus.Running);

        return record;
    }

    /**
     * 进程外 resume：任意副本可恢复一个 interrupted run。
     *
     * 流程：查 PG active run → 校验 interrupted → acquireLease 抢占 →
     * saveResumePayload → 从 RunRow 重建 RunContext/RunRecord → adoptRun → setStatus(running)。
     * 不依赖内存里已有 RunRecord。
     */
    async resumeFromCommand(threadId: string, command: { resume?: unknown }): Promise<RunRecord> {
        const runRow = await this.runStateRepo.findActiveRunByThread(threadId);
        if (!runRow) {
            throw new NotFoundException(`No active run for thread: ${threadId}`);
        }
        if (runRow.status !== RunStatus.Interrupted) {
            throw new ConflictException(
                `Run ${runRow.id} is not interrupted (status: ${runRow.status})`,
            );
        }

        const lease: LeaseResult = await this.runStateRepo.acquireLease(runRow.id, this.replicaId);
        if (!lease.acquired) {
            throw new ConflictException(
                `Run ${runRow.id} is busy (owner: ${lease.conflict?.ownerId ?? 'unknown'})`,
            );
        }

        this.logger.log(`Run ${runRow.id} resumed by replica ${this.replicaId}`);

        await this.runStateRepo.saveResumePayload(runRow.id, command.resume);

        const llmConfig = (runRow.llmConfig as LLMConfig | null) ?? this.resolveDefaultLlmConfig();
        const runContext = await this.runContextFactory.create({ llmConfig });
        const record = new RunRecord({
            id: runRow.id,
            threadId,
            runContext,
            snapshot: {
                content: runRow.content ?? '',
                requestContext:
                    (runRow.requestContext as Record<string, unknown> | null) ?? undefined,
            },
            lastSeq: runRow.lastSeq,
        });
        record.setResumePayload(command.resume);

        this.runManager.adoptRun(record);
        await this.runStateRepo.setStatus(record.id, RunStatus.Running);
        record.setStatus(RunStatus.Running);
        return record;
    }

    /**
     * 执行 Run 并通过 LangGraph 原生 streamMode 透传协议事件
     *
     * 事件流：
     *   1. metadata {run_id, thread_id}         — run 开始
     *   2. messages  [BaseMessageChunk, meta]   — token 级流式（来自 streamMode 'messages'）
     *   3. values    {messages: [...]}          — 节点完成后状态快照
     *   4. tasks     {interrupts: [...]}        — task lifecycle / interrupts
     *   5. end       {}                         — 流结束
     *   或
     *   5. error     {error, message}           — 失败
     *
     * 关键设计：
     * - `streamMode: ['messages', 'values', 'tasks']` + 多模式 → 每个 chunk 形如 `[mode, payload]`
     * - LangGraph 内置 callbacks 通过 `StreamMessagesHandler` 自动捕获 LLM token chunk
     * - SDK 端 `MessageTupleManager` 通过稳定 message id 拼接同组 chunk →
     *   前端 useStream() 自动呈现打字效果
     * - interrupt 通过 tasks payload 中的 `interrupts` 字段感知
     */
    async executeRunProtocol(record: RunRecord): Promise<void> {
        const tracer = trace.getTracer('my-km-server');
        const langgraphSpan = tracer.startSpan('langgraph.run', {
            attributes: {
                'langgraph.runId': record.id,
                'langgraph.threadId': record.threadId,
            },
        });
        const langgraphCtx = trace.setSpan(otelContext.active(), langgraphSpan);

        try {
            await otelContext.with(langgraphCtx, async () => {
                // 1. metadata 事件（附加 traceId 给前端）
                const traceId = langgraphSpan.spanContext().traceId;
                await record.emitEvent({
                    event: 'metadata',
                    data: {
                        run_id: record.id,
                        thread_id: record.threadId,
                        trace_id: traceId,
                    },
                });

                // 2. 编译 graph，准备 LLM + 工具
                const graph = this.compileGraph(record.runContext);
                const llmProvider = this.llmFactory.getOrCreate(record.runContext.llmConfig);
                const chatModel = llmProvider.getChatModel();

                // 3. 构造 graph 输入
                //    - 新 run: { messages: [SystemMessage?(editor context), HumanMessage(用户内容)] }
                //      editor context 作为带 `hide_from_ui` 标记的 SystemMessage 注入,
                //      会被 checkpoint 持久化,前端根据标记过滤不显示
                //    - resume: new Command({ resume: payload })
                let input: { messages: Array<HumanMessage | SystemMessage> } | Command;
                if (record.isResume) {
                    input = new Command({ resume: record.pendingResume });
                } else {
                    const ctx = formatEditorContext(record.snapshot.requestContext);
                    const messages: Array<HumanMessage | SystemMessage> = [];
                    if (ctx.formatted) {
                        messages.push(
                            new SystemMessage({
                                content: ctx.formatted,
                                additional_kwargs: { hide_from_ui: true },
                            }),
                        );
                    }
                    messages.push(new HumanMessage(record.snapshot.content));
                    input = { messages };
                }

                langgraphSpan.addEvent('stream_started', {
                    runId: record.id,
                    threadId: record.threadId,
                    provider: record.runContext.llmConfig.provider,
                    model: record.runContext.llmConfig.model,
                });

                // 4. 流式执行 — 多 streamMode 时 chunk 形如 [mode, payload]
                const stream = await graph.stream(input, {
                    streamMode: ['messages', 'values', 'tasks'],
                    configurable: {
                        thread_id: record.threadId,
                        chatModel,
                        tools: frontendTools,
                        abortSignal: record.abortSignal,
                        // OTel: 注入给 llm-node 用于 span attributes
                        provider: record.runContext.llmConfig.provider,
                        model: record.runContext.llmConfig.model,
                        llmRound: 1,
                    },
                    metadata: {
                        runId: record.id,
                        threadId: record.threadId,
                        provider: record.runContext.llmConfig.provider,
                        model: record.runContext.llmConfig.model,
                    },
                    signal: record.abortSignal,
                });

                // 5. 透传 LangGraph 事件 → SSE
                let hasInterrupt = false;
                let firstChunkEmitted = false;

                for await (const chunk of stream as AsyncIterable<unknown>) {
                    if (record.abortSignal.aborted) break;

                    if (!Array.isArray(chunk) || chunk.length < 2) continue;
                    const [mode, payload] = chunk as [string, unknown];

                    if (!firstChunkEmitted) {
                        langgraphSpan.addEvent('first_chunk_emitted', { mode });
                        firstChunkEmitted = true;
                    }

                    if (mode === 'messages') {
                        // payload 形如 [BaseMessage(Chunk), metadata]
                        // 将 BaseMessage 序列化为 plain dict，SDK 端能反序列化为 chunk
                        const data = this.serializeMessagesPayload(payload);
                        // 高频 token 事件，仅写 SSE 不持久化
                        record.emitSSEOnly({ event: 'messages', data });
                        continue;
                    }

                    if (mode === 'values') {
                        // payload 是状态快照 { messages, threadId, error, [__interrupt__] }
                        const data = this.serializeValuesPayload(payload);
                        const valueData =
                            data && typeof data === 'object'
                                ? (data as Record<string, unknown>)
                                : null;
                        const hasInterruptOnChunk = Boolean(
                            valueData &&
                                '__interrupt__' in valueData &&
                                Array.isArray(valueData.__interrupt__) &&
                                (valueData.__interrupt__ as unknown[]).length > 0,
                        );
                        if (hasInterruptOnChunk) {
                            hasInterrupt = true;
                        }
                        langgraphSpan.addEvent('values_emitted', {
                            hasInterrupt: hasInterruptOnChunk,
                            messageCount: Array.isArray(valueData?.messages)
                                ? (valueData.messages as unknown[]).length
                                : 0,
                        });
                        await record.emitEvent({ event: 'values', data });
                    }

                    if (mode === 'tasks') {
                        const data = payload;
                        const hasInterruptOnChunk = this.hasTaskInterrupts(data);
                        if (hasInterruptOnChunk) {
                            hasInterrupt = true;
                        }
                        langgraphSpan.addEvent('tasks_emitted', {
                            hasInterrupt: hasInterruptOnChunk,
                        });
                        await record.emitEvent({ event: 'tasks', data });
                    }
                    // TODO 其他 streamMode 暂不处理
                }

                // 6. 终态判定
                if (record.abortSignal.aborted) {
                    record.setStatus(RunStatus.Cancelled);
                    await this.runManager.setStatus(record.id, RunStatus.Cancelled);
                } else if (hasInterrupt) {
                    record.setStatus(RunStatus.Interrupted);
                    await this.runManager.setStatus(record.id, RunStatus.Interrupted);
                } else {
                    record.setStatus(RunStatus.Completed);
                    await this.runManager.setStatus(record.id, RunStatus.Completed);
                }

                langgraphSpan.addEvent('stream_completed', { status: record.status });
                langgraphSpan.setStatus({ code: SpanStatusCode.OK });
                await record.emitEvent({ event: 'end', data: {} });
            });
        } catch (error) {
            this.logger.error(`Run ${record.id} failed: ${error}`, (error as Error).stack);
            langgraphSpan.setStatus({
                code: SpanStatusCode.ERROR,
                message: (error as Error).message,
            });
            langgraphSpan.recordException(error as Error);
            record.setStatus(RunStatus.Failed);
            await this.runManager.setStatus(record.id, RunStatus.Failed);
            await record.emitEvent({
                event: 'error',
                data: { error: 'execution_error', message: (error as Error).message },
            });
        } finally {
            langgraphSpan.end();
            await this.runManager.finalize(record.id);
            await record.runContext.eventStore.flushRun(record.id);
        }
    }

    /**
     * 取消 Run
     */
    async cancel(runId: string): Promise<void> {
        const record = this.runManager.getRun(runId);
        if (!record) {
            throw new NotFoundException(`Run not found: ${runId}`);
        }
        await this.runManager.cancelRun(runId);
    }

    // ========== Private Helpers ==========

    /**
     * 将 messages-tuple payload 序列化为 SDK 友好的格式
     *
     * LangGraph 内部 payload = [BaseMessage 实例, metadata]
     * SDK MessageTupleManager.add(serialized, metadata) 期望 `serialized.type`
     * 是字符串（"ai" / "AIMessageChunk" / "human" 等），所以我们用 toDict() 平铺。
     */
    private serializeMessagesPayload(payload: unknown): unknown {
        if (!Array.isArray(payload) || payload.length < 1) {
            return payload;
        }
        const [msg, metadata] = payload as [unknown, unknown];
        return [this.serializeMessage(msg), metadata ?? {}];
    }

    /**
     * 将 values payload(状态快照)序列化 — 把 messages 数组中的 BaseMessage 转 dict
     */
    private serializeValuesPayload(payload: unknown): unknown {
        if (!payload || typeof payload !== 'object') return payload;
        const obj = payload as Record<string, unknown>;
        const result: Record<string, unknown> = { ...obj };
        if (Array.isArray(obj.messages)) {
            result.messages = obj.messages.map(m => this.serializeMessage(m));
        }
        return result;
    }

    private hasTaskInterrupts(payload: unknown): boolean {
        if (Array.isArray(payload)) {
            return payload.some(item => this.hasTaskInterrupts(item));
        }
        if (!payload || typeof payload !== 'object') {
            return false;
        }

        const interrupts = (payload as { interrupts?: unknown }).interrupts;
        return Array.isArray(interrupts) && interrupts.length > 0;
    }

    /**
     * BaseMessage → SDK 友好的 dict
     * 优先使用 LangChain 的 toDict()，回退到结构化提取
     */
    private serializeMessage(msg: unknown): unknown {
        if (!msg || typeof msg !== 'object') return msg;
        const m = msg as Record<string, unknown> & {
            toDict?: () => { type: string; data: Record<string, unknown> };
            _getType?: () => string;
        };

        if (typeof m.toDict === 'function') {
            const { type, data } = m.toDict();
            // SDK 检查 serialized.type.endsWith("MessageChunk")
            // toDict 返回的 type 通常是 "constructor" / "human" / "ai" 等
            // 用 _getType() 的值更稳：'human' | 'ai' | 'tool' | 'system' | ...
            const lcType = typeof m._getType === 'function' ? m._getType() : type;
            return { ...data, type: lcType };
        }

        // 已经是 plain dict（来自 reducer / checkpoint）
        return m;
    }

    /** 返回 provider 注册的默认 LLMConfig（resume 时 RunRow.llmConfig 缺失的兜底） */
    private resolveDefaultLlmConfig(): LLMConfig {
        const cfg = this.providerRegistry.defaultConfig;
        if (!cfg) throw new Error('No LLM provider configured');
        return cfg;
    }

    /**
     * 解析并校验 llmConfig
     */
    private resolveLlmConfig(override?: { provider?: string; model?: string }): LLMConfig {
        const defaultConfig = this.providerRegistry.defaultConfig;
        if (!defaultConfig) {
            throw new Error('No LLM provider configured');
        }

        const merged: LLMConfig = override
            ? { ...defaultConfig, ...override }
            : { ...defaultConfig };

        if (!merged.provider) {
            throw new Error('LLM config: provider is required');
        }
        if (!merged.model) {
            throw new Error('LLM config: model is required');
        }
        if (!this.providerRegistry.isRegistered(merged.provider)) {
            const available = this.providerRegistry.registeredProviders;
            throw new Error(
                `Unknown provider "${merged.provider}". Available: ${available.join(', ') || 'none'}`,
            );
        }

        return merged;
    }

    /**
     * 基于 RunContext 编译 ChatGraph
     */
    // biome-ignore lint/suspicious/noExplicitAny: compiled graph type varies by StateGraph generic params
    private compileGraph(context: RunContext): any {
        const chatGraph = new ChatGraph();
        const graph = chatGraph.createGraph();
        return graph.compile({ checkpointer: context.checkpointer });
    }

    /**
     * 并发控制处理（LangGraph multitask_strategy 对齐）
     */
    private async handleConcurrency(
        activeRun: RunRecord,
        strategy: MultitaskStrategy,
    ): Promise<void> {
        switch (strategy) {
            case 'reject':
                throw new ConflictException('Run already in progress for this thread');

            case 'interrupt':
                activeRun.abort();
                await new Promise(resolve => setTimeout(resolve, 100));
                break;

            case 'rollback':
                activeRun.abort();
                await new Promise(resolve => setTimeout(resolve, 100));
                break;

            case 'enqueue':
                this.logger.warn(
                    `multitask_strategy 'enqueue' not yet supported, falling back to 'reject'`,
                );
                throw new ConflictException('Run already in progress for this thread');
        }
    }
}
