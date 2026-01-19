import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { SidebarTab } from '@/lib/workspace/constants';

/**
 * Workspace state interface
 */
interface WorkspaceState {
    // Sidebar state
    sidebarActiveTab: SidebarTab;
    sidebarCollapsed: boolean;

    // AI Panel state
    aiPanelCollapsed: boolean;

    // Actions
    setSidebarActiveTab: (tab: SidebarTab) => void;
    toggleSidebar: () => void;
    setSidebarCollapsed: (collapsed: boolean) => void;
    toggleAIPanel: () => void;
    setAIPanelCollapsed: (collapsed: boolean) => void;
}

/**
 * Workspace store with persist middleware
 * Uses localStorage to persist panel collapse states and active tab
 */
export const useWorkspaceStore = create<WorkspaceState>()(
    persist(
        set => ({
            // Initial state
            sidebarActiveTab: 'files',
            sidebarCollapsed: false,
            aiPanelCollapsed: false,

            // Actions
            setSidebarActiveTab: tab => set({ sidebarActiveTab: tab }),

            toggleSidebar: () => set(state => ({ sidebarCollapsed: !state.sidebarCollapsed })),

            setSidebarCollapsed: collapsed => set({ sidebarCollapsed: collapsed }),

            toggleAIPanel: () => set(state => ({ aiPanelCollapsed: !state.aiPanelCollapsed })),

            setAIPanelCollapsed: collapsed => set({ aiPanelCollapsed: collapsed }),
        }),
        {
            name: 'workspace-state',
            partialize: state => ({
                sidebarActiveTab: state.sidebarActiveTab,
                sidebarCollapsed: state.sidebarCollapsed,
                aiPanelCollapsed: state.aiPanelCollapsed,
            }),
        },
    ),
);
