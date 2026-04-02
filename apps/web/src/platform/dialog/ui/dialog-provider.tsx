/**
 * 对话框提供者组件
 *
 * 监听 DialogService 的事件，自动显示/隐藏对话框
 */

'use client';

import * as Dialog from '@radix-ui/react-dialog';
import * as React from 'react';
import { container } from '@/platform/bootstrap';
import { DialogService } from '../service';
import type { DialogRequest } from '../types';
import { AlertDialog } from './alert-dialog';
import { ConfirmDialog } from './confirm-dialog';
import { InputDialog } from './input-dialog';

interface DialogProviderProps {
    children: React.ReactNode;
}

// 在模块级别获取服务实例，避免每次渲染都获取
const dialogService = container.get<DialogService>(DialogService);

/**
 * 对话框提供者 - 应用根组件级别
 *
 * @example
 * ```tsx
 * // app/layout.tsx
 * import { DialogProvider } from '@/platform/dialog';
 *
 * export default function RootLayout({ children }) {
 *     return (
 *         <html>
 *             <body>
 *                 <DialogProvider>
 *                     {children}
 *                 </DialogProvider>
 *             </body>
 *         </html>
 *     );
 * }
 * ```
 */
export function DialogProvider({ children }: DialogProviderProps) {
    const [dialogs, setDialogs] = React.useState<Map<string, DialogRequest>>(new Map());

    React.useEffect(() => {
        // 监听对话框请求事件
        const unsubRequest = dialogService.onDidRequestDialog((request: DialogRequest) => {
            setDialogs(prev => {
                const next = new Map(prev);
                next.set(request.id, request);
                return next;
            });
        });

        // 监听对话框关闭事件
        const unsubDismiss = dialogService.onDidDismissDialog((id: string) => {
            setDialogs(prev => {
                const next = new Map(prev);
                next.delete(id);
                return next;
            });
        });

        return () => {
            unsubRequest.dispose();
            unsubDismiss.dispose();
        };
    }, []);

    const handleDismiss = React.useCallback((id: string) => {
        setDialogs(prev => {
            const next = new Map(prev);
            const request = prev.get(id);
            // Resolve the promise to prevent leaks (null = cancelled, false = dismissed)
            if (request) {
                request.resolve(
                    request.type === 'input'
                        ? null
                        : request.type === 'confirm'
                          ? false
                          : undefined,
                );
            }
            next.delete(id);
            return next;
        });
    }, []);

    return (
        <>
            {children}
            {Array.from(dialogs.entries()).map(([id, request]) => (
                <Dialog.Root
                    key={id}
                    open
                    onOpenChange={open => {
                        if (!open) {
                            handleDismiss(id);
                        }
                    }}
                >
                    <Dialog.Portal>
                        <Dialog.Overlay className="fixed inset-0 bg-black/50" />
                        <Dialog.Content className="fixed top-1/2 left-1/2 min-w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-ws-border bg-ws-bg-primary p-6 shadow-xl">
                            {request.type === 'input' && (
                                <InputDialog
                                    request={request}
                                    onSubmit={value => {
                                        request.resolve(value);
                                        handleDismiss(id);
                                    }}
                                    onCancel={() => {
                                        request.resolve(null);
                                        handleDismiss(id);
                                    }}
                                />
                            )}
                            {request.type === 'confirm' && (
                                <ConfirmDialog
                                    request={request}
                                    onConfirm={() => {
                                        request.resolve(true);
                                        handleDismiss(id);
                                    }}
                                    onCancel={() => {
                                        request.resolve(false);
                                        handleDismiss(id);
                                    }}
                                />
                            )}
                            {request.type === 'alert' && (
                                <AlertDialog
                                    request={request}
                                    onDismiss={() => {
                                        request.resolve(undefined);
                                        handleDismiss(id);
                                    }}
                                />
                            )}
                        </Dialog.Content>
                    </Dialog.Portal>
                </Dialog.Root>
            ))}
        </>
    );
}
