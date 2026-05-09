import { List, MessageSquare, PanelRightClose, PanelRightOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface AIHeaderProps {
    collapsed?: boolean;
    onToggle?: () => void;
    viewMode?: 'chat' | 'list';
    onViewModeToggle?: () => void;
}

export function AIHeader({
    collapsed = false,
    onToggle,
    viewMode = 'chat',
    onViewModeToggle,
}: AIHeaderProps) {
    return (
        <div className="flex h-[40px] items-center justify-between border-ws-border border-b px-4">
            <h3 className="font-semibold text-[11px] text-ws-fg-muted uppercase">AI ASSISTANT</h3>
            <div className="flex items-center gap-1">
                {/* View mode toggle */}
                {onViewModeToggle && (
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={onViewModeToggle}
                        className="h-6 w-6 text-ws-icon hover:text-ws-fg-primary"
                        aria-label={
                            viewMode === 'chat' ? 'Show conversation list' : 'Show chat view'
                        }
                        title={viewMode === 'chat' ? 'Conversations' : 'Chat'}
                    >
                        {viewMode === 'chat' ? (
                            <List className="h-3.5 w-3.5" />
                        ) : (
                            <MessageSquare className="h-3.5 w-3.5" />
                        )}
                    </Button>
                )}
                {/* Collapse toggle */}
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={onToggle}
                    className="h-6 w-6 text-ws-icon hover:text-ws-fg-primary"
                    aria-label={collapsed ? 'Expand AI Panel' : 'Collapse AI Panel'}
                >
                    {collapsed ? (
                        <PanelRightOpen className="h-4 w-4" />
                    ) : (
                        <PanelRightClose className="h-4 w-4" />
                    )}
                </Button>
            </div>
        </div>
    );
}
