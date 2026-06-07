/**
 * LLM 调用节点
 *
 * 重构(Plan A1):
 * 从 configurable 上下文获取 LangChain `chatModel`,使用其 `.invoke(messages)`
 * 调用 LLM,LangGraph 运行时通过内置 callbacks 自动捕获 AIMessageChunk
 * 并按 `messages-tuple` 协议透传给前端 SDK。
 *
 * 节点本身**不**调用 `.stream()` — 由 LangGraph 运行时(配合
 * `streamMode: ['messages-tuple']`)负责拦截 chunk。
 * 节点只返回 `{messages: [aiMessage]}`,由 messagesStateReducer 累积到 state。
 */

import type { AIMessage } from '@langchain/core/messages';
import type { Runnable } from '@langchain/core/runnables';
import type { GraphConfig, WorkflowState } from '../types/workflow.types';

export function createLLMNode() {
    return async (
        state: WorkflowState,
        context?: { configurable?: Partial<GraphConfig>; signal?: AbortSignal },
    ): Promise<Partial<WorkflowState>> => {
        const chatModel = context?.configurable?.chatModel;
        const tools = context?.configurable?.tools;
        const abortSignal = context?.configurable?.abortSignal ?? context?.signal;

        if (!chatModel) {
            return { error: 'chatModel not provided in configurable context' };
        }

        try {
            // bindTools 后的 model 仍然是 Runnable<BaseMessage[], AIMessage>
            const modelWithTools: Runnable =
                tools && tools.length > 0 && typeof chatModel.bindTools === 'function'
                    ? chatModel.bindTools(tools)
                    : chatModel;

            // 直接 invoke — LangGraph runtime 通过 callbacks 在内部触发 streaming
            // 并按 messages-tuple 协议向 SDK 发出 token chunk
            const aiMessage: AIMessage = await modelWithTools.invoke(state.messages, {
                signal: abortSignal,
            });

            return { messages: [aiMessage] };
        } catch (error) {
            return { error: error instanceof Error ? error.message : 'LLM call failed' };
        }
    };
}
