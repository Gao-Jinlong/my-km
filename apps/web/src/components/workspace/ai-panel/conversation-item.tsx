/**
 * ConversationItem — 单个对话列表项
 *
 * 根据对话状态显示不同样式：
 * - active: 蓝色背景，白色文字，活跃指示点
 * - unread: 蓝色指示点，正常背景
 * - generating: 旋转加载图标
 * - default: 正常背景，灰色文字
 */

import { Loader } from 'lucide-react';
import type { RoomRecord } from '@/features/ai/api/conversation-api';

interface RoomItemProps {
    room: RoomRecord;
    isActive: boolean;
    isGenerating?: boolean;
    onClick: (id: string) => void;
}

export function ConversationItem({ room, isActive, isGenerating = false, onClick }: RoomItemProps) {
    const title = room.title || `Room ${room.id.slice(0, 8)}`;
    const time = formatRelativeTime(room.updatedAt);

    return (
        <button
            type="button"
            onClick={() => onClick(room.id)}
            className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors ${
                isActive ? 'bg-ws-accent text-white' : 'text-ws-fg-primary hover:bg-ws-bg-secondary'
            }`}
            style={{ height: 48 }}
        >
            {/* 状态指示 */}
            <div className="flex h-2 w-2 shrink-0 items-center justify-center">
                {isGenerating ? (
                    <Loader className="h-3.5 w-3.5 animate-spin text-ws-accent" />
                ) : isActive ? (
                    <div className="h-2 w-2 rounded-full bg-white" />
                ) : (
                    <div className="h-2 w-2 rounded-full bg-ws-accent" />
                )}
            </div>

            {/* 标题 */}
            <span
                className={`flex-1 truncate text-[13px] ${
                    isActive ? 'font-medium text-white' : 'font-normal text-ws-fg-primary'
                }`}
            >
                {title}
            </span>

            {/* 时间 */}
            <span
                className={`shrink-0 text-[11px] ${
                    isActive ? 'text-white/70' : 'text-ws-fg-muted'
                }`}
            >
                {time}
            </span>
        </button>
    );
}

function formatRelativeTime(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    const diffHour = Math.floor(diffMs / 3600000);
    const diffDay = Math.floor(diffMs / 86400000);

    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHour < 24)
        return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    if (diffDay === 1) return 'Yesterday';
    if (diffDay < 7) return `${diffDay}d ago`;

    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
