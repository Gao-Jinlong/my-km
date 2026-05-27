import { Logger } from '@nestjs/common';
import type { LLMMessage } from '../ai.types';
import type { GraphConfig, WorkflowState } from '../langgraph';
import type { LLMConfig } from '../llm/provider.types';
import type { ToolDispatcher } from '../tools/tool.dispatcher';
import type { ToolRouter } from '../tools/tool-router';
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

export class AgentExecutor {
    private readonly logger = new Logger(AgentExecutor.name);
    private graphCache = new Map<string, unknown>();
    private readonly maxToolRounds = 10;

    constructor(
        private ctx: AgentExecutorCtx,
        private deps: {
            graphRegistry: GraphRegistry;
            llmResolver: LLMResolver;
            toolDispatcher: ToolDispatcher;
            toolRouter: ToolRouter;
        },
    ) {}

    async execute(): Promise<{ output: string }> {
        const {
            sessionId,
            agentId,
            callbacks,
            abortSignal,
            llmConfig,
            graphName = 'chat',
        } = this.ctx;

        const graphDef = this.deps.graphRegistry.get(graphName);
        const graph = this.getOrCreateGraph(graphDef);
        const llmCaller = this.createLLMCaller(llmConfig);
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
            let round = 0;
            let lastState: Partial<WorkflowState> | null = null;

            while (round < this.maxToolRounds) {
                round++;

                if (abortSignal.aborted) {
                    callbacks.onStatus(sessionId, agentId, 'cancelled');
                    return { output: '' };
                }

                const stream = await graph.stream(initialState, { configurable });
                for await (const state of stream) {
                    lastState = state as Partial<WorkflowState>;
                    if (abortSignal.aborted) {
                        callbacks.onStatus(sessionId, agentId, 'cancelled');
                        return { output: '' };
                    }
                }

                if (!lastState?.hasToolCalls || !lastState.pendingToolCalls?.length) {
                    break;
                }

                this.logger.warn(
                    `Agent ${agentId} produced tool calls but agent executor does not support frontend tools.`,
                );
                break;
            }

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

    private createLLMCaller(config?: LLMConfig) {
        return async function* (messages: LLMMessage[], signal?: AbortSignal) {
            const provider = this.deps.llmResolver.resolve('llm_call', undefined, config);
            const tools = this.deps.toolDispatcher.getDefinitions();
            yield* provider.chat(messages, tools, signal);
        }.bind(this);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private getOrCreateGraph(graphDef: { name: string; createGraph: () => any }): any {
        const cacheKey = graphDef.name;
        if (!this.graphCache.has(cacheKey)) {
            const graph = graphDef.createGraph();
            this.graphCache.set(cacheKey, graph);
            this.logger.debug(`Agent graph compiled: ${cacheKey}`);
        }
        return this.graphCache.get(cacheKey);
    }
}
