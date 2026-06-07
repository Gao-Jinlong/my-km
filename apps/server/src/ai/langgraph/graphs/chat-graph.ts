/**
 * ChatGraph — 标准对话工作流
 *
 * 图结构:
 *   __start__ → llm_call → [有 tool_calls?] → tools → llm_call (loop)
 *                          [无 tool_calls?] → __end__
 *
 * 重构(Plan A1):
 * - 路由直接读取最后一条 AIMessage 的 tool_calls 字段
 *   (取代之前的 state.hasToolCalls)
 * - state.messages 现在是 BaseMessage[](由 MessagesAnnotation 提供)
 */

import { AIMessage } from '@langchain/core/messages';
import { END, START, StateGraph } from '@langchain/langgraph';
import { createLLMNode } from '../nodes/llm-node';
import { createToolNode } from '../nodes/tool-node';
import { type WorkflowState, WorkflowStateAnnotation } from '../types/workflow.types';

export class ChatGraph {
    readonly name = 'chat';
    readonly description = '标准对话工作流,支持工具调用循环';

    /**
     * 创建未编译的 graph。
     *
     * 返回 any 是因为 StateGraph 方法链的泛型收窄问题。
     * 参考: https://github.com/langchain-ai/langgraphjs/issues/763
     */
    // biome-ignore lint/suspicious/noExplicitAny: StateGraph generic chain
    createGraph(): any {
        // biome-ignore lint/suspicious/noExplicitAny: see above
        const graph = new StateGraph(WorkflowStateAnnotation) as any;
        graph
            .addNode('llm_call', createLLMNode())
            .addNode('tools', createToolNode())
            .addEdge(START, 'llm_call')
            .addConditionalEdges('llm_call', (state: WorkflowState) => {
                const last = state.messages[state.messages.length - 1];
                if (last instanceof AIMessage && last.tool_calls && last.tool_calls.length > 0) {
                    return 'tools';
                }
                return END;
            })
            .addEdge('tools', 'llm_call');
        return graph;
    }
}
