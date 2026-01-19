import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

// Placeholder tabs for now
const placeholderTabs = [
    { id: '1', name: 'README.md', active: true },
    { id: '2', name: 'document.md', active: false },
];

export function EditorTabs() {
    return (
        <div className="flex items-center overflow-x-auto border-b bg-background">
            {placeholderTabs.map(tab => (
                <div
                    key={tab.id}
                    className={cn(
                        'group flex items-center gap-2 border-r px-4 py-2 text-sm transition-colors hover:bg-muted/50',
                        tab.active
                            ? 'border-b-2 border-b-primary bg-background'
                            : 'text-muted-foreground',
                    )}
                >
                    <span>{tab.name}</span>
                    <button
                        type="button"
                        className="rounded-sm opacity-0 transition-opacity hover:bg-muted group-hover:opacity-100"
                        aria-label="Close tab"
                    >
                        <X className="h-3 w-3" />
                    </button>
                </div>
            ))}
        </div>
    );
}
