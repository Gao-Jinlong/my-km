import type { LexicalEditor } from 'lexical';
import { FORMAT_TEXT_COMMAND, type TextFormatType } from 'lexical';

import { cn } from '@/lib/utils';

interface ToolbarProps {
    editor: LexicalEditor;
    formatState: {
        bold: boolean;
        italic: boolean;
        underline: boolean;
        strikethrough: boolean;
        code: boolean;
        highlight: boolean;
        subscript: boolean;
        superscript: boolean;
    } | null;
    className?: string;
}

/**
 * Toolbar - 工具栏组件
 *
 * 提供文本格式控制按钮
 * 包括粗体、斜体、下划线等常用格式
 */
export function Toolbar({ editor, formatState, className }: ToolbarProps) {
    const formats: { name: TextFormatType; label: string; title: string }[] = [
        { name: 'bold', label: 'B', title: 'Bold (Ctrl+B)' },
        { name: 'italic', label: 'I', title: 'Italic (Ctrl+I)' },
        { name: 'underline', label: 'U', title: 'Underline (Ctrl+U)' },
        { name: 'strikethrough', label: 'S', title: 'Strikethrough' },
        { name: 'code', label: '</>', title: 'Code' },
        { name: 'highlight', label: 'A', title: 'Highlight' },
    ];

    const handleFormatToggle = (format: TextFormatType) => {
        editor.dispatchCommand(FORMAT_TEXT_COMMAND, format);
    };

    return (
        <div
            className={cn(
                'flex h-10 shrink-0 items-center gap-1 border-ws-border border-b bg-ws-bg-tertiary px-2',
                className,
            )}
        >
            {formats.map(format => {
                const isActive = formatState?.[format.name as keyof typeof formatState] ?? false;
                return (
                    <button
                        key={format.name}
                        type="button"
                        title={format.title}
                        onClick={() => handleFormatToggle(format.name)}
                        className={cn(
                            'flex h-7 min-w-[28px] items-center justify-center rounded px-1.5 text-sm',
                            isActive
                                ? 'bg-ws-accent text-ws-accent-foreground'
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
