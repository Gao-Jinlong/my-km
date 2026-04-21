/**
 * EditorTab 类型定义
 */

export interface OpenDocument {
    id: string;
    path: string;
    title: string;
    type: 'km';
    openedAt: string;
    content?: string;
}
