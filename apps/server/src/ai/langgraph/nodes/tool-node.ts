/**
 * 工具执行节点
 *
 * 将工具结果追加到消息历史中，清空 pendingToolCalls。
 * 实际的工具调用等待由 WorkflowExecutor 处理（暂停/恢复循环）。
 */

import type { WorkflowMessage, WorkflowState } from '../types/workflow.types';

export function createToolNode() {
    return async (state: WorkflowState): Promise<Partial<WorkflowState>> => {
        if (!state.pendingToolCalls || state.pendingToolCalls.length === 0) {
            return { hasToolCalls: false };
        }

        // 构建 tool_result 消息（WorkflowMessage 格式）
        const toolResultMessages: WorkflowMessage[] = [];

        for (const [toolId, result] of Object.entries(state.toolResults || {})) {
            const resultStr = typeof result === 'string' ? result : JSON.stringify(result);
            toolResultMessages.push({
                role: 'tool',
                content: [
                    {
                        type: 'tool_result',
                        tool_use_id: toolId,
                        content: resultStr,
                    },
                ],
            });
        }

        return {
            // 清空 pendingToolCalls（已处理）
            pendingToolCalls: [],
            hasToolCalls: false,
            // 工具结果已存入 toolResults，由下一轮 LLM 调用消费
            toolResults: {},
            // 追加 tool_result 消息到状态
            messages: toolResultMessages,
        };
    };
}
