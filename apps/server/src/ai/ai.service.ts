/**
 * AiChatService — AI 对话业务逻辑层
 *
 * 职责：
 * - startRun: 创建 thread + run，执行 LLM 对话
 * - resume: 恢复中断的 run（前端工具调用结果）
 * - cancel: 取消活跃的 run
 * - 并发控制（rejected / interrupt / rollback）
 *
 * Controller 只做 DTO 校验和 SSE header 设置，
 * 所有业务逻辑都在这里。
 */

import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Response } from 'express';
import { ChatGraph } from './langgraph/graphs/chat-graph';
import { LLMFactory } from './llm/llm-factory';
import type { LLMConfig } from './llm/provider.types';
import { ProviderRegistry } from './llm/provider-registry';
import type { RunContext } from './run/run-context';
import { RunContextFactory } from './run/run-context-factory';
import { RunManager } from './run/run-manager';
import { RunRecord } from './run/run-record';
import {
    contentBlockFinish,
    contentBlockStart,
    encodeSSE,
    errorEvent,
    lifecycleCompleted,
    lifecycleFailed,
    lifecycleInterrupted,
    lifecycleStarted,
    messageFinish,
    messageStart,
    resetMessageSeq,
    textDelta,
    toolStarted,
    valuesSnapshot,
} from './sse/ai-stream.protocol';
import { ThreadService } from './thread/thread.service';
import { frontendToolDefinitions } from './tools/tool-definitions';
import type { TokenUsage } from './types/ai.types';
import { ConcurrencyPolicy, RunStatus } from './types/run.types';

export interface StartRunOpts {
    content: string;
    threadId?: string;
    context?: Record<string, unknown>;
    concurrency?: ConcurrencyPolicy;
    llmConfig?: { provider?: string; model?: string };
}

export interface ResumeOpts {
    runId: string;
    toolCallId: string;
    result: unknown;
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
     * 2. 并发控制检查
     * 3. resolve + validate llmConfig
     * 4. 创建 per-run RunContext
     * 5. 创建 typed RunRecord
     */
    async startRun(opts: StartRunOpts): Promise<RunRecord> {
        const { content, threadId, concurrency = ConcurrencyPolicy.Rejected } = opts;

        // 1. findOrCreate thread
        const thread = await this.threadService.findOrCreate(threadId, {
            title: content.slice(0, 20) || 'New Chat',
        });

        // 2. 并发控制（在创建 RunContext 之前处理）
        const activeRun = this.runManager.getActiveRunForThread(thread.id);
        if (activeRun) {
            await this.handleConcurrency(activeRun, concurrency);
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
     * 执行 Run（由 Controller 调用，传入 SSE response）
     *
     * 这一步在 controller 中调用是因为需要 access to Response 对象。
     * 基于 record.runContext 编译 graph 和创建 provider。
     */
    async executeRun(record: RunRecord, res: Response): Promise<void> {
        const send = (event: { event: string; data: unknown }) => {
            if (!res.writableEnded) {
                res.write(encodeSSE(event));
            }
        };

        record.setSseWriter(send);

        try {
            // 发送 lifecycle:started
            await record.emitEvent(lifecycleStarted(record.threadId, record.id));

            // 基于 record.runContext 编译 graph
            const graph = this.compileGraph(record.runContext);

            // 使用 record.runContext.llmConfig 创建 provider
            const llmProvider = this.llmFactory.getOrCreate(record.runContext.llmConfig);
            const content = record.snapshot.content;
            const tools = frontendToolDefinitions;

            // 构建 LLM caller
            const llmCaller = async function* (messages: any[], abortSignal?: AbortSignal) {
                yield* llmProvider.chat(
                    messages,
                    tools.length > 0 ? tools : undefined,
                    abortSignal,
                );
            };

            // 构建 user message
            const userMessage = {
                role: 'user' as const,
                content,
            };

            // 流式执行 graph
            const messageId = `msg-${Date.now()}`;
            resetMessageSeq();
            send(messageStart(messageId));
            send(contentBlockStart(0, messageId));

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

            // 消费 graph 输出流
            let iterationCount = 0;
            const MAX_ITERATIONS = 20; // 防止无限循环

            for await (const output of stream) {
                iterationCount++;
                if (iterationCount > MAX_ITERATIONS) {
                    this.logger.warn(`Run ${record.id}: max iterations reached, stopping`);
                    break;
                }

                if (record.abortSignal.aborted) break;

                // graph 输出包含每个节点的状态更新
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

            // 发送结果
            send(contentBlockFinish(0, messageId, assistantText));

            if (record.abortSignal.aborted) {
                send(messageFinish(messageId, 'stopped'));
                record.setStatus(RunStatus.Cancelled);
                await record.emitEvent(lifecycleCompleted());
            } else if (toolCalls.length > 0) {
                send(messageFinish(messageId, 'tool_use'));
                for (const tc of toolCalls) {
                    await record.emitEvent(toolStarted(tc.id, tc.name, tc.arguments));
                }
                record.setStatus(RunStatus.Interrupted);
                await record.emitEvent(lifecycleInterrupted());
            } else {
                send(messageFinish(messageId));
                await record.emitEvent(
                    valuesSnapshot({
                        messages: [{ role: 'ai', content: assistantText }],
                        threadId: record.threadId,
                    }),
                );
                record.setStatus(RunStatus.Completed);
                await record.emitEvent(lifecycleCompleted());

                // 更新 thread 消息计数
                this.threadService.incrementMessageCount(record.threadId).catch(() => {});
            }
        } catch (error) {
            this.logger.error(`Run ${record.id} failed: ${error}`, (error as Error).stack);
            record.setStatus(RunStatus.Failed);
            await record.emitEvent(errorEvent('execution_error', (error as Error).message));
            await record.emitEvent(lifecycleFailed((error as Error).message));
        } finally {
            record.finalize();
            if (!res.writableEnded) {
                res.end();
            }
        }
    }

    /**
     * 恢复中断的 Run
     *
     * 返回原 RunRecord（持有原始 RunContext），不重新创建 context。
     */
    async resume(opts: ResumeOpts): Promise<RunRecord> {
        const { runId } = opts;

        const record = this.runManager.getRun(runId);
        if (!record) {
            throw new NotFoundException(`Run not found: ${runId}`);
        }

        if (record.status !== RunStatus.Interrupted) {
            throw new ConflictException(
                `Run ${runId} is not interrupted (status: ${record.status})`,
            );
        }

        record.setStatus(RunStatus.Running);
        return record;
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
     * 并发控制处理
     */
    private async handleConcurrency(
        activeRun: RunRecord,
        policy: ConcurrencyPolicy,
    ): Promise<void> {
        switch (policy) {
            case ConcurrencyPolicy.Rejected:
                throw new ConflictException('Run already in progress for this thread');

            case ConcurrencyPolicy.Interrupt:
                activeRun.abort();
                // 等待 abort 完成
                await new Promise(resolve => setTimeout(resolve, 100));
                break;

            case ConcurrencyPolicy.Rollback:
                activeRun.abort();
                await new Promise(resolve => setTimeout(resolve, 100));
                // rollback checkpoint 语义待实现（当前阶段 TODO）
                break;
        }
    }
}
