/**
 * ChatGraph — 标准对话工作流
 *
 * 图结构:
 *   __start__ → llm_call → [有工具调用?] → tools → llm_call (loop)
 *                          [无工具调用?] → __end__
 *
 * 这是一个纯函数式图定义，不依赖 NestJS DI。
 * 实际的 LLM 调用由 server 侧通过 configurable.llmCaller 注入。
 */

import { END, START, StateGraph } from '@langchain/langgraph';
import { createLLMNode } from '../nodes/llm-node';
import { createToolNode } from '../nodes/tool-node';
import { type WorkflowState, WorkflowStateAnnotation } from '../types/workflow.types';
import type { BaseGraph } from './base-graph';

export class ChatGraph implements BaseGraph {
    readonly name = 'chat';
    readonly description = '标准对话工作流，支持工具调用循环';

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    createGraph() {
        // 使用方法链以让 TypeScript 正确收窄节点名称泛型参数 N
        // 参见: https://github.com/langchain-ai/langgraphjs/issues/763
        const graph = new StateGraph(WorkflowStateAnnotation)
            .addNode('llm_call', createLLMNode())
            .addNode('tools', createToolNode())
            .addEdge(START, 'llm_call')
            .addConditionalEdges('llm_call', (state: WorkflowState) =>
                state.hasToolCalls ? 'tools' : END,
            )
            .addEdge('tools', 'llm_call');

        // 编译图
        return graph.compile();
    }
}
