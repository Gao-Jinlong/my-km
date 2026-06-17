/**
 * 消息组件共享类型
 *
 * LangGraph 消息类型系统（前端渲染视角）：
 *
 * 按发送者（role）分：
 * - human: 用户发送的消息 → HumanMessage
 * - ai: AI 助手回复 → AIMessage（内部按内容类型二次分发）
 * - tool: 工具执行结果 → ToolMessage（当前被过滤，架构预留）
 * - system: 系统提示 → SystemMessage（当前被过滤，架构预留）
 *
 * 按内容类型分（在 AIMessage 内部）：
 * - text: 纯文本
 * - code: 代码块（未来，通过 additional_kwargs 或内容格式识别）
 * - image: 图片（未来）
 * - thinking: 思考链/推理过程（通过 additional_kwargs 标记，未来）
 * - tool_result: 结构化工具结果卡片（未来）
 */

import type { LangGraphChatMessage, ToolCallRef } from '@/features/ai/langgraph/types';

export type { LangGraphChatMessage, ToolCallRef };

/**
 * 基础消息组件 Props
 * 所有具体消息组件的 Props 都继承于此
 */
export interface BaseMessageProps {
    message: LangGraphChatMessage;
}

/**
 * 人类用户消息 Props
 */
export interface HumanMessageProps extends BaseMessageProps {}

/**
 * AI 消息 Props
 * 注意：AI 消息可能包含流式光标、工具调用指示器
 * 未来扩展：AI 消息内部可按内容类型二次分发渲染器
 */
export interface AIMessageProps extends BaseMessageProps {
    /** 是否显示流式输入光标 */
    isStreaming?: boolean;
}

/**
 * 工具消息 Props（架构预留，当前被过滤不展示）
 */
export interface ToolMessageProps extends BaseMessageProps {}

/**
 * 系统消息 Props（架构预留，当前被过滤不展示）
 */
export interface SystemMessageProps extends BaseMessageProps {}

/**
 * 工具调用指示器 Props
 */
export interface ToolCallIndicatorProps {
    toolCall: ToolCallRef;
    status?: 'pending' | 'completed' | 'rejected';
}
