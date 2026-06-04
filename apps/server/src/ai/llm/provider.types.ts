/**
 * Provider 模块类型定义
 */

import type { LLMMessage, LLMOutput, ToolDefinition } from '../types/ai.types';

export type { ToolDefinition } from '../types/ai.types';

/**
 * 单个 LLM 配置
 */
export interface LLMConfig {
    provider: string;
    model: string;
    temperature?: number;
    maxTokens?: number;
    apiKey?: string;
    [key: string]: unknown;
}

/**
 * 节点级 LLM 配置映射（运行时注入）
 */
export type NodeLLMConfigMap = Record<string, LLMConfig>;

/**
 * LLM Provider 工厂函数签名
 */
export type LLMProviderFactory = (config: LLMConfig) => LLMProvider;

/**
 * LLM Provider 抽象接口
 */
export interface LLMProvider {
    readonly name: string;
    readonly model: string;
    chat(
        messages: LLMMessage[],
        tools?: ToolDefinition[],
        abortSignal?: AbortSignal,
    ): AsyncIterable<LLMOutput>;
}
