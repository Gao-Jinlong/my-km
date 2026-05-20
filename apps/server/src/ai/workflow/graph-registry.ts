/**
 * GraphRegistry — 图注册与查找
 *
 * 负责：
 * - 注册可用的图定义
 * - 按名称查找图
 * - 启动时自动注册内置图
 */

import { Injectable, Logger } from '@nestjs/common';
import type { BaseGraph } from '../langgraph';

@Injectable()
export class GraphRegistry {
    private readonly logger = new Logger(GraphRegistry.name);
    private graphs = new Map<string, BaseGraph>();

    /**
     * 注册图定义
     */
    register(graph: BaseGraph): void {
        this.graphs.set(graph.name, graph);
        this.logger.log(`Graph registered: ${graph.name} — ${graph.description}`);
    }

    /**
     * 按名称获取图
     */
    get(name: string): BaseGraph {
        const graph = this.graphs.get(name);
        if (!graph) {
            const available = Array.from(this.graphs.keys());
            throw new Error(
                `Unknown graph "${name}". Available: ${available.join(', ') || 'none'}`,
            );
        }
        return graph;
    }

    /**
     * 获取所有已注册的图名称
     */
    get registeredGraphs(): string[] {
        return Array.from(this.graphs.keys());
    }
}
