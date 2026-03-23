import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { AVAILABLE_TABS } from '@/lib/workspace/constants';
import type { ProjectInfo } from '@/platform/file-system/project-types';
import type { SidebarTabConfig, TabPanelState } from '@/types/workspace';

/**
 * 项目状态接口
 */
interface ProjectState {
    currentProject: ProjectInfo | null;
    isOpen: boolean;
    loading: boolean;
}

/**
 * Workspace state interface
 */
interface WorkspaceState {
    // Sidebar state
    sidebarActiveTab: string;
    sidebarCollapsed: boolean;

    // AI Panel state
    aiPanelCollapsed: boolean;

    // Tab configuration
    sidebarTabs: SidebarTabConfig[];
    sidebarTabOrder: string[];

    // Per-tab state preservation
    tabPanelStates: Map<string, TabPanelState>;

    // Project state
    project: ProjectState;

    // Actions
    setSidebarActiveTab: (tab: string) => void;
    toggleSidebar: () => void;
    setSidebarCollapsed: (collapsed: boolean) => void;
    toggleAIPanel: () => void;
    setAIPanelCollapsed: (collapsed: boolean) => void;

    // Tab management actions
    setSidebarTabs: (tabs: SidebarTabConfig[]) => void;
    addTab: (tab: SidebarTabConfig) => void;
    removeTab: (tabId: string) => void;
    reorderTabs: (tabIds: string[]) => void;

    // Panel state actions
    setTabPanelState: (tabId: string, state: Partial<TabPanelState>) => void;
    getTabPanelState: (tabId: string) => TabPanelState | undefined;

    // Project actions
    setCurrentProject: (project: ProjectInfo | null) => void;
    setLoading: (loading: boolean) => void;
    clearProject: () => void;
}

/**
 * 初始化默认标签页
 */
const initializeDefaultTabs = (): SidebarTabConfig[] => {
    return AVAILABLE_TABS.filter(tab => !tab.isDeletable).map(tab => ({
        ...tab,
        isActive: tab.id === 'files',
    }));
};

/**
 * Workspace store with persist middleware
 * Uses localStorage to persist panel collapse states, active tab, and tab configuration
 */
