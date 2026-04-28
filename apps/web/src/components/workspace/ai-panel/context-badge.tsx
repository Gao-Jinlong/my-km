/**
 * ContextBadge — 显示当前编辑器选中文本的上下文指示器
 *
 * 当用户在编辑器中选中文本时，在输入区域上方显示预览。
 * 用户可点击 X 清除选中上下文。
 */

import { FileText, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ContextBadgeProps {
    selectedText: string | null;
    documentTitle: string;
    onClear?: () => void;
}

export function ContextBadge({ selectedText, documentTitle, onClear }: ContextBadgeProps) {
    if (!selectedText) return null;

    const truncated = selectedText.length > 120 ? `${selectedText.slice(0, 120)}...` : selectedText;

    return (
        <div className="rounded-md border border-ws-border bg-ws-bg-secondary p-2">
            {/* 头部：文档标题 + 清除按钮 */}
            <div className="mb-1 flex items-center justify-between">
                <div className="flex items-center gap-1.5 font-medium text-[10px] text-ws-fg-muted uppercase tracking-wide">
                    <FileText className="h-3 w-3" />
                    <span>{documentTitle || 'Current document'}</span>
                    <span className="text-ws-fg-muted/60">· {selectedText.length} chars</span>
                </div>
                {onClear && (
                    <button
                        type="button"
                        onClick={onClear}
                        className="rounded p-0.5 text-ws-fg-muted hover:bg-ws-bg-tertiary hover:text-ws-fg-primary"
                        aria-label="Clear context"
                    >
                        <X className="h-3 w-3" />
                    </button>
                )}
            </div>

            {/* 选中文本预览 */}
            <div
                className={cn(
                    'rounded border border-ws-border/50 bg-ws-bg-primary px-2 py-1.5',
                    'font-mono text-[11px] text-ws-fg-secondary leading-relaxed',
                )}
            >
                {truncated}
            </div>
        </div>
    );
}
