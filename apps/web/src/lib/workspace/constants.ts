/**
 * Workspace layout constants
 */

// Panel sizes (in percentage)
// 注意：必须使用字符串格式，数字会被 react-resizable-panels 解释为像素值
export const PANEL_SIZES = {
    SIDEBAR: {
        DEFAULT: '25', // 25% (~320px on 1920px screen)
        MIN: '20', // 20% (~256px)
        MAX: '40', // 40% (~576px)
        COLLAPSED: '4', // 4% (~48px)
    },
    EDITOR: {
        DEFAULT: '50', // 50%
        MIN: '35', // 35%
    },
    AI_PANEL: {
        DEFAULT: '25', // 25% (~400px on 1920px screen)
        MIN: '20', // 20% (~300px)
        MAX: '45', // 45% (~800px)
        COLLAPSED: '4', // 4% (~48px)
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

// Sidebar UI constants
export const SIDEBAR_CONSTANTS = {
    TAB_HEIGHT: 48, // px - 标签栏高度
    FOOTER_HEIGHT: 56, // px - 底部操作区高度
    MIN_WIDTH: 256, // px - 最小宽度 (20% of 1280px)
    MAX_WIDTH: 576, // px - 最大宽度 (40% of 1440px)
    DEFAULT_WIDTH: 320, // px - 默认宽度 (25% of 1280px)
} as const;

// Available tabs configuration
export const AVAILABLE_TABS = [
    {
        id: 'files',
        label: 'Files',
        icon: 'Files',
        panelId: 'files-panel',
        order: 0,
        isDeletable: false,
    },
    {
        id: 'search',
        label: 'Search',
        icon: 'Search',
        panelId: 'search-panel',
        order: 1,
        isDeletable: false,
    },
    // 未来标签页 (作为存根)
    {
        id: 'outline',
        label: 'Outline',
        icon: 'List',
        panelId: 'outline-panel',
        order: 2,
        isDeletable: true,
    },
    {
        id: 'todo',
        label: 'TODO',
        icon: 'CheckSquare',
        panelId: 'todo-panel',
        order: 3,
        isDeletable: true,
    },
    {
        id: 'bookmarks',
        label: 'Bookmarks',
        icon: 'Bookmark',
        panelId: 'bookmarks-panel',
        order: 4,
        isDeletable: true,
    },
    {
        id: 'tags',
        label: 'Tags',
        icon: 'Tags',
        panelId: 'tags-panel',
        order: 5,
        isDeletable: true,
    },
] as const;

// Default tabs (非删除的核心标签页)
export const DEFAULT_TABS = AVAILABLE_TABS.filter(tab => !tab.isDeletable);
