'use client';

import * as Dialog from '@radix-ui/react-dialog';
import type * as React from 'react';
import { AlertDialog } from './alert-dialog';
import { ConfirmDialog } from './confirm-dialog';
import { InputDialog } from './input-dialog';
import { useDialogs } from './use-dialogs';

interface DialogProviderProps {
    children: React.ReactNode;
}

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
    const { dialogs, dismissDialog } = useDialogs();

    return (
        <>
            {children}
            {Array.from(dialogs.entries()).map(([id, request]) => (
                <Dialog.Root
                    key={id}
                    open
                    onOpenChange={open => {
                        if (!open) {
                            dismissDialog(request);
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
                                        dismissDialog(request);
                                    }}
                                    onCancel={() => {
                                        request.resolve(null);
                                        dismissDialog(request);
                                    }}
                                />
                            )}
                            {request.type === 'confirm' && (
                                <ConfirmDialog
                                    request={request}
                                    onConfirm={() => {
                                        request.resolve(true);
                                        dismissDialog(request);
                                    }}
                                    onCancel={() => {
                                        request.resolve(false);
                                        dismissDialog(request);
                                    }}
                                />
                            )}
                            {request.type === 'alert' && (
                                <AlertDialog
                                    request={request}
                                    onDismiss={() => {
                                        request.resolve(undefined);
                                        dismissDialog(request);
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
