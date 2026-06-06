/**
 * AiChatService — AI 对话业务逻辑层
 *
 * 职责：
 * - startRun: 创建 thread + run，执行 LLM 对话
 * - resumeFromCommand: 通过 LangGraph SDK 的 command.resume 机制恢复 run
 * - cancel: 取消活跃的 run
 * - 并发控制（multitask_strategy: reject / interrupt / rollback / enqueue）
 *
 * Controller 只做 DTO 校验和 SSE header 设置，
 * 所有业务逻辑都在这里。
 */

import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Response } from 'express';
import { ChatGraph } from './langgraph/graphs/chat-graph';
import {
    toLangChainMessages,
    writeEnd,
    writeError,
    writeMetadata,
    writeValues,
} from './langgraph/langgraph-protocol';
import { LLMFactory } from './llm/llm-factory';
import type { LLMConfig } from './llm/provider.types';
import { ProviderRegistry } from './llm/provider-registry';
import type { RunContext } from './run/run-context';
import { RunContextFactory } from './run/run-context-factory';
import { RunManager } from './run/run-manager';
import { RunRecord } from './run/run-record';
import { ThreadService } from './thread/thread.service';
import { frontendToolDefinitions } from './tools/tool-definitions';
import { type MultitaskStrategy, RunStatus } from './types/run.types';

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
    ) {}

    /**
     * 启动一个新的 Run
     *
     * 1. findOrCreate thread
     * 2. 并发控制检查（multitask_strategy）
     * 3. resolve + validate llmConfig
     * 4. 创建 per-run RunContext
     * 5. 创建 typed RunRecord
     */
    async startRun(opts: StartRunOpts): Promise<RunRecord> {
        const { content, threadId, multitaskStrategy = 'reject' } = opts;

        // 1. findOrCreate thread
        const thread = await this.threadService.findOrCreate(threadId, {
            title: content.slice(0, 20) || 'New Chat',
        });

        // 2. 并发控制（在创建 RunContext 之前处理）
        const activeRun = this.runManager.getActiveRunForThread(thread.id);
        if (activeRun) {
            await this.handleConcurrency(activeRun, multitaskStrategy);
        }

        // 3. resolve + validate llmConfig
        const llmConfig = this.resolveLlmConfig(opts.llmConfig);

        // 4. 创建 per-run RunContext（llmConfig/requestContext 会被深克隆冻结）
        const runContext = await this.runContextFactory.create({
            llmConfig,
            requestContext: opts.context,
        });

        // 5. 创建 typed RunRecord
        const record = this.runManager.createRun(thread.id, runContext, {
            content,
            requestContext: opts.context,
        });
        record.setStatus(RunStatus.Running);

        return record;
    }

    /**
     * 通过 LangGraph SDK 的 command.resume 机制恢复 Run
     *
     * LangGraph 标准协议中，resume 通过 runs/stream 端点的 body.command.resume 触发，
     * 而非独立的 /runs/:id/resume 端点。
     *
     * 当前实现：在 thread 上查找活跃的 interrupted run 并恢复。
     * resume payload（command.resume）当前未传递到 graph 内部，
     * 未来集成 graph interrupt API 时，此 payload 应作为节点输入。
     */
    async resumeFromCommand(threadId: string, command: { resume?: unknown }): Promise<RunRecord> {
        const record = this.runManager.getActiveRunForThread(threadId);
        if (!record) {
            throw new NotFoundException(`No active run for thread: ${threadId}`);
        }

        if (record.status !== RunStatus.Interrupted) {
            throw new ConflictException(
                `Run ${record.id} is not interrupted (status: ${record.status})`,
            );
        }

        // 记录 resume payload（待 graph 内部消费）
        this.logger.log(
            `Run ${record.id} resuming with command: ${JSON.stringify(command.resume)}`,
        );

        record.setStatus(RunStatus.Running);
        return record;
    }

    /**
     * 执行 Run 并发射 LangGraph Platform 标准协议 SSE 事件
     *
     * 事件流：
     *   1. metadata {run_id, thread_id}     — run 开始
     *   2. values   {messages: [...]}        — 完整状态快照（每轮 LLM 响应后）
     *   3. end      {}                       — 流结束
     *   或
     *   3. error    {error, message}         — 失败
     *
     * 供 @langchain/langgraph-sdk 的 useStream 消费。
     */
    async executeRunProtocol(record: RunRecord, res: Response): Promise<void> {
        try {
            // 1. 发送 metadata 事件（SDK 用此获取 run_id 和 thread_id）
            writeMetadata(res, record.id, record.threadId);

            // 2. 编译 graph 并创建 LLM provider
            const graph = this.compileGraph(record.runContext);
            const llmProvider = this.llmFactory.getOrCreate(record.runContext.llmConfig);
            const content = record.snapshot.content;
            const tools = frontendToolDefinitions;

            const llmCaller = async function* (messages: any[], abortSignal?: AbortSignal) {
                yield* llmProvider.chat(
                    messages,
                    tools.length > 0 ? tools : undefined,
                    abortSignal,
                );
            };

            const userMessage = { role: 'user' as const, content };

            // 3. 流式执行 graph
            let assistantText = '';
            const toolCalls: Array<{
                id: string;
                name: string;
                arguments: Record<string, unknown>;
            }> = [];

            const stream = await graph.stream(
                { messages: [userMessage] },
                {
                    configurable: {
                        thread_id: record.threadId,
                        llmCaller,
                        tools,
                        abortSignal: record.abortSignal,
                        onChunk: (chunk: string) => {
                            assistantText += chunk;
                        },
                    },
                },
            );

            // 4. 消费 graph 输出流
            let iterationCount = 0;
            const MAX_ITERATIONS = 20;

            for await (const output of stream) {
                iterationCount++;
                if (iterationCount > MAX_ITERATIONS) {
                    this.logger.warn(`Run ${record.id}: max iterations reached, stopping`);
                    break;
                }
                if (record.abortSignal.aborted) break;

                if (output.lastAssistantMessage) {
                    assistantText = output.lastAssistantMessage;
                }
                if (output.pendingToolCalls && output.pendingToolCalls.length > 0) {
                    toolCalls.push(...output.pendingToolCalls);
                }
                if (output.error) {
                    throw new Error(output.error);
                }
            }

            // 5. 根据执行结果发送 values 事件
            const accumulatedMessages: Array<{ role: string; content: string }> = [
                { role: 'human', content },
            ];
            if (assistantText) {
                accumulatedMessages.push({ role: 'ai', content: assistantText });
            }

            // 发送 values 快照（SDK 用此更新 messages 列表）
            writeValues(res, toLangChainMessages(accumulatedMessages));

            if (record.abortSignal.aborted) {
                record.setStatus(RunStatus.Cancelled);
            } else if (toolCalls.length > 0) {
                // tool interrupt — run 保持 interrupted 状态等待 resume
                // SDK 通过 values 事件中的 ai message tool_calls 字段感知中断
                record.setStatus(RunStatus.Interrupted);
            } else {
                record.setStatus(RunStatus.Completed);
                this.threadService.incrementMessageCount(record.threadId).catch(() => {});
            }

            // 6. 发送 end 事件结束流
            writeEnd(res);
        } catch (error) {
            this.logger.error(`Run ${record.id} failed: ${error}`, (error as Error).stack);
            record.setStatus(RunStatus.Failed);
            writeError(res, 'execution_error', (error as Error).message);
        } finally {
            record.finalize();
            if (!res.writableEnded) {
                res.end();
            }
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
        this.runManager.cancelRun(runId);
    }

    // ========== Private Helpers ==========

    /**
     * 解析并校验 llmConfig
     *
     * 1. 读取 ProviderRegistry.defaultConfig
     * 2. 与 opts.llmConfig 合并
     * 3. 校验 provider/model 必填
     * 4. 校验 provider 已注册
     *
     * 后续 executeRun() 只使用快照，不再读取默认配置。
     */
    private resolveLlmConfig(override?: { provider?: string; model?: string }): LLMConfig {
        const defaultConfig = this.providerRegistry.defaultConfig;
        if (!defaultConfig) {
            throw new Error('No LLM provider configured');
        }

        const merged: LLMConfig = override
            ? { ...defaultConfig, ...override }
            : { ...defaultConfig };

        // 校验
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
     *
     * graph 编译是执行流程的一部分，不是 context 快照本身。
     * 每次执行都重新编译（未来可按 profiling 引入 GraphCompiler cache）。
     */
    // biome-ignore lint/suspicious/noExplicitAny: compiled graph type varies by StateGraph generic params
    private compileGraph(context: RunContext): any {
        const chatGraph = new ChatGraph();
        const graph = chatGraph.createGraph();
        return graph.compile({ checkpointer: context.checkpointer });
    }

    /**
     * 并发控制处理（LangGraph multitask_strategy 对齐）
     *
     * - 'reject'    — 抛 ConflictException（默认）
     * - 'interrupt' — abort 当前 run，等待 100ms 后继续
     * - 'rollback'  — abort + rollback checkpoint（当前仅 abort，rollback 语义 TODO）
     * - 'enqueue'   — 真正排队需要持久化的 RunQueue，当前未实现 → fallback 到 'reject' 并 logger.warn
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
                // 等待 abort 完成
                await new Promise(resolve => setTimeout(resolve, 100));
                break;

            case 'rollback':
                activeRun.abort();
                await new Promise(resolve => setTimeout(resolve, 100));
                // rollback checkpoint 语义待实现（当前阶段 TODO）
                break;

            case 'enqueue':
                this.logger.warn(
                    `multitask_strategy 'enqueue' not yet supported, falling back to 'reject'`,
                );
                throw new ConflictException('Run already in progress for this thread');
        }
    }
}
