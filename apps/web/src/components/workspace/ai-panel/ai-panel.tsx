/**
 * AIPanel — AI 聊天 UI 主组件
 *
 * 连接 AIHarnessService，渲染消息列表和输入区域。
 */

import { Loader2, Send } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { AIHarnessService } from '@/features/ai/harness';
import type { MessageWire } from '@/features/ai/types/ai.types';
import { getContainer } from '@/platform/bootstrap';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { AIHeader } from './ai-header';
import { ContextBadge } from './context-badge';
import { MessageBubble } from './message-bubble';

export function AIPanel() {
    const { aiPanelCollapsed, toggleAIPanel } = useWorkspaceStore();
    const [inputValue, setInputValue] = useState('');
    const [messages, setMessages] = useState<ReadonlyArray<MessageWire>>([]);
    const [isGenerating, setIsGenerating] = useState(false);
    const [isConnected, setIsConnected] = useState(false);
    const [selectedText, setSelectedText] = useState<string | null>(null);
    const [docTitle, setDocTitle] = useState('');
    const harnessRef = useRef<AIHarnessService | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // 初始化 harness 服务和 WebSocket 连接
    useEffect(() => {
        const harness = getContainer().get('aiHarness') as AIHarnessService;
        harnessRef.current = harness;

        // 注册工具
        import('./tool-setup').then(({ registerDefaultTools }) => {
            registerDefaultTools(harness);
        });

        // 连接 WebSocket（MVP: 用 session ID 作为 conversationId）
        const connect = async () => {
            try {
                await harness.connect('http://localhost:3000/ai');
                setIsConnected(true);

                // 使用当前打开的文档 ID 作为 conversationId
                const conversationId = 'doc-default';
                harness.joinConversation(conversationId);
            } catch (error) {
                console.error('Failed to connect to AI service:', error);
                setIsConnected(false);
            }
        };
        connect();

        // 监听状态变化
        const stateListener = harness.onStateChange(
            ({ messages: newMessages, isGenerating: generating }) => {
                setMessages(newMessages);
                setIsGenerating(generating);
            },
        );

        // 监听选中文本变化
        const selectionListener = harness.onSelectionChange(
            ({ selectedText: text, documentTitle: title }) => {
                setSelectedText(text);
                setDocTitle(title);
            },
        );

        // 初始化选中状态
        setSelectedText(harness.selectedText);

        return () => {
            stateListener.dispose();
            selectionListener.dispose();
            harness.disconnect();
        };
    }, []);

    // 自动滚动到底部
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, []);

    const handleSend = useCallback(() => {
        const trimmed = inputValue.trim();
        if (!trimmed || !harnessRef.current || isGenerating) return;

        harnessRef.current.sendMessage(trimmed);
        setInputValue('');
    }, [inputValue, isGenerating]);

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
        harnessRef.current?.stopGenerating();
    }, []);

    if (aiPanelCollapsed) {
        return (
            <div className="flex h-full flex-col bg-ws-bg-primary">
                <AIHeader collapsed onToggle={toggleAIPanel} />
            </div>
        );
    }

    return (
        <div className="flex h-full flex-col bg-ws-bg-primary">
            <AIHeader collapsed={false} onToggle={toggleAIPanel} />

            {/* 连接状态指示 */}
            <div className="flex h-6 items-center justify-center border-ws-border border-b px-4">
                <div className="flex items-center gap-1.5">
                    <div
                        className={`h-1.5 w-1.5 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}
                    />
                    <span className="text-[10px] text-ws-fg-muted">
                        {isConnected ? 'Connected' : 'Connecting...'}
                    </span>
                </div>
            </div>

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

                {messages.map((msg: MessageWire) => (
                    <MessageBubble key={msg.id} message={msg} />
                ))}
                <div ref={messagesEndRef} />
            </div>

            {/* 输入区域 */}
            <div className="flex flex-col gap-2 border-ws-border border-t p-3">
                {/* 选中文本上下文指示 */}
                <ContextBadge
                    selectedText={selectedText}
                    documentTitle={docTitle}
                    onClear={() => setSelectedText(null)}
                />

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
                        disabled={!isConnected || isGenerating}
                        rows={1}
                        className="flex-1 resize-none rounded-md border-0 bg-ws-bg-secondary px-3 py-2 text-[13px] text-ws-fg-primary placeholder:text-ws-fg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ws-accent disabled:cursor-not-allowed disabled:opacity-50"
                    />
                    <Button
                        size="icon"
                        onClick={handleSend}
                        disabled={!isConnected || isGenerating || !inputValue.trim()}
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
        </div>
    );
}
