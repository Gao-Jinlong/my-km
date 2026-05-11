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

import type { GraphConfig, WorkflowState } from '@my-km/langgraph-workflows';
import { Injectable, Logger } from '@nestjs/common';
import type { LLMMessage, ToolDefinition } from '../ai.types';
import { ConnectionManager } from '../connection/connection-manager';
import { MessageService } from '../message/message.service';
import { LLMFactory } from '../provider/llm-factory';
import type { LLMConfig, NodeLLMConfigMap } from '../provider/provider.types';
import { ToolDispatcher } from '../tools/tool.dispatcher';
import { GraphRegistry } from './graph-registry';
import { LLMResolver } from './llm-resolver';
import type { WorkflowExecutionContext } from './workflow.types';

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
        private connectionManager: ConnectionManager,
        private messageService: MessageService,
        private toolDispatcher: ToolDispatcher,
    ) {}

    /**
     * 执行工作流
     */
    async execute(ctx: WorkflowExecutionContext, graphName = 'chat'): Promise<void> {
        const graphDef = this.graphRegistry.get(graphName);
        const graph = this.getOrCreateGraph(graphDef);

        // 构建 LLM 格式消息历史
        const history = await this.messageService.buildLLMHistory(ctx.conversationId);

        // 创建 LLM 调用函数（桥接 LLMProvider 到 LLMCaller 接口）
        const llmCaller = this.createLLMCaller(ctx.llmConfigMap, ctx.defaultLlmConfig);

        // 创建工具定义列表
        const tools = this.toolDispatcher.getDefinitions() as GraphConfig['tools'];

        // 创建 configurable 上下文
        const configurable: Partial<GraphConfig> = {
            llmCaller,
            tools,
            onChunk: (content: string) => {
                this.connectionManager.emitToConversation(ctx.conversationId, 'stream_chunk', {
                    type: 'stream_chunk',
                    content,
                });
            },
        };

        // 初始状态
        const initialState: Partial<WorkflowState> = {
            messages: [ctx.content],
            conversationId: ctx.conversationId,
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

                // 执行 LangGraph 图
                let lastState: Partial<WorkflowState> | null = null;

                for await (const state of graph.stream(initialState, { configurable })) {
                    lastState = state as Partial<WorkflowState>;

                    // 检查中止信号
                    if (ctx.abortSignal?.aborted) {
                        this.connectionManager.emitToConversation(
                            ctx.conversationId,
                            'stream_done',
                            { type: 'stream_done' },
                        );
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
                    conversationId: ctx.conversationId,
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
                for (const tool of lastState.pendingToolCalls) {
                    this.connectionManager.emitToConversation(ctx.conversationId, 'tool_call', {
                        type: 'tool_call',
                        id: tool.id,
                        name: tool.name,
                        arguments: tool.arguments,
                    });
                }

                // 等待前端返回工具结果
                const results = await this.toolDispatcher.waitForResultsByConversation(
                    ctx.conversationId,
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
                        conversationId: ctx.conversationId,
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
                initialState.messages = [
                    ctx.content,
                    ...(lastState.lastAssistantMessage ? [lastState.lastAssistantMessage] : []),
                    ...Object.values(results).map(r => JSON.stringify(r)),
                ];
                initialState.pendingToolCalls = [];
                initialState.hasToolCalls = false;
                initialState.toolResults = results;
            }

            if (round >= this.maxToolRounds) {
                this.logger.warn(`Max tool rounds (${this.maxToolRounds}) exceeded`);
            }

            // 执行完成
            this.connectionManager.emitToConversation(ctx.conversationId, 'stream_done', {
                type: 'stream_done',
            });
        } catch (error) {
            this.logger.error(`Workflow execution failed: ${error}`);
            this.connectionManager.emitToConversation(ctx.conversationId, 'error', {
                type: 'error',
                message: error instanceof Error ? error.message : 'Workflow execution failed',
                code: 'WORKFLOW_ERROR',
            });
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

        return this.graphCache.get(cacheKey) as NonNullable<
            ReturnType<typeof this.graphRegistry.get>
        >;
    }

    /**
     * 清除图缓存（用于热重载）
     */
    clearCache(): void {
        this.graphCache.clear();
    }
}
