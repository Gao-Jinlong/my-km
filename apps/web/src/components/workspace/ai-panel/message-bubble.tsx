/**
 * MessageBubble — 单条消息渲染组件
 *
 * 支持用户消息、助手消息（含流式文本）、工具调用指示。
 */

import type { MessageWire } from '@/features/ai/types/ai.types';
import { cn } from '@/lib/utils';

interface MessageBubbleProps {
    message: MessageWire;
}

export function MessageBubble({ message }: MessageBubbleProps) {
    const isUser = message.role === 'user';
    const hasToolCalls = message.toolCalls && message.toolCalls.length > 0;

    return (
        <div className={cn('flex', isUser ? 'justify-end' : 'justify-start')}>
            <div
                className={cn(
                    'max-w-[85%] rounded-lg px-3 py-2 text-[13px] leading-relaxed',
                    isUser ? 'bg-ws-accent text-white' : 'bg-ws-bg-secondary text-ws-fg-primary',
                )}
            >
                {/* 用户消息 */}
                {isUser && <div className="whitespace-pre-wrap break-words">{message.content}</div>}

                {/* 助手消息 */}
                {!isUser && (
                    <div className="space-y-2">
                        {/* 文本内容 */}
                        {message.content && (
                            <div className="whitespace-pre-wrap break-words text-sm">
                                {message.content}
                            </div>
                        )}

                        {/* 工具调用指示 */}
                        {hasToolCalls && (
                            <div className="flex flex-col gap-1 border-ws-border border-t pt-2">
                                {message.toolCalls?.map((tc, i) => (
                                    <ToolCallIndicator
                                        key={`${message.id}-tool-${i}`}
                                        name={tc.name}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

/**
 * 工具调用状态指示器
 */
function ToolCallIndicator({ name }: { name: string }) {
    return (
        <div className="flex items-center gap-2 text-ws-fg-muted text-xs">
            <div className="h-2 w-2 animate-pulse rounded-full bg-amber-500" />
            <span className="font-mono">{name}...</span>
        </div>
    );
}
