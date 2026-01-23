'use client';

import { Bookmark, CheckSquare, Files, List, Search, Settings, Tags, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { SettingsMenu } from './settings-menu';

const ACTIVITY_ICONS = [
    { id: 'files', icon: Files, label: 'Files', panelId: 'files' },
    { id: 'search', icon: Search, label: 'Search', panelId: 'search' },
    { id: 'outline', icon: List, label: 'Outline', panelId: 'outline' },
    { id: 'todo', icon: CheckSquare, label: 'TODO', panelId: 'todo' },
    { id: 'bookmarks', icon: Bookmark, label: 'Bookmarks', panelId: 'bookmarks' },
    { id: 'tags', icon: Tags, label: 'Tags', panelId: 'tags' },
];

export function ActivityBar({ className }: { className?: string }) {
    const { sidebarActiveTab, setSidebarActiveTab } = useWorkspaceStore();

    return (
        <div
            className={cn(
                'flex h-full w-[50px] flex-col items-center border-ws-border border-r bg-ws-bg-primary py-4',
                className,
            )}
        >
            {/* Top Icons - 主要功能图标 */}
            <div className="flex flex-col items-center gap-2">
                {ACTIVITY_ICONS.map(item => {
                    const Icon = item.icon;
                    const isActive = sidebarActiveTab === item.id;

                    return (
                        <button
                            key={item.id}
                            type="button"
                            onClick={() => setSidebarActiveTab(item.id)}
                            className={cn(
                                'flex h-6 w-6 items-center justify-center outline-none',
                                'transition-colors',
                                'hover:bg-ws-bg-tertiary',
                                isActive && 'text-ws-accent',
                                !isActive && 'text-ws-icon',
                            )}
                            aria-label={item.label}
                            title={item.label}
                        >
                            <Icon className="h-6 w-6" />
                        </button>
                    );
                })}
            </div>

            {/* Bottom Icons - 设置和账户 */}
            <div className="mt-auto flex flex-col items-center gap-2">
                <SettingsMenu>
                    <button
                        type="button"
                        className={cn(
                            'flex h-6 w-6 items-center justify-center outline-none',
                            'text-ws-icon',
                            'transition-colors',
                            'hover:bg-ws-bg-tertiary hover:text-ws-fg-primary',
                        )}
                        aria-label="Settings"
                        title="Settings"
                    >
                        <Settings className="h-6 w-6" />
                    </button>
                </SettingsMenu>

                <button
                    type="button"
                    className={cn(
                        'flex h-6 w-6 items-center justify-center outline-none',
                        'text-ws-icon',
                        'transition-colors',
                        'hover:bg-ws-bg-tertiary hover:text-ws-fg-primary',
                    )}
                    aria-label="Account"
                    title="Account"
                >
                    <User className="h-6 w-6" />
                </button>
            </div>
        </div>
    );
}
