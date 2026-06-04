/**
 * LLM 调用节点
 *
 * 从 configurable 上下文获取 LLM 调用函数，实际调用 LLM
 * 并处理流式输出和工具调用。
 */

import type { GraphConfig, LLMMessage, WorkflowState } from '../types/workflow.types';

export function createLLMNode() {
    return async (
        state: WorkflowState,
        context?: { configurable?: Partial<GraphConfig> },
    ): Promise<Partial<WorkflowState>> => {
        const llmCaller = context?.configurable?.llmCaller;
        const onChunk = context?.configurable?.onChunk;
        const abortSignal = context?.configurable?.abortSignal;

        if (!llmCaller) {
            return { error: 'LLM caller not provided in configurable context' };
        }

        // 构建消息列表（状态中已存 LLMMessage，直接使用）
        // 工具结果由 tool-node 追加到 messages，llm_call 节点直接读取即可
        const messages: LLMMessage[] = state.messages;

        let assistantText = '';
        const toolCalls: Array<{ id: string; name: string; arguments: Record<string, unknown> }> =
            [];

        try {
            // 调用 LLM（流式）
            for await (const event of llmCaller(messages, abortSignal)) {
                if (event.type === 'text_chunk') {
                    assistantText += event.content ?? '';
                    onChunk?.(event.content ?? '');
                } else if (event.type === 'tool_call' && event.toolCall) {
                    toolCalls.push(event.toolCall);
                } else if (event.type === 'done') {
                    break;
                }

                if (abortSignal?.aborted) {
                    return { isDone: true, lastAssistantMessage: assistantText };
                }
            }
        } catch (error) {
            return { error: error instanceof Error ? error.message : 'LLM call failed' };
        }

        return {
            lastAssistantMessage: assistantText,
            hasToolCalls: toolCalls.length > 0,
            pendingToolCalls: toolCalls,
        };
    };
}
