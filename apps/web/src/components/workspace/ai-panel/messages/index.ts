/**
 * 消息组件统一导出入口
 *
 * 架构分层：
 * - 外观层: MessageBubble (外部调用入口)
 * - 按发送者分发: HumanMessage, AIMessage, ToolMessage(预留), SystemMessage(预留)
 * - 按内容分发（在 AIMessage 内）: 未来扩展代码块、图片、思考链等
 */

export { AIMessage } from './AIMessage';
export { HumanMessage } from './HumanMessage';
export { ToolCallIndicator } from './ToolCallIndicator';
export type {
    AIMessageProps,
    HumanMessageProps,
    SystemMessageProps,
    ToolCallIndicatorProps,
    ToolMessageProps,
} from './types';
export { summarizeArgs } from './utils';
