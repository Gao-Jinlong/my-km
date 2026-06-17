'use client';

import { Button } from '@/components/ui/button';
import type { ConfirmationRequest } from '@/features/ai/tools/types';

interface ToolConfirmationDialogProps {
    request: ConfirmationRequest | null;
    onResolve: (approved: boolean) => void;
}

/**
 * ToolConfirmationDialog
 *
 * 内联展示在 AIPanel 消息流中，提示用户确认 AI 发起的写操作工具调用。
 * 用户点击 Confirm/Reject 后通过 onResolve 回调通知调度器。
 *
 * 样式全部走 design tokens（feedback-warning-* / bg-* / fg-*），
 * 无裸色值，dark 模式自适应。
 */
export function ToolConfirmationDialog({ request, onResolve }: ToolConfirmationDialogProps) {
    if (!request) return null;

    return (
        <div className="rounded-md border border-feedback-warning-default/30 bg-feedback-warning-bg p-3">
            <div className="mb-2 flex items-center gap-2">
                <div className="h-2 w-2 animate-pulse rounded-full bg-feedback-warning-default" />
                <span className="font-mono text-feedback-warning-fg text-xs">
                    {request.toolName}
                </span>
            </div>
            <p className="mb-2 text-[12px] text-ws-fg-secondary">{request.description}</p>
            <pre className="mb-2 overflow-auto rounded bg-bg-tertiary p-2 text-[11px] text-ws-fg-secondary">
                {JSON.stringify(request.input, null, 2)}
            </pre>
            <div className="flex gap-2">
                <Button size="sm" onClick={() => onResolve(true)} className="h-7 px-3 text-xs">
                    Confirm
                </Button>
                <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onResolve(false)}
                    className="h-7 px-3 text-xs"
                >
                    Reject
                </Button>
            </div>
        </div>
    );
}
