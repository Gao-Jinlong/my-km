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
import type { BaseGraph, CompiledWorkflowGraph, GraphConfig, WorkflowState } from '../langgraph';
import type { ExecutionCtx, ExecutorDependencies } from './executor.types';

export class Executor {
    private readonly logger = new Logger(Executor.name);
    private readonly maxToolRounds = 10;
    private graphCache = new Map<string, CompiledWorkflowGraph>();

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

        // Persist user message before calling LLM
        await this.deps.messageService.create({
            roomId,
            role: 'user',
            content,
        });
        this.deps.roomService.incrementMessageCount(roomId).catch(() => {});

        // Re-build history to include the just-persisted user message
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
        // History already contains the just-persisted user message
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
            let round = 0;
            let hadToolCallsInAnyRound = false;
            let lastState: Partial<WorkflowState> | null = null;

            while (round < this.maxToolRounds) {
                round++;

                // Abort check
                if (abortSignal.aborted) {
                    callbacks.onStop?.(roomId);
                    return;
                }

                // Execute graph stream
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

                hadToolCallsInAnyRound = true;

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
                }

                // Prepare state for next LLM round — reload full history from DB
                // to ensure the LLM sees all prior messages including new tool results
                const refreshedHistory = await this.deps.messageService.buildLLMHistory(roomId);
                initialState.messages = [...refreshedHistory];
                initialState.pendingToolCalls = [];
                initialState.hasToolCalls = false;
                initialState.toolResults = results;
            }

            if (round >= this.maxToolRounds) {
                this.logger.warn(
                    `Max tool rounds (${this.maxToolRounds}) exceeded for room ${roomId}`,
                );
            }

            // Persist final assistant message when no tool calls occurred in any round.
            // (Tool-call rounds already persist assistant messages inside the loop.)
            if (!hadToolCallsInAnyRound && lastState?.lastAssistantMessage) {
                await this.deps.messageService.create({
                    roomId,
                    role: 'assistant',
                    content: lastState.lastAssistantMessage,
                });
                this.deps.roomService.incrementMessageCount(roomId).catch(() => {});
            }

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
        const defaultConfig = this.ctx.defaultConfig;
        return async function* (messages: LLMMessage[], signal?: AbortSignal) {
            const provider = this.deps.llmResolver.resolve('llm_call', configMap, defaultConfig);
            const tools = this.deps.toolDispatcher.getDefinitions();
            yield* provider.chat(messages, tools, signal);
        }.bind(this);
    }

    /**
     * Get or cache compiled graph instance.
     */
    private getOrCreateGraph(graphDef: BaseGraph) {
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
}
