'use client';

import { useState } from 'react';

interface ProjectPickerProps {
    open: boolean;
    onClose: () => void;
    onProjectSelected: (handle: FileSystemDirectoryHandle) => Promise<void>;
}

/**
 * 检查浏览器是否支持 File System Access API
 */
function supportsFileSystemAccess(): boolean {
    return 'showDirectoryPicker' in window;
}

export function ProjectPicker({ open, onClose, onProjectSelected }: ProjectPickerProps) {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    if (!open) {
        return null;
    }

    const handleSelectDirectory = async () => {
        if (!supportsFileSystemAccess()) {
            setError('当前浏览器不支持文件目录选择，请使用 Chrome 或 Edge 浏览器');
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            // @ts-expect-error - showDirectoryPicker 类型在某些环境中可能不存在
            const handle = await window.showDirectoryPicker({
                mode: 'readwrite',
            });
            await onProjectSelected(handle);
            onClose();
        } catch (err) {
            if ((err as DOMException).name === 'AbortError') {
                // 用户取消，静默处理
                onClose();
            } else {
                setError(err instanceof Error ? err.message : '打开项目失败');
            }
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="w-full max-w-md rounded-lg bg-ws-bg-primary p-6 shadow-xl">
                <h2 className="mb-4 font-semibold text-ws-foreground text-xl">选择项目目录</h2>

                {!supportsFileSystemAccess() ? (
                    <div className="mb-4 rounded-md bg-yellow-50 p-4">
                        <p className="text-sm text-yellow-800">
                            您的浏览器不支持 File System Access API
                            <br />
                            请使用 Chrome 86+ 或 Edge 86+ 浏览器
                        </p>
                    </div>
                ) : (
                    <>
                        <p className="mb-6 text-ws-text-muted">选择一个文件夹作为您的项目目录</p>

                        {error && (
                            <div className="mb-4 rounded-md bg-red-50 p-4">
                                <p className="text-red-800 text-sm">{error}</p>
                            </div>
                        )}

                        <div className="flex justify-end gap-3">
                            <button
                                type="button"
                                onClick={onClose}
                                disabled={isLoading}
                                className="rounded-lg border border-ws-border px-4 py-2 text-ws-text-muted hover:bg-ws-bg-secondary"
                            >
                                取消
                            </button>
                            <button
                                type="button"
                                onClick={handleSelectDirectory}
                                disabled={isLoading}
                                className="rounded-lg bg-ws-accent px-4 py-2 font-medium text-ws-accent-foreground transition-colors hover:bg-ws-accent/90 disabled:opacity-50"
                            >
                                {isLoading ? '正在打开...' : '选择目录'}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
