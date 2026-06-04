/**
 * RunContext — Run 执行的依赖注入容器
 *
 * 在模块初始化时创建一次，所有 Run 共享。
 * 包含：
 * - checkpointer: LangGraph BaseCheckpointSaver 单例
 * - eventStore: Run 事件流存储器
 * - getCompiledGraph(): LRU 缓存的 graph 编译
 */

import type { BaseCheckpointSaver } from '@langchain/langgraph-checkpoint';
import { Logger } from '@nestjs/common';
import { LRUCache } from 'lru-cache';
import { ChatGraph } from '../langgraph/graphs/chat-graph';
import type { RunEventStore } from '../store/run-event-store';

// biome-ignore lint/suspicious/noExplicitAny: StateGraph compile() returns untyped CompiledStateGraph
type CompiledGraph = any;

export class RunContext {
    private readonly logger = new Logger(RunContext.name);
    private graphCache = new LRUCache<string, CompiledGraph>({ max: 10 });

    constructor(
        /** LangGraph checkpointer 单例 */
        readonly checkpointer: BaseCheckpointSaver,
        /** Run 事件流存储器 */
        readonly eventStore: RunEventStore,
    ) {}

    /**
     * 获取编译后的 graph（LRU 缓存）
     *
     * @param configKey 配置键（用于区分不同 graph 配置）
     * @returns 编译后的 graph 实例
     */
    // biome-ignore lint/suspicious/noExplicitAny: compiled graph type varies by StateGraph generic params
    getCompiledGraph(configKey: string = 'default'): any {
        const cached = this.graphCache.get(configKey);
        if (cached) return cached;

        const chatGraph = new ChatGraph();
        const graph = chatGraph.createGraph();
        const compiled = graph.compile({ checkpointer: this.checkpointer });

        this.graphCache.set(configKey, compiled);
        this.logger.log(`Graph compiled and cached: ${configKey}`);
        return compiled;
    }
}
