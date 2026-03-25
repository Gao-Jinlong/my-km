import type { FormatState } from '@/features/editor/types';

import { cn } from '@/lib/utils';

interface ToolbarProps {
    formatState: FormatState | null;
    onFormatToggle: (format: string) => void;
    className?: string;
}

/**
 * Toolbar - 工具栏组件
 *
 * 提供文本格式控制按钮
 * 包括粗体、斜体、下划线等常用格式
 */
export function Toolbar({ formatState, onFormatToggle, className }: ToolbarProps) {
    // TODO: 从 formatState 读取实际状态
    const formats = [
        { name: 'bold', label: 'B', title: 'Bold (Ctrl+B)' },
        { name: 'italic', label: 'I', title: 'Italic (Ctrl+I)' },
        { name: 'underline', label: 'U', title: 'Underline (Ctrl+U)' },
        { name: 'strikethrough', label: 'S', title: 'Strikethrough' },
        { name: 'code', label: '</>', title: 'Code' },
        { name: 'highlight', label: 'A', title: 'Highlight' },
    ];

    return (
        <div
            className={cn(
                'flex h-10 shrink-0 items-center gap-1 border-ws-border border-b bg-ws-bg-tertiary px-2',
                className,
            )}
        >
            {formats.map(format => {
                const isActive = formatState?.[format.name as keyof FormatState] ?? false;
                return (
                    <button
                        key={format.name}
                        type="button"
                        title={format.title}
                        onClick={() => onFormatToggle(format.name)}
                        className={cn(
                            'flex h-7 min-w-[28px] items-center justify-center rounded px-1.5 text-sm transition-colors',
                            isActive
                                ? 'bg-ws-accent-secondary text-ws-fg-primary'
                                : 'text-ws-fg-secondary hover:bg-ws-bg-secondary hover:text-ws-fg-primary',
                        )}
                    >
                        {format.label}
                    </button>
                );
            })}

            <div className="mx-2 h-4 w-px bg-ws-border" />

            {/* TODO: 添加块级格式按钮（标题、列表、引用等） */}
        </div>
    );
}
