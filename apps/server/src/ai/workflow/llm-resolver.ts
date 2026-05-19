/**
 * LLMResolver — 节点级 LLM 解析
 *
 * 负责：
 * - 根据节点 ID 解析 LLM 配置
 * - 从 LLMFactory 获取/创建 LLM 实例
 * - 注入到节点执行上下文
 */

import type { BaseGraph } from '@my-km/langgraph-workflows';
import { Injectable, Logger } from '@nestjs/common';
import { LLMFactory } from '../llm/llm-factory';
import type { LLMConfig, LLMProvider, NodeLLMConfigMap } from '../llm/provider.types';

@Injectable()
export class LLMResolver {
    constructor(private llmFactory: LLMFactory) {}

    /**
     * 为指定节点解析 LLM 实例
     */
    resolve(nodeId: string, configMap?: NodeLLMConfigMap, defaultConfig?: LLMConfig): LLMProvider {
        const config = configMap?.[nodeId] ?? defaultConfig;
        if (!config) {
            throw new Error(`No LLM config for node "${nodeId}" and no default`);
        }
        return this.llmFactory.getOrCreate(config);
    }

    /**
     * 为图中所有节点批量解析 LLM 实例
     */
    resolveAll(
        nodeIds: string[],
        configMap?: NodeLLMConfigMap,
        defaultConfig?: LLMConfig,
    ): Map<string, LLMProvider> {
        const resolved = new Map<string, LLMProvider>();
        for (const nodeId of nodeIds) {
            resolved.set(nodeId, this.resolve(nodeId, configMap, defaultConfig));
        }
        return resolved;
    }
}
