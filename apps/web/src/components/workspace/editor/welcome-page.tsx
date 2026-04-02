'use client';

import { FileText } from 'lucide-react';

export function WelcomePage() {
    return (
        <div className="flex h-full flex-col items-center justify-center bg-ws-bg-secondary">
            <FileText className="mb-6 h-16 w-16 text-ws-fg-muted/30" />
            <h1 className="mb-2 font-light text-2xl text-ws-fg-primary">My KM</h1>
            <p className="mb-8 text-ws-fg-muted">知识管理工具</p>
            <div className="space-y-2 text-sm text-ws-fg-muted">
                <p>从左侧文件树选择文件打开</p>
                <p>
                    <span className="inline-block rounded border border-ws-border bg-ws-bg-tertiary px-1.5 py-0.5 font-mono text-ws-fg-secondary text-xs">
                        Ctrl+S
                    </span>{' '}
                    保存文件
                </p>
                <p>
                    <span className="inline-block rounded border border-ws-border bg-ws-bg-tertiary px-1.5 py-0.5 font-mono text-ws-fg-secondary text-xs">
                        Ctrl+W
                    </span>{' '}
                    关闭当前标签
                </p>
            </div>
        </div>
    );
}
