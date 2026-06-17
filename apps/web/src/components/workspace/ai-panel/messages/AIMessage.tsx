/**
 * AI 消息组件
 *
 * 展示 AI 助手发送的消息。
 * 左对齐，使用次级背景色。
 * 可以包含流式文本光标和工具调用状态指示器。
 *
 * 扩展点（按内容类型二次分发）：
 * - 代码块渲染（带语法高亮）
 * - 图片渲染
 * - 思考链/推理过程展示（通过 additional_kwargs 标记）
 * - 结构化工具结果卡片
 */

import { ToolCallIndicator } from './ToolCallIndicator';
import type { AIMessageProps } from './types';

export function AIMessage({ message, isStreaming }: AIMessageProps) {
    const hasToolCalls = message.toolCalls && message.toolCalls.length > 0;

    return (
        <div className="flex justify-start">
            <div className="max-w-[85%] rounded-lg bg-ws-bg-secondary px-3 py-2 text-[13px] text-ws-fg-primary leading-relaxed">
                <div className="space-y-2">
                    {/* 文本内容 + 流式打字光标 */}
                    {message.content && (
                        <div className="whitespace-pre-wrap break-words text-sm">
                            {message.content}
                            {isStreaming && <span className="animate-pulse text-ws-accent">▊</span>}
                        </div>
                    )}

                    {/* 工具调用状态指示器 */}
                    {hasToolCalls && (
                        <div className="flex flex-col gap-1 border-ws-border border-t pt-2">
                            {message.toolCalls?.map((tc, i) => (
                                <ToolCallIndicator
                                    key={`${message.id}-tool-${i}`}
                                    toolCall={tc}
                                    status={message.toolStatus}
                                />
                            ))}
                        </div>
                    )}

                    {/*
                     * 未来扩展：按内容类型分发渲染器
                     * - 代码块 → CodeBlockRenderer
                     * - 图片 → ImageRenderer
                     * - 思考链 → ThinkingChainRenderer
                     *   （通过 additional_kwargs.thinking = true 标记）
                     */}
                </div>
            </div>
        </div>
    );
}
