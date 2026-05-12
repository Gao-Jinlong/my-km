/**
 * LLM 调用节点
 *
 * 从 configurable 上下文获取 LLM 调用函数，实际调用 LLM
 * 并处理流式输出和工具调用。
 */

import type { GraphConfig, WorkflowMessage, WorkflowState } from '../types/workflow.types';

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

        // 构建消息列表（状态中已存 WorkflowMessage，直接使用）
        const messages: WorkflowMessage[] = state.messages;

        // 如果有工具结果，追加 tool_result 消息
        if (state.pendingToolCalls && state.pendingToolCalls.length > 0) {
            // 工具结果已在上一步被添加到 messages 中docs/ai-conversation-flow.md。
        }

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
            // 追加助手消息到消息历史
            messages: [
                { role: 'assistant' as const, content: assistantText || '(tool calls only)' },
            ],
        };
    };
}
