/**
 * AIPanel — AI 聊天 UI 主组件
 *
 * 通过 useAIHarness hook 订阅 AIHarnessService 状态，
 * 渲染消息列表和输入区域。
 */

import { Loader2, Send } from 'lucide-react';
import { nanoid } from 'nanoid';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { AIHarnessService } from '@/features/ai/harness';
import { useAIHarness } from '@/hooks/use-ai-harness';
import { getContainer } from '@/platform/bootstrap';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { AIHeader } from './ai-header';
import { ContextBadge } from './context-badge';
import { ConversationList } from './conversation-list';
import { MessageBubble } from './message-bubble';

export function AIPanel() {
    const { toggleAIPanel, aiViewMode, setAIPanelViewMode } = useWorkspaceStore();
    const [inputValue, setInputValue] = useState('');
    const [showContextBadge, setShowContextBadge] = useState(true);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const isInitializedRef = useRef(false);

    const {
        messages,
        isGenerating,
        isProcessing,
        isConnected,
        selectedText,
        documentTitle,
        error,
        sendMessage,
        stopGenerating,
        registerTools,
    } = useAIHarness();

    // Track which room is currently generating
    const [generatingRoomId, setGeneratingRoomId] = useState<string | undefined>();
    const [activeRoomId, setActiveRoomId] = useState<string | undefined>();

    // 初始化：注册工具 + 对话恢复
    useEffect(() => {
        if (isInitializedRef.current) return;
        isInitializedRef.current = true;

        // 注册工具
        import('./tool-setup').then(({ registerDefaultTools }) => {
            registerTools(registerDefaultTools);
        });

        // Room recovery: check localStorage for saved room
        const harness = getContainer().get<AIHarnessService>('aiHarness');
        const joinRoom = (id: string) => harness.joinRoom(id);
        const savedId = (() => {
            try {
                return localStorage.getItem('activeRoomId');
            } catch {
                return null;
            }
        })();

        if (savedId) {
            // Restore existing room
            setActiveRoomId(savedId);
            harness.restoreRoom(savedId);
        } else {
            // Create new room
            const roomId = `room-${nanoid(8)}`;
            setActiveRoomId(roomId);
            joinRoom(roomId);
        }
    }, [registerTools]);

    // Track generating state
    useEffect(() => {
        if (isGenerating && activeRoomId) {
            setGeneratingRoomId(activeRoomId);
        } else {
            setGeneratingRoomId(undefined);
        }
    }, [isGenerating, activeRoomId]);

    // 当 harness 选中文字变化时，重新显示 badge
    useEffect(() => {
        if (selectedText) setShowContextBadge(true);
    }, [selectedText]);

    // 自动滚动到底部
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    });

    const handleSend = useCallback(async () => {
        const trimmed = inputValue.trim();
        if (!trimmed || isGenerating || isProcessing) return;

        await sendMessage(trimmed);
        setInputValue('');
    }, [inputValue, isGenerating, isProcessing, sendMessage]);

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
            }
        },
        [handleSend],
    );

    const handleStop = useCallback(() => {
        stopGenerating();
    }, [stopGenerating]);

    const harness = useAIHarness().harness;

    const handleJoinRoom = useCallback(
        (id: string) => {
            setActiveRoomId(id);
            harness.joinRoom(id);
            setAIPanelViewMode('chat');
        },
        [harness, setAIPanelViewMode],
    );

    const handleCreateNewRoom = useCallback(
        (id: string) => {
            setActiveRoomId(id);
            harness.joinRoom(id);
            setAIPanelViewMode('chat');
        },
        [harness, setAIPanelViewMode],
    );

    return (
        <div className="flex h-full flex-col bg-ws-bg-primary">
            <AIHeader
                collapsed={false}
                onToggle={toggleAIPanel}
                viewMode={aiViewMode}
                onViewModeToggle={() => setAIPanelViewMode(aiViewMode === 'chat' ? 'list' : 'chat')}
            />

            {aiViewMode === 'list' ? (
                <ConversationList
                    onJoinRoom={handleJoinRoom}
                    onCreateNewRoom={handleCreateNewRoom}
                    activeRoomId={activeRoomId}
                    generatingRoomId={generatingRoomId}
                />
            ) : (
                <>
                    {/* 连接状态指示 */}
                    <div className="flex h-6 items-center justify-center border-ws-border border-b px-4">
                        <div className="flex items-center gap-1.5">
                            <div
                                className={`h-1.5 w-1.5 rounded-full ${isConnected ? 'bg-green-500' : 'bg-gray-400'}`}
                            />
                            <span className="text-[10px] text-ws-fg-muted">
                                {isConnected ? 'Connected' : 'Ready'}
                            </span>
                        </div>
                    </div>

                    {/* 错误提示 */}
                    {error && (
                        <div className="border-red-500/30 border-b bg-red-500/10 px-4 py-2">
                            <p className="text-red-400 text-xs">{error}</p>
                        </div>
                    )}

                    {/* 消息列表 */}
                    <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
                        {messages.length === 0 && (
                            <div className="flex h-full items-center justify-center">
                                <div className="text-center">
                                    <h3 className="font-semibold text-sm text-ws-fg-primary">
                                        AI Assistant
                                    </h3>
                                    <p className="mt-1 text-ws-fg-muted text-xs">
                                        Select text in the editor and send a message
                                    </p>
                                </div>
                            </div>
                        )}

                        {messages.map(msg => (
                            <MessageBubble key={msg.id} message={msg} />
                        ))}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* 输入区域 */}
                    <div className="flex flex-col gap-2 border-ws-border border-t p-3">
                        {/* 选中文本上下文指示 */}
                        {showContextBadge && selectedText && (
                            <ContextBadge
                                selectedText={selectedText}
                                documentTitle={documentTitle}
                                onClear={() => setShowContextBadge(false)}
                            />
                        )}

                        {isGenerating && (
                            <div className="flex items-center justify-between px-1">
                                <div className="flex items-center gap-2 text-ws-fg-muted text-xs">
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                    <span>AI is thinking...</span>
                                </div>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={handleStop}
                                    className="h-6 px-2 text-xs"
                                >
                                    Stop
                                </Button>
                            </div>
                        )}

                        <div className="flex items-end gap-2">
                            <textarea
                                value={inputValue}
                                onChange={e => setInputValue(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder="Ask AI anything..."
                                disabled={isGenerating || isProcessing}
                                rows={1}
                                className="flex-1 resize-none rounded-md border-0 bg-ws-bg-secondary px-3 py-2 text-[13px] text-ws-fg-primary placeholder:text-ws-fg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ws-accent disabled:cursor-not-allowed disabled:opacity-50"
                            />
                            <Button
                                size="icon"
                                onClick={handleSend}
                                disabled={isGenerating || !inputValue.trim()}
                                className="h-9 w-9 shrink-0"
                            >
                                {isGenerating ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    <Send className="h-4 w-4" />
                                )}
                            </Button>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
