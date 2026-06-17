/**
 * 文本消息组件
 *
 * 负责 human / ai / system 角色的纯文本消息渲染。
 * 根据 role 决定对齐方式、背景色、文字颜色。
 * streaming 模式下在文本末尾显示闪烁光标。
 * 对于 ai 消息，内部包含 ToolCallIndicator 列表展示工具调用状态。
 */

import { ToolCallIndicator } from './ToolCallIndicator';
import type { TextMessageProps } from './types';

export function TextMessage({ message, isStreaming }: TextMessageProps) {
    const isUser = message.role === 'human';
    const hasToolCalls = message.toolCalls && message.toolCalls.length > 0;

    return (
        <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
            <div
                className={`max-w-[85%] rounded-lg px-3 py-2 text-[13px] leading-relaxed ${
                    isUser ? 'bg-ws-accent text-white' : 'bg-ws-bg-secondary text-ws-fg-primary'
                }`}
            >
                {/* 用户消息 */}
                {isUser && <div className="whitespace-pre-wrap break-words">{message.content}</div>}

                {/* AI / System 消息 */}
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
                    </div>
                )}
            </div>
        </div>
    );
}
