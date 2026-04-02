/**
 * 提示对话框组件
 */

'use client';

import { cn } from '@/lib/utils';
import type { DialogRequest } from '../types';

interface AlertDialogProps {
    request: DialogRequest;
    onDismiss: () => void;
}

export function AlertDialog({ request, onDismiss }: AlertDialogProps) {
    return (
        <div className="flex flex-col gap-4">
            <div className="font-medium text-base text-ws-fg-primary">{request.title}</div>
            {request.message && (
                <div className="text-sm text-ws-fg-secondary">{request.message}</div>
            )}
            <div className="flex justify-end">
                <button
                    type="button"
                    onClick={onDismiss}
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
