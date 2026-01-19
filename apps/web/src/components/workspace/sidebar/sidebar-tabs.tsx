import { Files, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SIDEBAR_TABS } from '@/lib/workspace/constants';
import { useWorkspaceStore } from '@/stores/workspace-store';

const tabs = [
    { id: SIDEBAR_TABS.FILES, label: 'Files', icon: Files },
    { id: SIDEBAR_TABS.SEARCH, label: 'Search', icon: Search },
] as const;

export function SidebarTabs() {
    const { sidebarActiveTab, setSidebarActiveTab } = useWorkspaceStore();

    return (
        <div className="flex items-center border-b px-2">
            {tabs.map(tab => {
                const Icon = tab.icon;
                const isActive = sidebarActiveTab === tab.id;

                return (
                    <button
                        type="button"
                        key={tab.id}
                        onClick={() => setSidebarActiveTab(tab.id)}
                        className={cn(
                            'flex flex-1 items-center justify-center gap-2 px-4 py-3 font-medium text-sm transition-colors',
                            isActive
                                ? 'border-primary border-b-2 text-foreground'
                                : 'text-muted-foreground hover:text-foreground',
                        )}
                        aria-selected={isActive}
                        role="tab"
                    >
                        <Icon className="h-4 w-4" />
                        <span>{tab.label}</span>
                    </button>
                );
            })}
        </div>
    );
}
