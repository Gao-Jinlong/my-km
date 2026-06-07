/**
 * 工具执行节点
 *
 * 重构(Plan A1):
 * 前端工具(FRONTEND_TOOLS)通过 LangGraph `interrupt()` 暂停 graph,
 * 等待 SDK 端通过 `command: { resume: { tool_call_id, tool_result } }` 恢复。
 *
 * 行为:
 * 1. 读取最后一条 AIMessage 的 tool_calls 列表
 * 2. 对每个 tool_call 触发 interrupt({ tool_call_id, tool_name, args })
 *    — interrupt() 在首次执行时抛出 GraphInterrupt,
 *      恢复时返回 SDK 传入的 resume 值
 * 3. 将 resume 值包装为 ToolMessage,append 到 state.messages
 */

import { AIMessage, type BaseMessage, ToolMessage } from '@langchain/core/messages';
import { interrupt } from '@langchain/langgraph';
import type { WorkflowState } from '../types/workflow.types';

export function createToolNode() {
    return async (state: WorkflowState): Promise<Partial<WorkflowState>> => {
        const lastMessage = state.messages[state.messages.length - 1];
        if (!(lastMessage instanceof AIMessage) || !lastMessage.tool_calls?.length) {
            return {};
        }

        const toolMessages: BaseMessage[] = [];

        for (const toolCall of lastMessage.tool_calls) {
            if (!toolCall.id || !toolCall.name) continue;

            // 触发 interrupt,等待前端执行后通过 SDK command.resume 恢复
            // 恢复值在 controller 端通过 new Command({ resume: ... }) 注入
            const resumeValue = interrupt({
                tool_call_id: toolCall.id,
                tool_name: toolCall.name,
                args: toolCall.args ?? {},
            });

            // resumeValue 期望形如 { tool_call_id, tool_result }
            // 但 LangGraph interrupt 对每个 call 单独暂停;此处 resumeValue
            // 直接是该次 interrupt 的 resume payload
            const result =
                resumeValue && typeof resumeValue === 'object' && 'tool_result' in resumeValue
                    ? (resumeValue as { tool_result: unknown }).tool_result
                    : resumeValue;

            const content = typeof result === 'string' ? result : JSON.stringify(result ?? '');

            toolMessages.push(
                new ToolMessage({
                    tool_call_id: toolCall.id,
                    name: toolCall.name,
                    content,
                }),
            );
        }

        return { messages: toolMessages };
    };
}
