/**
 * ChatGraph — 标准对话工作流
 *
 * 图结构:
 *   __start__ → llm_call → [有工具调用?] → tools → llm_call (loop)
 *                          [无工具调用?] → __end__
 *
 * 纯函数式图定义，不依赖 NestJS DI。
 * LLM 调用通过 configurable.llmCaller 注入。
 * Checkpointer 通过 compile 参数注入（由 RunContext 管理）。
 *
 * 重要：createGraph() 返回未编译的 StateGraph。
 * 编译（含 checkpointer 注入）由 RunContext.getCompiledGraph() 负责。
 * 之前的无限递归 bug 根因是 BaseExecutor.runToolLoop() 用外部
 * while 循环重新驱动 graph.stream()，而不是让 graph 内部的
 * conditional edges 自然处理 tool 循环。这个版本不再有外部循环。
 */

import { END, START, StateGraph } from '@langchain/langgraph';
import { createLLMNode } from '../nodes/llm-node';
import { createToolNode } from '../nodes/tool-node';
import { type WorkflowState, WorkflowStateAnnotation } from '../types/workflow.types';

export class ChatGraph {
    readonly name = 'chat';
    readonly description = '标准对话工作流，支持工具调用循环';

    /**
     * 创建未编译的 graph。
     *
     * graph 内部的 conditional edge (hasToolCalls → 'tools' → 'llm_call')
     * 自然处理工具调用循环，不需要外部 while 循环驱动。
     *
     * 返回 any 是因为 StateGraph 方法链的泛型收窄问题：
     * addNode/addEdge 返回的 StateGraph<..., N> 的 N 是字面量联合类型，
     * 与 StateGraph<typeof WorkflowStateAnnotation> 不兼容。
     * 参考: https://github.com/langchain-ai/langgraphjs/issues/763
     */
    createGraph(): any {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const graph = new StateGraph(WorkflowStateAnnotation) as any;
        graph
            .addNode('llm_call', createLLMNode())
            .addNode('tools', createToolNode())
            .addEdge(START, 'llm_call')
            .addConditionalEdges('llm_call', (state: WorkflowState) =>
                state.hasToolCalls ? 'tools' : END,
            )
            .addEdge('tools', 'llm_call');
        return graph;
    }
}
