import { useWorkspaceStore } from '@/stores/workspace-store';
import { SidebarFooter } from './sidebar-footer';
import { SidebarTabs } from './sidebar-tabs';

interface SidebarProps {
    collapsed?: boolean;
}

export function Sidebar({ collapsed = false }: SidebarProps) {
    const { sidebarActiveTab } = useWorkspaceStore();

    return (
        <div className="flex h-full flex-col bg-muted">
            {/* Header / Tabs */}
            {!collapsed && <SidebarTabs />}

            {/* Content Area */}
            <div className="flex-1 overflow-hidden">
                {sidebarActiveTab === 'files' && (
                    <div className="flex h-full flex-col p-4">
                        <h3 className="font-semibold">File Tree</h3>
                        <p className="text-muted-foreground text-sm">
                            File tree will be displayed here
                        </p>
                    </div>
                )}
                {sidebarActiveTab === 'search' && (
                    <div className="flex h-full flex-col p-4">
                        <h3 className="font-semibold">Search</h3>
                        <p className="text-muted-foreground text-sm">
                            Search interface will be displayed here
                        </p>
                    </div>
                )}
            </div>

            {/* Footer */}
            {!collapsed && <SidebarFooter />}
        </div>
    );
}
