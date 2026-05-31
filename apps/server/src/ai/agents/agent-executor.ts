/**
 * AgentExecutor — 离线推理模式。
 *
 * Phase 5 重构:
 * - 继承 BaseExecutor 共享 graph 循环逻辑
 * - 不持久化任何消息（纯内存状态）
 * - 通过回调一次性返回输出
 */

import type { GraphConfig, WorkflowState } from '../langgraph';
import type { LLMConfig } from '../llm/provider.types';
import type { ToolDispatcher } from '../tools/tool.dispatcher';
import type { ToolRouter } from '../tools/tool-router';
import { BaseExecutor } from '../workflow/base-executor';
import type { GraphRegistry } from '../workflow/graph-registry';
import type { LLMResolver } from '../workflow/llm-resolver';
import type { AgentCallbacks } from './agent.types';

export interface AgentExecutorCtx {
    sessionId: string;
    agentId: string;
    input: string;
    callbacks: AgentCallbacks;
    abortSignal: AbortSignal;
    llmConfig?: LLMConfig;
    graphName?: string;
}

export class AgentExecutor extends BaseExecutor {
    private agentGraphCache = new Map<string, unknown>();

    constructor(
        private ctx: AgentExecutorCtx,
        private graphRegistry: GraphRegistry,
        llmResolver: LLMResolver,
        toolDispatcher: ToolDispatcher,
        toolRouter: ToolRouter,
    ) {
        super(llmResolver, toolDispatcher, toolRouter);
    }

    async execute(): Promise<{ output: string }> {
        const { sessionId, agentId, callbacks, abortSignal, graphName = 'chat' } = this.ctx;

        const graphDef = this.graphRegistry.get(graphName);
        const graph = this.getOrCreateAgentGraph(graphDef);
        const llmCaller = this.createLLMCaller(undefined, this.ctx.llmConfig);
        const tools = this.toolDispatcher.getDefinitions() as GraphConfig['tools'];

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
            const { lastState } = await this.runToolLoop(graph as any, initialState, configurable);
            const output = lastState?.lastAssistantMessage ?? '';
            callbacks.onOutput(sessionId, agentId, output);
            return { output };
        } catch (error) {
            if (abortSignal.aborted) {
                callbacks.onStatus(sessionId, agentId, 'cancelled');
                return { output: '' };
            }
            this.logger.error(`AgentExecutor failed for ${agentId}: ${error}`);
            callbacks.onError(
                sessionId,
                agentId,
                error instanceof Error ? error.message : 'Execution failed',
            );
            return { output: '' };
        }
    }

    /**
     * Agent-specific graph cache — 允许返回 unknown 类型，
     * 因为 AgentExecutor 的 graphRegistry.get() 可能返回非标准图。
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private getOrCreateAgentGraph(graphDef: { name: string; createGraph: () => any }): any {
        const cacheKey = graphDef.name;
        if (!this.agentGraphCache.has(cacheKey)) {
            const graph = graphDef.createGraph();
            this.agentGraphCache.set(cacheKey, graph);
            this.logger.debug(`Agent graph compiled: ${cacheKey}`);
        }
        return this.agentGraphCache.get(cacheKey);
    }

    // ========== BaseExecutor 抽象方法实现 ==========
    // 离线模式：不需要持久化

    protected async persistAssistant(): Promise<void> {
        // no-op — offline mode
    }

    protected async persistToolResults(): Promise<void> {
        // no-op — offline mode
    }

    protected async persistFinal(): Promise<void> {
        // no-op — offline mode
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
