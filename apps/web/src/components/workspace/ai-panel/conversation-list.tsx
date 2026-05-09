/**
 * ConversationList — 对话列表面板
 *
 * 渲染对话列表，支持：
 * - 新建对话
 * - 切换对话
 * - 加载中 / 空状态 / 错误状态
 */

import { Loader2, Plus, Search } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import {
    type ConversationRecord,
    createConversation,
    listConversations,
} from '@/features/ai/api/conversation-api';

interface ConversationListProps {
    onJoinConversation: (id: string) => void;
    onCreateNewConversation: (id: string) => void;
    activeConversationId?: string;
    generatingConversationId?: string;
}

export function ConversationList({
    onJoinConversation,
    onCreateNewConversation,
    activeConversationId,
    generatingConversationId,
}: ConversationListProps) {
    const [conversations, setConversations] = useState<ConversationRecord[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchConversations = useCallback(async () => {
        try {
            setIsLoading(true);
            setError(null);
            const list = await listConversations({ limit: 50 });
            setConversations(list);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load conversations');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchConversations();
    }, [fetchConversations]);

    const handleNewConversation = useCallback(async () => {
        try {
            const conv = await createConversation();
            onCreateNewConversation(conv.id);
        } catch (err) {
            console.error('Failed to create conversation:', err);
        }
    }, [onCreateNewConversation]);

    const handleClick = useCallback(
        (id: string) => {
            onJoinConversation(id);
        },
        [onJoinConversation],
    );

    return (
        <div className="flex h-full flex-col bg-ws-bg-primary">
            {/* Header */}
            <div className="flex h-12 items-center justify-between border-ws-border border-b px-4">
                <h3 className="font-semibold text-sm text-ws-fg-primary">Conversations</h3>
            </div>

            {/* New conversation bar */}
            <div className="flex items-center gap-2 border-ws-border border-b px-3 py-2">
                <button
                    type="button"
                    onClick={handleNewConversation}
                    className="flex flex-1 items-center gap-1.5 rounded-md bg-ws-bg-secondary px-3 py-1.5 font-medium text-[13px] text-ws-accent hover:bg-ws-bg-tertiary"
                >
                    <Plus className="h-3.5 w-3.5" />
                    <span>New Conversation</span>
                </button>
                <button
                    type="button"
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md hover:bg-ws-bg-tertiary"
                    title="Search conversations"
                >
                    <Search className="h-4 w-4 text-ws-fg-muted" />
                </button>
            </div>

            {/* Conversation list */}
            <div className="flex-1 overflow-y-auto">
                {isLoading && (
                    <div className="flex h-32 items-center justify-center">
                        <Loader2 className="h-5 w-5 animate-spin text-ws-accent" />
                    </div>
                )}

                {error && !isLoading && (
                    <div className="p-4 text-center">
                        <p className="text-red-400 text-xs">{error}</p>
                        <button
                            type="button"
                            onClick={fetchConversations}
                            className="mt-2 text-ws-accent text-xs underline"
                        >
                            Retry
                        </button>
                    </div>
                )}

                {!isLoading && !error && conversations.length === 0 && (
                    <div className="flex h-full flex-col items-center justify-center p-4 text-center">
                        <p className="text-sm text-ws-fg-muted">No conversations yet</p>
                        <button
                            type="button"
                            onClick={handleNewConversation}
                            className="mt-2 text-ws-accent text-xs underline"
                        >
                            Start a new conversation
                        </button>
                    </div>
                )}

                {!isLoading && !error && conversations.length > 0 && (
                    <div className="py-1">
                        {conversations.map(conv => (
                            <ConversationItem
                                key={conv.id}
                                conversation={conv}
                                isActive={conv.id === activeConversationId}
                                isGenerating={conv.id === generatingConversationId}
                                onClick={handleClick}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

// 内联导入以避免循环依赖
import { ConversationItem } from './conversation-item';
