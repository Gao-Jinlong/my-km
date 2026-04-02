/**
 * 输入对话框组件
 */

'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import type { DialogRequest } from '../types';

interface InputDialogProps {
    request: DialogRequest;
    onSubmit: (value: string) => void;
    onCancel: () => void;
}

export function InputDialog({ request, onSubmit, onCancel }: InputDialogProps) {
    const [value, setValue] = React.useState(request.defaultValue ?? '');
    const inputRef = React.useRef<HTMLInputElement>(null);

    React.useEffect(() => {
        // 自动聚焦输入框
        inputRef.current?.focus();
        inputRef.current?.select();
    }, []);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            onSubmit(value);
        } else if (e.key === 'Escape') {
            e.preventDefault();
            onCancel();
        }
    };

    return (
        <div className="flex flex-col gap-4">
            <div className="font-medium text-base text-ws-fg-primary">{request.title}</div>
            {request.message && (
                <div className="text-sm text-ws-fg-secondary">{request.message}</div>
            )}
            <input
                ref={inputRef}
                type="text"
                value={value}
                onChange={e => setValue(e.target.value)}
                onKeyDown={handleKeyDown}
                className="w-full rounded-md border border-ws-border bg-ws-bg-secondary px-3 py-2 text-sm text-ws-fg-primary outline-none focus:border-ws-accent"
            />
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
                    onClick={() => onSubmit(value)}
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
