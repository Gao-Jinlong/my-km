/**
 * 工具消息组件
 *
 * 负责 tool 角色消息的渲染。展示工具执行结果。
 * 未来可扩展：根据 toolName 分发到不同的工具专属卡片组件
 * （如 FileOpsCard、DocReadCard、ThinkingCard 等）
 */

import type { ToolMessageProps } from './types';

export function ToolMessage({ message }: ToolMessageProps) {
    return (
        <div className="flex justify-start">
            <div className="max-w-[85%] rounded-lg bg-ws-bg-tertiary px-3 py-2 text-[13px] text-ws-fg-primary leading-relaxed">
                <div className="space-y-2">
                    {/* 工具名称标签 + 状态 */}
                    {message.toolName && (
                        <div className="inline-flex items-center gap-2">
                            <span className="rounded bg-accent-subtle-bg px-1.5 py-0.5 font-mono text-[11px] text-accent-subtle-fg">
                                {message.toolName}
                            </span>
                            <span className="text-[11px] text-ws-fg-muted">
                                {message.toolStatus === 'completed' && '✓ Success'}
                                {message.toolStatus === 'rejected' && '✗ Rejected'}
                                {message.toolStatus === 'pending' && '⏳ Pending'}
                                {!message.toolStatus && 'Result'}
                            </span>
                        </div>
                    )}

                    {/* 工具结果内容 */}
                    {message.content && (
                        <div className="whitespace-pre-wrap break-words text-sm">
                            {message.content}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
