/**
 * WorkflowExecutor — 工作流执行器
 *
 * 负责：
 * - 实例化 LangGraph 图
 * - 注入 LLM 调用函数到节点上下文
 * - 执行图并处理工具调用循环
 * - 桥接结果回 WebSocket
 *
 * 执行流程:
 * ┌─────────────┐    ┌──────────────┐    ┌──────────────┐
 * │  Get Graph   │───▶│  Create      │───▶│  Execute     │
 * │  Definition  │    │  Instance    │    │  with LLM    │
 * └─────────────┘    └──────────────┘    └──────────────┘
 *                                              │
 *                                       ┌──────▼──────┐
 *                                ┌─────▶│  Stream to  │
 *                                │      │  WebSocket  │
 *                                │      └─────────────┘
 *                                │
 *                         [有工具调用?]
 *                                │
 *                         ┌──────▼──────┐
 *                         │  Wait for   │
 *                         │  Tool Result│
 *                         └─────────────┘
 */

import type { GraphConfig, WorkflowMessage, WorkflowState } from '@my-km/langgraph-workflows';
import { Injectable, Logger, Optional } from '@nestjs/common';
import type { LLMMessage } from '../ai.types';
import type { RoomStateMachine } from '../gateway/room-statemachine';
import { MessageService } from '../message/message.service';
import { LLMFactory } from '../provider/llm-factory';
import type { LLMConfig, NodeLLMConfigMap } from '../provider/provider.types';
import { ToolDispatcher } from '../tools/tool.dispatcher';
import { ToolRouter } from '../tools/tool-router';
import { GraphRegistry } from './graph-registry';
import { LLMResolver } from './llm-resolver';
import type { WorkflowCallbacks, WorkflowExecutionContext } from './workflow.types';

@Injectable()
export class WorkflowExecutor {
    private readonly logger = new Logger(WorkflowExecutor.name);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private graphCache = new Map<string, any>();
    private maxToolRounds = 10;

    constructor(
        private graphRegistry: GraphRegistry,
        private llmResolver: LLMResolver,
        _llmFactory: LLMFactory,
        private messageService: MessageService,
        private toolDispatcher: ToolDispatcher,
        @Optional() private stateMachine: RoomStateMachine | null,
        private toolRouter: ToolRouter,
    ) {}

    /**
     * Execute the workflow, using injected callbacks to signal lifecycle events.
     * Callbacks take priority over the (optional) stateMachine for decoupling
     * the business layer from the transport layer.
     */
    async execute(ctx: WorkflowExecutionContext, graphName = 'chat'): Promise<void> {
        const callbacks = ctx.callbacks;

        const graphDef = this.graphRegistry.get(graphName);
        const graph = this.getOrCreateGraph(graphDef);

        // 构建 LLM 格式消息历史
        const history = await this.messageService.buildLLMHistory(ctx.roomId);

        // 创建 LLM 调用函数（桥接 LLMProvider 到 LLMCaller 接口）
        const llmCaller = this.createLLMCaller(ctx.llmConfigMap, ctx.defaultLlmConfig);

        // 创建工具定义列表
        const tools = this.toolDispatcher.getDefinitions() as GraphConfig['tools'];

        // 创建 configurable 上下文 — use callbacks for text chunks
        const configurable: Partial<GraphConfig> = {
            llmCaller,
            tools,
            onChunk: (content: string) => {
                this._emitTextChunk(callbacks, ctx.roomId, content);
            },
        };

        // 初始状态
        const initialState: Partial<WorkflowState> = {
            messages: [{ role: 'user' as const, content: ctx.content }],
            roomId: ctx.roomId,
            lastAssistantMessage: '',
            hasToolCalls: false,
            pendingToolCalls: [],
            toolResults: {},
            error: undefined,
            isDone: false,
        };

        try {
            // 工具调用外层循环
            let round = 0;
            const currentMessages = [...history];

            while (round < this.maxToolRounds) {
                round++;

                // 执行 LangGraph 图 — stream() 返回 Promise，需先 await
                let lastState: Partial<WorkflowState> | null = null;
                const stream = await graph.stream(initialState, { configurable });
                for await (const state of stream) {
                    lastState = state as Partial<WorkflowState>;

                    // 检查中止信号
                    if (ctx.abortSignal?.aborted) {
                        this._emitStop(callbacks, ctx.roomId);
                        return;
                    }
                }

                // 检查是否有工具调用
                if (!lastState?.hasToolCalls || !lastState.pendingToolCalls?.length) {
                    // 无工具调用，结束
                    break;
                }

                // 保存助手消息（包含工具调用）
                await this.messageService.create({
                    roomId: ctx.roomId,
                    role: 'assistant',
                    content: lastState.lastAssistantMessage || null,
                    toolCalls: lastState.pendingToolCalls.map(tc => ({
                        id: tc.id,
                        name: tc.name,
                        arguments: tc.arguments,
                        timestamp: new Date(),
                    })),
                });

                // 发送工具调用事件给前端
                for (const tc of lastState.pendingToolCalls) {
                    this.toolRouter.route(tc.name, tc.arguments, ctx.roomId, tc.id);
                    this._emitToolCall(callbacks, ctx.roomId, {
                        toolCallId: tc.id,
                        toolName: tc.name,
                        input: tc.arguments,
                        requiresConfirmation: this.toolRouter.needsConfirmation(tc.name),
                    });
                }

                // 等待前端返回工具结果
                const results = await this.toolDispatcher.waitForResultsByRoom(
                    ctx.roomId,
                    lastState.pendingToolCalls.map(tc => ({
                        id: tc.id,
                        name: tc.name,
                        arguments: tc.arguments,
                        timestamp: new Date(),
                    })),
                    30000,
                );

                if (!results) {
                    this.logger.warn('Tool execution timed out');
                    break;
                }

                // 将工具结果追加到消息历史
                for (const [toolId, result] of Object.entries(results)) {
                    const resultStr = typeof result === 'string' ? result : JSON.stringify(result);

                    await this.messageService.create({
                        roomId: ctx.roomId,
                        role: 'tool',
                        content: resultStr,
                        toolResultId: toolId,
                    });

                    // 追加 tool_result 消息到当前消息列表
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

                // 将助手消息和工具结果追加到状态消息中，用于下一轮
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
                    { role: 'user' as const, content: ctx.content },
                    ...(lastState.lastAssistantMessage
                        ? [
                              {
                                  role: 'assistant' as const,
                                  content: lastState.lastAssistantMessage,
                              },
                          ]
                        : []),
                    ...toolResultMessages,
                ];
                initialState.pendingToolCalls = [];
                initialState.hasToolCalls = false;
                initialState.toolResults = results;
            }

            if (round >= this.maxToolRounds) {
                this.logger.warn(`Max tool rounds (${this.maxToolRounds}) exceeded`);
            }

            // 执行完成
            this._emitLlmDone(callbacks, ctx.roomId);
        } catch (error) {
            this.logger.error(`Workflow execution failed: ${error}`);
            this._emitError(
                callbacks,
                ctx.roomId,
                'WORKFLOW_ERROR',
                error instanceof Error ? error.message : 'Workflow execution failed',
            );
        }
    }

