/**
 * 工具调用状态指示器（三态卡片）
 *
 * - pending: spinner + 工具名标签 + 参数摘要
 * - completed: 对勾 + 工具名标签 + 参数摘要
 * - rejected: 叉号 + 工具名标签
 *
 * 卡片式布局：轻量背景 + 边框，工具名用 accent 色标签突出，
 * 参数摘要用 muted 色。全部 design tokens，dark 自适应。
 */

import { Check, Loader2, X } from 'lucide-react';
import type { ToolCallIndicatorProps } from './types';
import { summarizeArgs } from './utils';

export function ToolCallIndicator({ toolCall, status }: ToolCallIndicatorProps) {
    const summary = summarizeArgs(toolCall.args);

    const icon =
        status === 'completed' ? (
            <Check className="h-3.5 w-3.5 text-feedback-success-fg" />
        ) : status === 'rejected' ? (
            <X className="h-3.5 w-3.5 text-feedback-error-fg" />
        ) : (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-feedback-warning-fg" />
        );

    return (
        <div className="flex items-center gap-2 rounded-md border border-border-subtle bg-bg-tertiary px-2 py-1.5 text-xs">
            {icon}
            <span className="rounded bg-accent-subtle-bg px-1.5 py-0.5 font-mono text-[11px] text-accent-subtle-fg">
                {toolCall.name}
            </span>
            {summary && <span className="truncate text-fg-muted">{summary}</span>}
        </div>
    );
}
