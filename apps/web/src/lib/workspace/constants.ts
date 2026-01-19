/**
 * Workspace layout constants
 */

// Panel sizes (in percentage)
export const PANEL_SIZES = {
    SIDEBAR: {
        DEFAULT: 20, // ~280px on 1920px screen
        MIN: 15, // ~200px
        MAX: 35, // ~500px
        COLLAPSED: 4, // ~48px
    },
    EDITOR: {
        DEFAULT: 55,
        MIN: 40,
    },
    AI_PANEL: {
        DEFAULT: 25, // ~400px on 1920px screen
        MIN: 20, // ~300px
        MAX: 45, // ~800px
        COLLAPSED: 4, // ~48px
    },
} as const;

// Panel collapse/expand animation duration (ms)
export const PANEL_ANIMATION_DURATION = 200;

// LocalStorage keys
export const STORAGE_KEYS = {
    WORKSPACE_LAYOUT: 'workspace-layout',
    WORKSPACE_STATE: 'workspace-state',
} as const;

// Sidebar tabs
export const SIDEBAR_TABS = {
    FILES: 'files',
    SEARCH: 'search',
} as const;

export type SidebarTab = (typeof SIDEBAR_TABS)[keyof typeof SIDEBAR_TABS];
