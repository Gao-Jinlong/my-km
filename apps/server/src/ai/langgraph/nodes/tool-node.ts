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

import { type BaseMessage, ToolMessage } from '@langchain/core/messages';
import { interrupt } from '@langchain/langgraph';
import { endToolSpan, startToolSpan } from '../../../tracing/instrumentations/tool-node.span';
import { hasToolCalls } from '../types/message-utils';
import type { WorkflowState } from '../types/workflow.types';

export function createToolNode() {
    return async (state: WorkflowState): Promise<Partial<WorkflowState>> => {
        const lastMessage = state.messages[state.messages.length - 1];
        // 不用 instanceof AIMessage：streaming provider 返回 AIMessageChunk，
        // 它运行时不是 AIMessage 的实例。见 hasToolCalls 注释。
        if (!hasToolCalls(lastMessage)) {
            return {};
        }

        const toolMessages: BaseMessage[] = [];
        // tool_calls 仅在 AIMessage / AIMessageChunk 子类声明；hasToolCalls 已确认 _getType==='ai'，
        // 故用结构化断言访问（含 id/name/args 的 OpenAIToolCall 数组）。
        const toolCalls =
            (lastMessage as { tool_calls?: Array<{ id?: string; name?: string; args?: unknown }> })
                .tool_calls ?? [];

        for (const toolCall of toolCalls) {
            if (!toolCall.id || !toolCall.name) continue;

            const toolSpan = startToolSpan({
                toolName: toolCall.name,
                toolCallId: toolCall.id,
            });

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

            endToolSpan(toolSpan);

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
