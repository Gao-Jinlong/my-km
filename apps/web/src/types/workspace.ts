/**
 * 工作空间侧边栏类型定义
 */

/**
 * 侧边栏标签页配置
 */
export interface SidebarTabConfig {
    id: string; // 唯一标识符
    label: string; // 显示标签
    icon: string; // Lucide 图标名称
    panelId: string; // 关联的面板组件 ID
    order: number; // 排序顺序
    isDeletable: boolean; // 是否可删除
    isActive?: boolean; // 激活状态 (可选,用于 UI 渲染)
}

/**
 * 标签页面板状态 (通用)
 */
export interface TabPanelState {
    scrollPosition?: number; // 滚动位置
    expandedNodes?: string[]; // 展开的节点 (用于文件树)
    searchQuery?: string; // 搜索关键词 (用于搜索面板)
    selectedFile?: string | null; // 选中的文件路径
}

/**
 * 文件面板状态
 */
export interface FilesPanelState extends TabPanelState {
    expandedFolders: string[]; // 展开的文件夹路径数组
    selectedFile: string | null; // 当前选中的文件路径
    scrollPosition: number; // 滚动位置
}

/**
 * 搜索面板状态
 */
export interface SearchPanelState extends TabPanelState {
    query: string; // 搜索关键词
    searchType: 'all' | 'filename' | 'content' | 'tags' | 'vector'; // 搜索类型
    filters: {
        fileTypes?: string[]; // 文件类型过滤
        tags?: string[]; // 标签过滤
        dateRange?: {
            start: Date;
            end: Date;
        };
    };
    results: SearchResult[]; // 搜索结果
    selectedResult: string | null; // 选中的结果 ID
}

/**
 * 搜索结果
 */
export interface SearchResult {
    id: string;
    type: 'file' | 'folder';
    path: string;
    name: string;
    extension?: string;
    icon: string;
    matches: MatchInfo[];
    score: number;
}

/**
 * 匹配信息
 */
export interface MatchInfo {
    type: 'filename' | 'content' | 'tag' | 'metadata';
    line?: number;
    column?: number;
    preview: string;
    highlights: {
        start: number;
        end: number;
    }[];
}

/**
 * 可用的标签页类型
 */
export const AVAILABLE_TAB_TYPES = [
    'files',
    'search',
    'outline',
    'todo',
    'bookmarks',
    'tags',
] as const;

export type AvailableTabType = (typeof AVAILABLE_TAB_TYPES)[number];
