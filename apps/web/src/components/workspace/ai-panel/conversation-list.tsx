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
import { createRoom, listRooms, type RoomRecord } from '@/features/ai/api/conversation-api';
import { ConversationItem } from './conversation-item';

interface RoomListProps {
    onJoinRoom: (id: string) => void;
    onCreateNewRoom: (id: string) => void;
    activeRoomId?: string;
    generatingRoomId?: string;
}

export function ConversationList({
    onJoinRoom,
    onCreateNewRoom,
    activeRoomId,
    generatingRoomId,
}: RoomListProps) {
    const [rooms, setRooms] = useState<RoomRecord[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchRooms = useCallback(async () => {
        try {
            setIsLoading(true);
            setError(null);
            const list = await listRooms({ limit: 50 });
            setRooms(list);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load rooms');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchRooms();
    }, [fetchRooms]);

    const handleNewRoom = useCallback(async () => {
        try {
            const room = await createRoom();
            onCreateNewRoom(room.id);
        } catch (err) {
            console.error('Failed to create room:', err);
        }
    }, [onCreateNewRoom]);

    const handleClick = useCallback(
        (id: string) => {
            onJoinRoom(id);
        },
        [onJoinRoom],
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
                    onClick={handleNewRoom}
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
                            onClick={fetchRooms}
                            className="mt-2 text-ws-accent text-xs underline"
                        >
                            Retry
                        </button>
                    </div>
                )}

                {!isLoading && !error && rooms.length === 0 && (
                    <div className="flex h-full flex-col items-center justify-center p-4 text-center">
                        <p className="text-sm text-ws-fg-muted">No conversations yet</p>
                        <button
                            type="button"
                            onClick={handleNewRoom}
                            className="mt-2 text-ws-accent text-xs underline"
                        >
                            Start a new conversation
                        </button>
                    </div>
                )}

                {!isLoading && !error && rooms.length > 0 && (
                    <div className="py-1">
                        {rooms.map(room => (
                            <ConversationItem
                                key={room.id}
                                room={room}
                                isActive={room.id === activeRoomId}
                                isGenerating={room.id === generatingRoomId}
                                onClick={handleClick}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
