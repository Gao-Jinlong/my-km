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
 * - onAbort / onTimeout (事件处理)
 * - isAborted (中断检查)
 *
 * 设计原则:
 * Executor（实时对话）和 AgentExecutor（离线推理）共享相同的
 * graph 循环结构，但持久化和通信策略不同。BaseExecutor 将共性
 * 提取到受保护方法，子类通过模板方法模式注入差异行为。
 */

import { Logger } from '@nestjs/common';
import type { LLMMessage } from '../ai.types';
import type { BaseGraph, CompiledWorkflowGraph, GraphConfig, WorkflowState } from '../langgraph';
import type { LLMConfig, NodeLLMConfigMap } from '../llm/provider.types';
import type { ToolDispatcher } from '../tools/tool.dispatcher';
import type { ToolRouter } from '../tools/tool-router';
import type { LLMResolver } from './llm-resolver';

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
     * 获取或缓存编译后的 graph 实例。
     * 编译是同步操作，缓存避免重复编译开销。
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
     * 创建 LLM caller — 桥接 LLMProvider 到 LangGraph LLMCaller 接口。
     */
    protected createLLMCaller(configMap?: NodeLLMConfigMap, defaultConfig?: LLMConfig) {
        return async function* (messages: LLMMessage[], signal?: AbortSignal) {
            const provider = this.llmResolver.resolve('llm_call', configMap, defaultConfig);
            const tools = this.toolDispatcher.getDefinitions();
            yield* provider.chat(messages, tools, signal);
        }.bind(this);
    }

    /**
     * 通用 tool loop — 子类通过抽象方法注入持久化和通信行为。
     *
     * 循环流程:
     * 1. 检查 abort
     * 2. graph.stream() 执行一轮
     * 3. 检查 hasToolCalls
     *    - 有: persistAssistant → routeToolCalls → waitForToolResults → persistToolResults → 下一轮
     *    - 无: 退出循环
     *
     * @returns lastState — 最后一轮的状态; hadToolCalls — 是否经历过 tool call round
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
            for await (const update of stream) {
                // LangGraph stream() yields node-keyed partial updates:
                //   { llm_call: { lastAssistantMessage: "...", hasToolCalls: false } }
                //   { tools: { pendingToolCalls: [], hasToolCalls: false } }
                // We merge all node updates into a single flattened state.
                for (const [_nodeName, nodeOutput] of Object.entries(update)) {
                    if (typeof nodeOutput === 'object' && nodeOutput !== null) {
                        lastState = {
                            ...(lastState ?? {}),
                            ...(nodeOutput as Partial<WorkflowState>),
                        };
                    }
                }

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

            // 持久化 assistant 消息（带 tool calls）
            await this.persistAssistant(lastState);

            // 路由工具调用
            await this.routeToolCalls(lastState.pendingToolCalls);

            // 等待前端工具结果
            const results = await this.waitForToolResults(lastState.pendingToolCalls);
            if (!results) {
                this.logger.warn(`Tool execution timed out for room ${initialState.roomId}`);
                this.onTimeout(lastState.pendingToolCalls);
                break;
            }

            // 持久化工具结果（在收到结果之后）
            await this.persistToolResults(lastState.pendingToolCalls, results);

            // 准备下一轮的状态
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

    /**
     * 持久化 assistant 消息（带 tool calls）。
     * 在 waitForToolResults 之前调用。
     */
    protected abstract persistAssistant(state: Partial<WorkflowState>): Promise<void>;

    /**
     * 持久化工具结果消息。
     * 在 waitForToolResults 之后调用，确保 results 不为空。
     */
    protected abstract persistToolResults(
        toolCalls: Array<{ id: string; name: string; arguments: Record<string, unknown> }>,
        results: Record<string, unknown>,
    ): Promise<void>;

    /**
     * 路由工具调用到对应的 handler，并向外发送事件。
     */
    protected abstract routeToolCalls(
        toolCalls: Array<{ id: string; name: string; arguments: Record<string, unknown> }>,
    ): Promise<void>;

    /**
     * 等待前端工具结果返回。
     * @returns 工具结果映射 { toolCallId: result }，超时返回 null
     */
    protected abstract waitForToolResults(
        toolCalls: Array<{ id: string; name: string; arguments: Record<string, unknown> }>,
    ): Promise<Record<string, unknown> | null>;

    /**
     * 检查是否已中断。
     */
    protected abstract isAborted(): boolean;

    /**
     * 处理中断事件。
     */
    protected abstract onAbort(): void;

    /**
     * 处理工具超时事件。
     */
    protected abstract onTimeout(
        toolCalls: Array<{ id: string; name: string; arguments: Record<string, unknown> }>,
    ): void;
}