export const useWorkspaceStore = create<WorkspaceState>()(
    persist(
        set => ({
            // Initial state
            sidebarActiveTab: 'files',
            sidebarCollapsed: false,
            aiPanelCollapsed: false,
            sidebarTabs: initializeDefaultTabs(),
            sidebarTabOrder: ['files', 'search'],
            tabPanelStates: new Map(),
            project: {
                currentProject: null,
                isOpen: false,
                loading: false,
            },

            // Actions
            setSidebarActiveTab: tab => set({ sidebarActiveTab: tab }),

            toggleSidebar: () => set(state => ({ sidebarCollapsed: !state.sidebarCollapsed })),

            setSidebarCollapsed: collapsed => set({ sidebarCollapsed: collapsed }),

            toggleAIPanel: () => set(state => ({ aiPanelCollapsed: !state.aiPanelCollapsed })),

            setAIPanelCollapsed: collapsed => set({ aiPanelCollapsed: collapsed }),

            // Tab management actions
            setSidebarTabs: tabs => set({ sidebarTabs: tabs }),

            addTab: tab =>
                set(state => {
                    // 检查标签页是否已存在
                    if (state.sidebarTabs.find(t => t.id === tab.id)) {
                        return state;
                    }
                    return {
                        sidebarTabs: [...state.sidebarTabs, { ...tab, isActive: true }],
                        sidebarTabOrder: [...state.sidebarTabOrder, tab.id],
                    };
                }),

            removeTab: tabId =>
                set(state => {
                    // 不能删除最后一个标签页
                    if (state.sidebarTabs.length <= 1) {
                        return state;
                    }

                    const filteredTabs = state.sidebarTabs.filter(t => t.id !== tabId);
                    const filteredOrder = state.sidebarTabOrder.filter(id => id !== tabId);

                    // 如果删除的是当前激活的标签页，激活另一个
                    let newActiveTab = state.sidebarActiveTab;
                    if (state.sidebarActiveTab === tabId) {
                        newActiveTab = filteredTabs[0]?.id || '';
                    }

                    // 清理该标签页的面板状态
                    const newPanelStates = new Map(state.tabPanelStates);
                    newPanelStates.delete(tabId);

                    return {
                        sidebarTabs: filteredTabs,
                        sidebarTabOrder: filteredOrder,
                        sidebarActiveTab: newActiveTab,
                        tabPanelStates: newPanelStates,
                    };
                }),

            reorderTabs: tabIds =>
                set(state => {
                    // 根据 tabIds 重新排序 tabs
                    const reorderedTabs = [...state.sidebarTabs].sort((a, b) => {
                        const indexA = tabIds.indexOf(a.id);
                        const indexB = tabIds.indexOf(b.id);
                        return indexA - indexB;
                    });

                    return {
                        sidebarTabs: reorderedTabs,
                        sidebarTabOrder: tabIds,
                    };
                }),

            // Panel state actions
            setTabPanelState: (tabId, newState) =>
                set(state => {
                    const newPanelStates = new Map(state.tabPanelStates);
                    const existingState = newPanelStates.get(tabId) || {};
                    newPanelStates.set(tabId, { ...existingState, ...newState });
                    return { tabPanelStates: newPanelStates };
                }),

            getTabPanelState: tabId => {
                // 直接从 state 中获取，避免循环引用
                const store = useWorkspaceStore as unknown as { getState: () => WorkspaceState };
                return store.getState().tabPanelStates.get(tabId);
            },

            // Project actions
            setCurrentProject: project =>
                set({
                    project: {
                        currentProject: project,
                        isOpen: !!project,
                        loading: false,
                    },
                }),

            setLoading: loading =>
                set(state => ({
                    project: {
                        ...state.project,
                        loading,
                    },
                })),

            clearProject: () =>
                set({
                    project: {
                        currentProject: null,
                        isOpen: false,
                        loading: false,
                    },
                }),
        }),
        {
            name: 'workspace-state',
            partialize: state => ({
                sidebarActiveTab: state.sidebarActiveTab,
                sidebarCollapsed: state.sidebarCollapsed,
                aiPanelCollapsed: state.aiPanelCollapsed,
                sidebarTabs: state.sidebarTabs,
                sidebarTabOrder: state.sidebarTabOrder,
                // 注意：Map 不能直接序列化，需要转换
                tabPanelStates: Array.from(state.tabPanelStates.entries()),
                // 项目状态持久化 (不保存 rootHandle)
                project: state.project.currentProject
                    ? {
                          currentProject: {
                              ...state.project.currentProject,
                              rootHandle: null, // 句柄无法序列化
                          },
                          isOpen: state.project.isOpen,
                          loading: state.project.loading,
                      }
                    : { currentProject: null, isOpen: false, loading: false },
            }),
            // 反序列化时将数组转回 Map
            merge: (persistedState: unknown, currentState: WorkspaceState): WorkspaceState => {
                const persisted = persistedState as Partial<WorkspaceState> & {
                    tabPanelStates?: [string, TabPanelState][];
                    project?: {
                        currentProject: ProjectInfo | null;
                        isOpen: boolean;
                        loading: boolean;
                    };
                };
                return {
                    ...currentState,
                    ...persisted,
                    // 将 tabPanelStates 数组转回 Map
                    tabPanelStates: persisted.tabPanelStates
                        ? new Map(persisted.tabPanelStates)
                        : currentState.tabPanelStates,
                    // 恢复项目状态
                    project: persisted.project
                        ? {
                              ...persisted.project,
                              currentProject: persisted.project.currentProject
                                  ? { ...persisted.project.currentProject, rootHandle: null }
                                  : null,
                          }
                        : currentState.project,
                };
            },
        },
    ),
);
