/**
 * Executor — 实时对话模式。
 *
 * Phase 5 重构:
 * - 继承 BaseExecutor 共享 graph 循环逻辑
 * - 通过 MessageStore 处理消息持久化（替代直接调用 MessageService）
 * - 通过 WorkflowCallbacks 处理 WebSocket 事件发射
 *
 * 生命周期:
 *   1. MessageStore.init() — 从存储加载历史
 *   2. MessageStore.persistUser() — 写入用户消息
 *   3. MessageStore.buildHistory() — 构建 LLM 上下文
 *   4. runToolLoop() — graph.stream + tool round（由 BaseExecutor 提供）
 *   5. MessageStore.persistFinal() — 写入最终助手消息
 *   6. callbacks.onLlmDone() — 通知前端完成
 */

import type { GraphConfig, WorkflowState } from '../langgraph';
import { BaseExecutor } from './base-executor';
import type { ExecutionCtx, ExecutorDependencies } from './executor.types';

export class Executor extends BaseExecutor {
    constructor(
        private ctx: ExecutionCtx,
        private deps: ExecutorDependencies,
    ) {
        super(deps.llmResolver, deps.toolDispatcher, deps.toolRouter);
    }

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
        const llmCaller = this.createLLMCaller(llmConfigMap, this.ctx.defaultConfig);

        // 通过 MessageStore 加载历史
        await this.deps.messageStore.init(roomId, this.ctx.tokenLimit);
        await this.deps.messageStore.persistUser(roomId, content);
        this.deps.roomService.incrementMessageCount(roomId).catch(() => {});

        const history = this.deps.messageStore.buildHistory(roomId);
        const tools = this.deps.toolDispatcher.getDefinitions() as GraphConfig['tools'];

        const configurable: Partial<GraphConfig> = {
            llmCaller,
            tools,
            onChunk: (chunkContent: string) => {
                callbacks.onTextChunk(roomId, chunkContent);
            },
        };

        // Initial state — messages 由 llm-node 内部管理和追加
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
            const { lastState, hadToolCalls } = await this.runToolLoop(
                graph,
                initialState,
                configurable,
            );

            // Persist final assistant message when no tool calls occurred in any round.
            // (Tool-call rounds already persist messages inside persistRound.)
            if (!hadToolCalls && lastState?.lastAssistantMessage) {
                await this.deps.messageStore.persistFinal(roomId, lastState.lastAssistantMessage);
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

    // ========== BaseExecutor 抽象方法实现 ==========

    protected async persistAssistant(state: Partial<WorkflowState>): Promise<void> {
        await this.deps.messageStore.persistAssistant(
            this.ctx.roomId,
            state.lastAssistantMessage || '',
            (state.pendingToolCalls ?? []).map(tc => ({
                id: tc.id,
                name: tc.name,
                arguments: tc.arguments,
                timestamp: new Date(),
            })),
        );
    }

    protected async persistToolResults(
        _toolCalls: Array<{ id: string; name: string; arguments: Record<string, unknown> }>,
        results: Record<string, unknown>,
    ): Promise<void> {
        for (const [toolId, result] of Object.entries(results)) {
            const resultStr = typeof result === 'string' ? result : JSON.stringify(result);
            await this.deps.messageStore.persistToolResult(this.ctx.roomId, toolId, resultStr);
        }
    }

    protected async persistFinal(state: Partial<WorkflowState>): Promise<void> {
        await this.deps.messageStore.persistFinal(
            this.ctx.roomId,
            state.lastAssistantMessage || '',
        );
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
