/**
 * 条件路由节点
 *
 * 根据工作流状态决定下一步走向。
 */

import type { WorkflowState } from '../types/workflow.types';

/** 条件路由的目标节点 */
export type RouteCondition = string;

/**
 * 创建路由函数
 *
 * 返回一个 LangGraph 路由函数，根据状态决定走向。
 */
export function createRouterNode(opts: {
    /** 路由条件函数 */
    condition: (state: WorkflowState) => RouteCondition;
}) {
    return (state: WorkflowState): RouteCondition => {
        return opts.condition(state);
    };
}

/**
 * 默认路由：有工具调用则执行工具，否则结束
 */
export function defaultCondition(state: WorkflowState): RouteCondition {
    if (state.pendingToolCalls && state.pendingToolCalls.length > 0) {
        return 'tools';
    }
    return 'done';
}
