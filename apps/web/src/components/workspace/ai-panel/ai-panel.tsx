import { Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { AIHeader } from './ai-header';

export function AIPanel() {
    const { aiPanelCollapsed, toggleAIPanel } = useWorkspaceStore();

    return (
        <div className="flex h-full flex-col bg-ws-bg-primary">
            {/* Header */}
            <AIHeader collapsed={aiPanelCollapsed} onToggle={toggleAIPanel} />

            {/* Chat Area */}
            {!aiPanelCollapsed && (
                <>
                    <div className="flex flex-1 flex-col gap-4 p-4">
                        <div className="flex h-full items-center justify-center">
                            <div className="text-center">
                                <h3 className="font-semibold text-sm text-ws-fg-primary">
                                    AI Chat
                                </h3>
                                <p className="text-ws-fg-muted text-xs">
                                    Conversation will be displayed here
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Input Area */}
                    <div className="flex h-[80px] flex-col border-ws-border border-t p-3">
                        <div className="flex flex-1 items-center gap-2">
                            <input
                                type="text"
                                placeholder="Ask AI anything..."
                                className="flex-1 rounded-md border-0 bg-ws-bg-secondary px-2 py-2 text-[13px] text-ws-fg-primary placeholder:text-ws-fg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ws-accent disabled:cursor-not-allowed disabled:opacity-50"
                                disabled
                            />
                            <Button size="icon" disabled className="h-8 w-8">
                                <Send className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
