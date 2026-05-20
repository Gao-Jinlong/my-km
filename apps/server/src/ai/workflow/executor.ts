/**
 * Executor — per-execution instance for running a single LLM对话 cycle.
 *
 * Phase 4 rewrite: NOT a NestJS singleton. Created fresh by RequestDispatcher
 * for each dispatch call, then discarded after execute() completes.
 *
 * Lifecycle:
 *   1. Build context (MessageService.buildLLMHistory)
 *   2. Persist user message
 *   3. Call LLM (stream)
 *   4. Handle tool calls loop (route → wait for results → re-call LLM)
 *   5. Persist assistant message
 *   6. Signal completion via callbacks
 */

import { Logger } from '@nestjs/common';
import type { LLMMessage } from '../ai.types';
import type { GraphConfig, WorkflowMessage, WorkflowState } from '../langgraph';
import type { ExecutionCtx, ExecutorDependencies, WorkflowToolCall } from './executor.types';

export class Executor {
    private readonly logger = new Logger(Executor.name);
    private readonly maxToolRounds = 10;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private graphCache = new Map<string, any>();

    constructor(
        private ctx: ExecutionCtx,
        private deps: ExecutorDependencies,
    ) {}

    async execute(): Promise<void> {
        const {
            roomId,
            content,
            callbacks,
            abortSignal,
            llmConfigMap,
            graphName = 'chat',
        } = this.ctx;

        const graphDef = this.deps.graphRegistry.get(graphName);
        const graph = this.getOrCreateGraph(graphDef);

        // Build LLM history from database
        const history = await this.deps.messageService.buildLLMHistory(roomId);

        // Create LLM caller function
        const llmCaller = this.createLLMCaller(llmConfigMap);

        // Get tool definitions
        const tools = this.deps.toolDispatcher.getDefinitions() as GraphConfig['tools'];

        // Configurable context for graph execution
        const configurable: Partial<GraphConfig> = {
            llmCaller,
            tools,
            onChunk: (chunkContent: string) => {
                callbacks.onTextChunk(roomId, chunkContent);
            },
        };

        // Initial state for this execution
        const initialState: Partial<WorkflowState> = {
            messages: [{ role: 'user' as const, content }],
            roomId,
            lastAssistantMessage: '',
            hasToolCalls: false,
            pendingToolCalls: [],
            toolResults: {},
            error: undefined,
            isDone: false,
        };

        try {
            let round = 0;
            const currentMessages = [...history];

            while (round < this.maxToolRounds) {
                round++;

                // Abort check
                if (abortSignal.aborted) {
                    callbacks.onStop?.(roomId);
                    return;
                }

                // Execute graph stream
                let lastState: Partial<WorkflowState> | null = null;
                const stream = await graph.stream(initialState, { configurable });
                for await (const state of stream) {
                    lastState = state as Partial<WorkflowState>;

                    // Abort check mid-stream
                    if (abortSignal.aborted) {
                        callbacks.onStop?.(roomId);
                        return;
                    }
                }

                // Check for tool calls
                if (!lastState?.hasToolCalls || !lastState.pendingToolCalls?.length) {
                    break; // No more tool calls — done
                }

                // Persist assistant message with tool calls
                await this.deps.messageService.create({
                    roomId,
                    role: 'assistant',
                    content: lastState.lastAssistantMessage || null,
                    toolCalls: lastState.pendingToolCalls.map(tc => ({
                        id: tc.id,
                        name: tc.name,
                        arguments: tc.arguments,
                        timestamp: new Date(),
                    })),
                });

                // Emit tool call events + route for execution
                for (const tc of lastState.pendingToolCalls) {
                    const requiresConfirmation = this.deps.toolRouter.needsConfirmation(tc.name);
                    this.deps.toolRouter.route(tc.name, tc.arguments, roomId, tc.id);

                    callbacks.onToolCall(roomId, {
                        toolCallId: tc.id,
                        toolName: tc.name,
                        input: tc.arguments,
                        requiresConfirmation,
                    });
                }

                // Wait for tool results from frontend
                const results = await this.deps.toolDispatcher.waitForResultsByRoom(
                    roomId,
                    lastState.pendingToolCalls.map(tc => ({
                        id: tc.id,
                        name: tc.name,
                        arguments: tc.arguments,
                        timestamp: new Date(),
                    })),
                    30000,
                );

                if (!results) {
                    this.logger.warn(`Tool execution timed out for room ${roomId}`);
                    callbacks.onTimeout?.(
                        roomId,
                        `Tool execution timed out after 30s for ${lastState.pendingToolCalls.map(tc => tc.name).join(', ')}`,
                    );
                    break;
                }

                // Persist tool results
                for (const [toolId, result] of Object.entries(results)) {
                    const resultStr = typeof result === 'string' ? result : JSON.stringify(result);
                    await this.deps.messageService.create({
                        roomId,
                        role: 'tool',
                        content: resultStr,
                        toolResultId: toolId,
                    });

                    currentMessages.push({
                        role: 'tool' as const,
                        content: [
                            {
                                type: 'tool_result',
                                tool_use_id: toolId,
                                content: resultStr,
                            },
                        ],
                    });
                }

                // Prepare state for next LLM round
                const toolResultMessages: WorkflowMessage[] = Object.entries(results).map(
                    ([toolId, r]) => {
                        const resultStr = typeof r === 'string' ? r : JSON.stringify(r);
                        return {
                            role: 'tool' as const,
                            content: [
                                {
                                    type: 'tool_result' as const,
                                    tool_use_id: toolId,
                                    content: resultStr,
                                },
                            ],
                        };
                    },
                );

                initialState.messages = [
                    { role: 'user' as const, content },
                    ...(lastState.lastAssistantMessage
                        ? [{ role: 'assistant' as const, content: lastState.lastAssistantMessage }]
                        : []),
                    ...toolResultMessages,
                ];
                initialState.pendingToolCalls = [];
                initialState.hasToolCalls = false;
                initialState.toolResults = results;
            }

            if (round >= this.maxToolRounds) {
                this.logger.warn(
                    `Max tool rounds (${this.maxToolRounds}) exceeded for room ${roomId}`,
                );
            }

            // Persist final assistant message if any
            // (Already persisted during tool call rounds; only persist if no tool calls occurred)
            // Signal completion
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

    /**
     * Create LLM caller function bridging LLMProvider to LangGraph's LLMCaller interface.
     */
    private createLLMCaller(configMap?: import('../llm/provider.types').NodeLLMConfigMap) {
        return async function* (messages: LLMMessage[], signal?: AbortSignal) {
            const provider = this.deps.llmResolver.resolve('llm_call', configMap);
            const tools = this.deps.toolDispatcher.getDefinitions();
            yield* provider.chat(messages, tools, signal);
        }.bind(this);
    }

    /**
     * Get or cache compiled graph instance.
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private getOrCreateGraph(graphDef: { name: string; createGraph: () => any }): any {
        const cacheKey = graphDef.name;
        if (!this.graphCache.has(cacheKey)) {
            const graph = graphDef.createGraph();
            this.graphCache.set(cacheKey, graph);
            this.logger.debug(`Graph compiled: ${cacheKey}`);
        }
        return this.graphCache.get(cacheKey);
    }
}
