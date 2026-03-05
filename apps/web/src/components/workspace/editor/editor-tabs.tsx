import { FileText, X } from 'lucide-react';
import { cn } from '@/lib/utils';

// Placeholder tabs for now
const placeholderTabs = [
    { id: '1', name: 'README.md', active: true },
    { id: '2', name: 'document.md', active: false },
];

export function EditorTabs() {
    return (
        <div className="flex h-[36px] items-center bg-ws-bg-tertiary">
            {placeholderTabs.map(tab => (
                <div
                    key={tab.id}
                    className={cn(
                        'group flex items-center gap-1.5 border-ws-border border-r px-2.5 py-2 text-sm transition-colors',
                        tab.active
                            ? 'bg-ws-bg-secondary text-ws-fg-primary'
                            : 'text-ws-fg-muted hover:bg-ws-bg-secondary/50',
                    )}
                >
                    <FileText className="h-3.5 w-3.5 text-ws-icon" />

                    <span className="text-[12px]">{tab.name}</span>

                    <button
                        type="button"
                        className="rounded-sm p-0.5 opacity-0 transition-opacity hover:bg-ws-bg-tertiary group-hover:opacity-100"
                        aria-label="Close tab"
                    >
                        <X className="h-3 w-3 text-ws-icon" />
                    </button>
                </div>
            ))}
        </div>
    );
}
