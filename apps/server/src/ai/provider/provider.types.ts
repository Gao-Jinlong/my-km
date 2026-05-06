/**
 * Provider 模块类型定义
 */

import type { LLMMessage, LLMOutput, ToolDefinition } from '../ai.types';

/**
 * LLM Provider 抽象接口
 */
export interface LLMProvider {
    readonly name: string;
    chat(
        messages: LLMMessage[],
        tools?: ToolDefinition[],
        abortSignal?: AbortSignal,
    ): AsyncIterable<LLMOutput>;
}

export interface ProviderSelectOpts {
    model?: string;
    provider?: string;
}
