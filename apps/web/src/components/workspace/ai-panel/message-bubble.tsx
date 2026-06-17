/**
 * MessageBubble — 单条消息渲染组件（外观层）
 *
 * 保持向后兼容的统一入口，内部根据消息 role 分发到具体子组件。
 *
 * LangGraph 消息架构（前端渲染视角）：
 *
 * 第一层：按发送者（role）分发
 * - human → HumanMessage: 用户消息（右对齐，纯文本）
 * - ai → AIMessage: AI 助手消息（左对齐，可包含文本 + 工具调用指示器 + 未来扩展）
 * - tool → ToolMessage: 工具执行结果（当前被过滤，架构预留）
 * - system → SystemMessage: 系统提示（当前被过滤，架构预留）
 *
 * 第二层：按内容类型分发（在 AIMessage 内部，未来扩展）
 * - text → TextRenderer: 纯文本（当前）
 * - code → CodeBlockRenderer: 代码块（带语法高亮）
 * - image → ImageRenderer: 图片
 * - thinking → ThinkingChainRenderer: 思考链/推理过程
 *   （通过 additional_kwargs.thinking = true 标记）
 * - tool_result → ToolResultCardRenderer: 结构化工具结果卡片
 *
 * 新增消息类型时：
 * 1. 若为新发送者类型 → 在外观层添加路由
 * 2. 若为 AI 消息内的新内容类型 → 在 AIMessage 内部添加分发逻辑
 */

import type { LangGraphChatMessage } from '@/features/ai/langgraph/types';
import { AIMessage, HumanMessage } from './messages';

export interface MessageBubbleProps {
    message: LangGraphChatMessage;
    /** AI 正在流式生成此消息（显示打字光标） */
    isStreaming?: boolean;
}

export function MessageBubble({ message, isStreaming }: MessageBubbleProps) {
    // 用户消息
    if (message.role === 'human') {
        return <HumanMessage message={message} />;
    }

    // AI 消息（包含工具调用指示器，未来可按内容类型二次分发）
    if (message.role === 'ai') {
        return <AIMessage message={message} isStreaming={isStreaming} />;
    }

    // 防御性兜底：tool/system 理论上在 message-projection 中已被过滤
    // 若到达，按 AI 消息样式渲染（至少不会崩溃）
    return <AIMessage message={message} isStreaming={isStreaming} />;
}