    /**
     * Emit a text chunk event. Uses callbacks if available, falls back to stateMachine.
     */
    private _emitTextChunk(
        callbacks: WorkflowCallbacks | undefined,
        roomId: string,
        content: string,
    ): void {
        if (callbacks?.onTextChunk) {
            callbacks.onTextChunk(roomId, content);
        } else if (this.stateMachine) {
            this.stateMachine.textChunk(content);
        }
    }

    /**
     * Emit a tool call event. Uses callbacks if available, falls back to stateMachine.
     */
    private _emitToolCall(
        callbacks: WorkflowCallbacks | undefined,
        roomId: string,
        info: {
            toolCallId: string;
            toolName: string;
            input: unknown;
            requiresConfirmation: boolean;
        },
    ): void {
        if (callbacks?.onToolCall) {
            callbacks.onToolCall(roomId, info);
        } else if (this.stateMachine) {
            this.stateMachine.toolCall(
                info.toolCallId,
                info.toolName,
                info.input,
                info.requiresConfirmation,
            );
        }
    }

    /**
     * Emit LLM done event. Uses callbacks if available, falls back to stateMachine.
     */
    private _emitLlmDone(callbacks: WorkflowCallbacks | undefined, roomId: string): void {
        if (callbacks?.onLlmDone) {
            callbacks.onLlmDone(roomId);
        } else if (this.stateMachine) {
            this.stateMachine.llmDone();
        }
    }

    /**
     * Emit stop event. Uses callbacks if available, falls back to stateMachine.
     */
    private _emitStop(callbacks: WorkflowCallbacks | undefined, roomId: string): void {
        if (callbacks?.onStop) {
            callbacks.onStop(roomId);
        } else if (this.stateMachine) {
            this.stateMachine.stop();
        }
    }

    /**
     * Emit error event. Uses callbacks if available, falls back to stateMachine.
     */
    private _emitError(
        callbacks: WorkflowCallbacks | undefined,
        roomId: string,
        code: string,
        message: string,
    ): void {
        if (callbacks?.onError) {
            callbacks.onError(roomId, code, message);
        } else if (this.stateMachine) {
            this.stateMachine.error(code, message);
        }
    }

    /**
     * 创建 LLM 调用函数
     * 桥接 LLMProvider.chat() 到 LLMCaller 接口
     */
    private createLLMCaller(configMap?: NodeLLMConfigMap, defaultConfig?: LLMConfig) {
        return async function* (messages: LLMMessage[], abortSignal?: AbortSignal) {
            // 解析默认 LLM（llm_call 节点使用默认配置）
            const provider = this.llmResolver.resolve('llm_call', configMap, defaultConfig);
            const tools = this.toolDispatcher.getDefinitions();
            yield* provider.chat(messages, tools, abortSignal);
        }.bind(this);
    }

    /**
     * 获取或创建编译后的图实例
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private getOrCreateGraph(graphDef: ReturnType<typeof this.graphRegistry.get>): any {
        const cacheKey = graphDef.name;

        if (!this.graphCache.has(cacheKey)) {
            const graph = graphDef.createGraph();
            this.graphCache.set(cacheKey, graph);
            this.logger.log(`Graph compiled: ${cacheKey}`);
        }

        return this.graphCache.get(cacheKey);
    }

    /**
     * 清除图缓存（用于热重载）
     */
    clearCache(): void {
        this.graphCache.clear();
    }
}
