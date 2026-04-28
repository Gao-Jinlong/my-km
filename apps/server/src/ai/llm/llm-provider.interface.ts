/**
 * LLM Provider 抽象接口
 *
 * 统一不同 LLM 提供商的调用方式，支持流式输出和 tool call。
 */

import type { LLMMessage, LLMOutput, ToolDefinition } from '../ai.types';

export interface LLMProvider {
    readonly name: string;

    /**
     * 发送对话请求，返回流式输出
     * @param messages - 对话历史
     * @param tools - 可用工具列表
     * @param abortSignal - 可选的中断信号
     */
    chat(
        messages: LLMMessage[],
        tools?: ToolDefinition[],
        abortSignal?: AbortSignal,
    ): AsyncIterable<LLMOutput>;
}
