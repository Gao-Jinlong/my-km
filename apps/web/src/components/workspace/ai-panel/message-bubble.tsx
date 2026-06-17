/**
 * MessageBubble — 单条消息渲染组件（外观层）
 *
 * 保持向后兼容的统一入口，内部根据消息 role 分发到具体子组件。
 *
 * 组件分层：
 * - TextMessage: human / ai / system 文本消息
 * - ToolMessage: tool 工具执行结果消息
 * - ToolCallIndicator: ai 消息内的工具调用状态指示器
 *
 * 新增消息类型时，在此处添加路由规则即可，不影响调用方。
 */

import type { LangGraphChatMessage } from '@/features/ai/langgraph/types';
import { TextMessage, ToolMessage } from './messages';

export interface MessageBubbleProps {
    message: LangGraphChatMessage;
    /** AI 正在流式生成此消息（显示打字光标） */
    isStreaming?: boolean;
}

export function MessageBubble({ message, isStreaming }: MessageBubbleProps) {
    // Tool 消息走 ToolMessage 组件
    if (message.role === 'tool') {
        return <ToolMessage message={message} />;
    }

    // human / ai / system 走 TextMessage 组件
    return <TextMessage message={message} isStreaming={isStreaming} />;
}
