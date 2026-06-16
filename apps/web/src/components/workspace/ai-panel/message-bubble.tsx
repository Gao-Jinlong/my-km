/**
 * MessageBubble — 单条消息渲染组件
 *
 * 支持用户消息、助手消息（含流式文本）、工具调用指示、工具确认卡片。
 * streaming 模式下在文本末尾显示闪烁光标 ▊。
 */

import { Loader } from 'lucide-react';
import type { LangGraphChatMessage } from '@/features/ai/langgraph/types';
import { cn } from '@/lib/utils';

interface MessageBubbleProps {
    message: LangGraphChatMessage;
    /** AI 正在流式生成此消息（显示打字光标） */
    isStreaming?: boolean;
    /** 取消工具调用回调 */
    onCancelToolCall?: () => void;
}

export function MessageBubble({ message, isStreaming, onCancelToolCall }: MessageBubbleProps) {
    const isUser = message.role === 'human';
    const hasToolCalls = message.toolCalls && message.toolCalls.length > 0;
    const isPendingTool = message.toolStatus === 'pending';

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
                        {/* 文本内容 + 流式打字光标 */}
                        {message.content && (
                            <div className="whitespace-pre-wrap break-words text-sm">
                                {message.content}
                                {isStreaming && (
                                    <span className="animate-pulse text-ws-accent">▊</span>
                                )}
                            </div>
                        )}

                        {/* 工具调用卡片（pending 状态，需要确认） */}
                        {isPendingTool && onCancelToolCall && (
                            <ToolCallCard
                                name={message.toolName ?? 'unknown tool'}
                                input={message.content}
                                onCancel={onCancelToolCall}
                            />
                        )}

                        {/* 工具调用指示（已确认 / 执行中） */}
                        {hasToolCalls && !isPendingTool && (
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
 * 工具调用状态指示器（执行中 / 已完成）
 */
function ToolCallIndicator({ name }: { name: string }) {
    return (
        <div className="flex items-center gap-2 text-ws-fg-muted text-xs">
            <div className="h-2 w-2 animate-pulse rounded-full bg-amber-500" />
            <span className="font-mono">{name}...</span>
        </div>
    );
}

/**
 * 工具调用确认卡片（pending 状态，spec 5.7）
 *
 * 显示：工具名、输入预览、确认/取消按钮
 * 确认由 auto-dispatch 自动执行（当前策略），取消按钮调用 stop() 触发后端 cancel
 */
function ToolCallCard({
    name,
    input,
    onCancel,
}: {
    name: string;
    input: string;
    onCancel: () => void;
}) {
    return (
        <div className="mt-2 rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-900/20">
            <div className="mb-2 flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-800">
                    <Loader className="h-3 w-3 animate-spin text-blue-600 dark:text-blue-400" />
                </div>
                <span className="font-medium text-blue-900 dark:text-blue-100">{name}</span>
            </div>

            <div className="mb-3 max-h-32 overflow-auto rounded border border-blue-100 bg-white p-2 text-gray-600 text-xs dark:border-blue-800 dark:bg-gray-900 dark:text-gray-300">
                <pre className="whitespace-pre-wrap font-mono">{input}</pre>
            </div>

            <div className="flex justify-end gap-2">
                <button
                    type="button"
                    onClick={onCancel}
                    className="rounded-md border border-gray-300 bg-white px-3 py-1.5 font-medium text-gray-700 text-xs hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                >
                    取消
                </button>
                <button
                    type="button"
                    disabled
                    className="rounded-md bg-blue-600 px-3 py-1.5 font-medium text-white text-xs opacity-80 dark:bg-blue-700"
                >
                    执行中...
                </button>
            </div>
        </div>
    );
}
