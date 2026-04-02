/**
 * 确认对话框组件
 */

'use client';

import { cn } from '@/lib/utils';
import type { DialogRequest } from '../types';

interface ConfirmDialogProps {
    request: DialogRequest;
    onConfirm: () => void;
    onCancel: () => void;
}

export function ConfirmDialog({ request, onConfirm, onCancel }: ConfirmDialogProps) {
    return (
        <div className="flex flex-col gap-4">
            <div className="font-medium text-base text-ws-fg-primary">{request.title}</div>
            {request.message && (
                <div className="text-sm text-ws-fg-secondary">{request.message}</div>
            )}
            <div className="flex justify-end gap-2">
                <button
                    type="button"
                    onClick={onCancel}
                    className={cn(
                        'rounded-md px-4 py-1.5 text-sm',
                        'bg-ws-bg-tertiary text-ws-fg-secondary hover:bg-ws-bg-secondary',
                    )}
                >
                    取消
                </button>
                <button
                    type="button"
                    onClick={onConfirm}
                    className={cn(
                        'rounded-md px-4 py-1.5 text-sm',
                        'bg-ws-accent text-white hover:bg-ws-accent/90',
                    )}
                >
                    确定
                </button>
            </div>
        </div>
    );
}
