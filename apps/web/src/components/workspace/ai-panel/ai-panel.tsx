import { Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { AIHeader } from './ai-header';

export function AIPanel() {
    const { aiPanelCollapsed, toggleAIPanel } = useWorkspaceStore();

    return (
        <div className="flex h-full flex-col bg-muted">
            {/* Header */}
            <AIHeader collapsed={aiPanelCollapsed} onToggle={toggleAIPanel} />

            {/* Chat Area */}
            {!aiPanelCollapsed && (
                <>
                    <div className="flex-1 p-4">
                        <div className="flex h-full items-center justify-center">
                            <div className="text-center">
                                <h3 className="font-semibold text-sm">AI Chat</h3>
                                <p className="text-muted-foreground text-xs">
                                    Conversation will be displayed here
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Input Area */}
                    <div className="border-t p-4">
                        <div className="flex items-center gap-2">
                            <input
                                type="text"
                                placeholder="Ask AI anything..."
                                className="flex-1 rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                                disabled
                            />
                            <Button size="icon" disabled>
                                <Send className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
