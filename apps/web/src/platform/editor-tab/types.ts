/**
 * EditorTab 类型定义
 */

export interface TabInfo {
    id: string;
    title: string;
    openedAt: string;
}

/** @deprecated 使用 TabInfo 代替 */
export type OpenDocument = TabInfo;
