/**
 * AIPanel — AI 聊天 UI 主组件
 *
 * 通过 useLangGraphStream 订阅 LangGraph runtime 快照，渲染消息列表和输入区域。
 */

import { Loader2, Send } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { collectEditorContext } from '@/features/ai/sdk/editor-context';
import type { ConfirmationRequest } from '@/features/ai/tools/types';
import { useLangGraphStream } from '@/hooks/use-langgraph-stream';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { AIHeader } from './ai-header';
import { ContextBadge } from './context-badge';
import { ConversationList } from './conversation-list';
import { MessageBubble } from './message-bubble';
import { ToolConfirmationDialog } from './tool-confirmation-dialog';

export function AIPanel() {
    const { toggleAIPanel, aiViewMode, setAIPanelViewMode } = useWorkspaceStore();
    const [inputValue, setInputValue] = useState('');
    const [showContextBadge, setShowContextBadge] = useState(true);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const {
        messages,
        isStreaming,
        isLastMessageStreaming,
        error,
        threadId,
        interrupt,
        openThread,
        sendMessage,
        stop,
        onConfirmationRequest,
    } = useLangGraphStream();

    // 当前等待用户确认的请求
    const [pendingConfirmation, setPendingConfirmation] = useState<ConfirmationRequest | null>(
        null,
    );

    useEffect(() => {
        if (!onConfirmationRequest) return;
        const sub = onConfirmationRequest(req => {
            setPendingConfirmation(req);
        });
        return () => sub.dispose();
    }, [onConfirmationRequest]);

    // Track which thread is currently generating
    const [generatingThreadId, setGeneratingThreadId] = useState<string | undefined>();
    const [activeThreadId, setActiveThreadId] = useState<string | undefined>();

    // Track generating state
    useEffect(() => {
        if (isStreaming && threadId) {
            setGeneratingThreadId(threadId);
        } else {
            setGeneratingThreadId(undefined);
        }
    }, [isStreaming, threadId]);

    // 自动保存 activeThreadId 到 localStorage
    useEffect(() => {
        if (threadId) {
            setActiveThreadId(threadId);
            try {
                localStorage.setItem('activeThreadId', threadId);
            } catch {
                // ignore
            }
        }
    }, [threadId]);

    // 自动滚动到底部
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    });

    const handleSend = useCallback(async () => {
        const trimmed = inputValue.trim();
        if (!trimmed || isStreaming) return;

        // 自动收集编辑器上下文
        const context = collectEditorContext() ?? undefined;
        await sendMessage(trimmed, context);
        setInputValue('');
    }, [inputValue, isStreaming, sendMessage]);

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
        stop();
    }, [stop]);

    const handleJoinThread = useCallback(
        (id: string) => {
            setActiveThreadId(id);
            setAIPanelViewMode('chat');
            void openThread(id);
        },
        [openThread, setAIPanelViewMode],
    );

    const handleCreateNewThread = useCallback(
        (id: string) => {
            setActiveThreadId(id);
            setAIPanelViewMode('chat');
            void openThread(id);
        },
        [openThread, setAIPanelViewMode],
    );

    // 获取编辑器上下文（用于 ContextBadge 显示）
    const [selectedText, setSelectedText] = useState<string | null>(null);
    const [documentTitle, setDocumentTitle] = useState('');

    // 定期收集编辑器选中文本
    useEffect(() => {
        const interval = setInterval(() => {
            const ctx = collectEditorContext();
            setSelectedText(ctx?.selectedText ?? null);
            setDocumentTitle(ctx?.documentTitle ?? '');
        }, 1000);
        return () => clearInterval(interval);
    }, []);

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
                    onJoinThread={handleJoinThread}
                    onCreateNewThread={handleCreateNewThread}
                    activeThreadId={activeThreadId}
                    generatingThreadId={generatingThreadId}
                />
            ) : (
                <>
                    {/* 连接状态指示 — SSE 模式下始终 Ready */}
                    <div className="flex h-6 items-center justify-center border-ws-border border-b px-4">
                        <div className="flex items-center gap-1.5">
                            <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
                            <span className="text-[10px] text-ws-fg-muted">Ready</span>
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
                                        Send a message to start a conversation
                                    </p>
                                </div>
                            </div>
                        )}

                        {messages.map((msg, idx) => (
                            <MessageBubble
                                key={msg.id}
                                message={msg}
                                isStreaming={
                                    isLastMessageStreaming &&
                                    idx === messages.length - 1 &&
                                    msg.role === 'ai'
                                }
                            />
                        ))}

                        {/* 工具中断确认 UI — 仅对写操作显示 */}
                        <ToolConfirmationDialog
                            request={pendingConfirmation}
                            onResolve={approved => {
                                pendingConfirmation?.resolve(approved);
                                setPendingConfirmation(null);
                            }}
                        />

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

                        {isStreaming && (
                            <div className="flex items-center justify-between px-1">
                                <div className="flex items-center gap-2 text-ws-fg-muted text-xs">
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                    <span>
                                        {isLastMessageStreaming
                                            ? 'AI is typing...'
                                            : 'AI is thinking...'}
                                    </span>
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
                                disabled={isStreaming || !!interrupt}
                                rows={1}
                                className="flex-1 resize-none rounded-md border-0 bg-ws-bg-secondary px-3 py-2 text-[13px] text-ws-fg-primary placeholder:text-ws-fg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ws-accent disabled:cursor-not-allowed disabled:opacity-50"
                            />
                            <Button
                                size="icon"
                                onClick={handleSend}
                                disabled={isStreaming || !inputValue.trim()}
                                className="h-9 w-9 shrink-0"
                            >
                                {isStreaming ? (
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
