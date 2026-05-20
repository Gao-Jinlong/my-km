/**
 * BaseGraph — 图定义基类
 *
 * 所有工作流图实现此接口。图定义本身是纯函数式代码，
 * 不依赖 NestJS DI，仅依赖 @langchain/langgraph。
 */

import type { NodeLLMConfigMap } from '../types/workflow.types';

/**
 * 图定义接口
 */
export interface BaseGraph {
    /** 图的唯一名称 */
    readonly name: string;

    /** 图的描述（用于调试和日志） */
    readonly description: string;

    /**
     * 创建 LangGraph 状态图实例
     *
     * @param llmConfigMap - 运行时 LLM 配置映射（节点 ID -> LLM 配置）
     * @returns 编译后的 StateGraph
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    createGraph(llmConfigMap?: NodeLLMConfigMap): any;
}

/**
 * 图工厂函数
 */
export type GraphFactory = () => BaseGraph;
