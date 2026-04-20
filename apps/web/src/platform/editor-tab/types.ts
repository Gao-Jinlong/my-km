/**
 * EditorTab 类型定义
 */

export interface OpenDocument {
    id: string;
    path: string;
    title: string;
    type: 'km';
    isDirty?: boolean;
    openedAt: string;
    content?: string;
}
