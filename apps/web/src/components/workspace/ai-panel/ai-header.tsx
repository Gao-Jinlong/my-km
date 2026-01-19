import { PanelRightClose, PanelRightOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface AIHeaderProps {
    collapsed?: boolean;
    onToggle?: () => void;
}

export function AIHeader({ collapsed = false, onToggle }: AIHeaderProps) {
    return (
        <div className="flex items-center justify-between border-b px-4 py-3">
            <h3 className="font-semibold">AI Assistant</h3>
            <Button
                variant="ghost"
                size="icon"
                onClick={onToggle}
                aria-label={collapsed ? 'Expand AI Panel' : 'Collapse AI Panel'}
            >
                {collapsed ? (
                    <PanelRightOpen className="h-4 w-4" />
                ) : (
                    <PanelRightClose className="h-4 w-4" />
                )}
            </Button>
        </div>
    );
}
