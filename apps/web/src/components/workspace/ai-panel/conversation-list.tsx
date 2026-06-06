/**
 * ConversationList — 对话列表面板
 *
 * 通过 @langchain/langgraph-sdk 的 Client 查询 thread 列表，
 * 支持新建/切换对话。
 */

import type { Thread } from '@langchain/langgraph-sdk';
import { Loader2, Plus, Search } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { langgraphClient } from '@/features/ai/sdk/langgraph-client';
import type { ThreadRecord } from '@/features/ai/types/thread.types';
import { ConversationItem } from './conversation-item';

interface ConversationListProps {
    onJoinThread: (id: string) => void;
    onCreateNewThread: (id: string) => void;
    activeThreadId?: string;
    generatingThreadId?: string;
}

/**
 * 将 SDK Thread 转换为 ConversationItem 期望的 ThreadRecord 形态。
 *
 * SDK 使用 thread_id / metadata，内部组件使用 id / title。
 */
function toThreadRecord(thread: Thread): ThreadRecord {
    const metadata = (thread.metadata ?? {}) as Record<string, unknown>;
    const title = typeof metadata.title === 'string' ? metadata.title : null;
    const model = typeof metadata.model === 'string' ? metadata.model : null;
    const provider = typeof metadata.provider === 'string' ? metadata.provider : null;
    const messageCount = typeof metadata.message_count === 'number' ? metadata.message_count : 0;

    return {
        id: thread.thread_id,
        userId: null,
        title,
        status: 'active',
        model,
        provider,
        messageCount,
        createdAt: thread.created_at,
        updatedAt: thread.updated_at,
    };
}

export function ConversationList({
    onJoinThread,
    onCreateNewThread,
    activeThreadId,
    generatingThreadId,
}: ConversationListProps) {
    const [threads, setThreads] = useState<ThreadRecord[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchThreads = useCallback(async () => {
        try {
            setIsLoading(true);
            setError(null);
            // SDK: threads.search() — POST /api/threads/search
            const list = await langgraphClient.threads.search({ limit: 50 });
            setThreads(list.map(toThreadRecord));
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load threads');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchThreads();
    }, [fetchThreads]);

    const handleNewThread = useCallback(async () => {
        try {
            // SDK: threads.create() — POST /api/threads
            const thread = await langgraphClient.threads.create();
            onCreateNewThread(thread.thread_id);
            // 重新加载列表以包含新 thread
            fetchThreads();
        } catch (err) {
            console.error('Failed to create thread:', err);
        }
    }, [onCreateNewThread, fetchThreads]);

    const handleClick = useCallback(
        (id: string) => {
            onJoinThread(id);
        },
        [onJoinThread],
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
                    onClick={handleNewThread}
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
                            onClick={fetchThreads}
                            className="mt-2 text-ws-accent text-xs underline"
                        >
                            Retry
                        </button>
                    </div>
                )}

                {!isLoading && !error && threads.length === 0 && (
                    <div className="flex h-full flex-col items-center justify-center p-4 text-center">
                        <p className="text-sm text-ws-fg-muted">No conversations yet</p>
                        <button
                            type="button"
                            onClick={handleNewThread}
                            className="mt-2 text-ws-accent text-xs underline"
                        >
                            Start a new conversation
                        </button>
                    </div>
                )}

                {!isLoading && !error && threads.length > 0 && (
                    <div className="py-1">
                        {threads.map(thread => (
                            <ConversationItem
                                key={thread.id}
                                thread={thread}
                                isActive={thread.id === activeThreadId}
                                isGenerating={thread.id === generatingThreadId}
                                onClick={handleClick}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
