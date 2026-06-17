/**
 * 消息组件共享类型
 * 注意：LangGraphChatMessage 等核心类型来自 @/features/ai/langgraph/types
 * 这里只放组件内部使用的类型
 */

import type { LangGraphChatMessage, ToolCallRef } from '@/features/ai/langgraph/types';

export type { LangGraphChatMessage, ToolCallRef };

export interface ToolCallIndicatorProps {
    toolCall: ToolCallRef;
    status?: 'pending' | 'completed' | 'rejected';
}

export interface TextMessageProps {
    message: LangGraphChatMessage;
    isStreaming?: boolean;
}

export interface ToolMessageProps {
    message: LangGraphChatMessage;
}
