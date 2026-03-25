/**
 * Editor UI Store - 管理编辑器 UI 状态
 *
 * 负责管理：
 * - 打开的文档列表
 * - 活动文档
 * - 文档 Tab 相关操作
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Document } from '@/features/editor/types';

/**
 * 打开的文档信息
 */
export interface OpenDocument {
    /** 文档 ID */
    id: string;
    /** 文档路径 */
    path: string;
    /** 文档标题 */
    title: string;
    /** 文档类型 */
    type: 'rich-text' | 'markdown';
    /** 是否为脏状态（已修改未保存） */
    isDirty?: boolean;
    /** 打开时间 */
    openedAt: string;
}

/**
 * Editor UI State
 */
interface EditorUIState {
    /** 打开的文档列表 */
    openDocuments: OpenDocument[];
    /** 活动文档 ID */
    activeDocumentId: string | null;
}

/**
 * Editor UI Actions
 */
interface EditorUIActions {
    /** 打开文档 */
    openDocument: (doc: Document | OpenDocument) => void;
    /** 关闭文档 */
    closeDocument: (documentId: string) => void;
    /** 激活文档 */
    activateDocument: (documentId: string) => void;
    /** 更新文档状态 */
    updateDocument: (documentId: string, updates: Partial<OpenDocument>) => void;
    /** 关闭所有文档 */
    closeAllDocuments: () => void;
    /** 关闭其他文档 */
    closeOtherDocuments: (documentId: string) => void;
}

/**
 * Editor UI Store API
 */
export type EditorUIStoreApi = EditorUIState & EditorUIActions;

/**
 * Editor UI Store
 */
export const useEditorUIStore = create<EditorUIStoreApi>()(
    persist(
        (set, get) => ({
            // Initial state
            openDocuments: [],
            activeDocumentId: null,

            // Actions
            openDocument: doc => {
                const { openDocuments } = get();

                // 检查文档是否已经打开
                const existingDoc = openDocuments.find(d => d.id === doc.id);
                if (existingDoc) {
                    // 已打开，直接激活
                    set({ activeDocumentId: doc.id });
                    return;
                }

                // 创建新的打开文档记录
                const newDoc: OpenDocument = {
                    id: doc.id,
                    path: doc.path,
                    title: doc.title,
                    type: doc.type,
                    isDirty: false,
                    openedAt: new Date().toISOString(),
                };

                set({
                    openDocuments: [...openDocuments, newDoc],
                    activeDocumentId: doc.id,
                });
            },

            closeDocument: documentId => {
                const { openDocuments, activeDocumentId } = get();

                // 不能关闭最后一个文档
                if (openDocuments.length <= 1) {
                    return;
                }

                const filteredDocs = openDocuments.filter(d => d.id !== documentId);

                // 如果关闭的是当前活动文档，激活另一个
                let newActiveId = activeDocumentId;
                if (activeDocumentId === documentId) {
                    // 激活前一个文档，如果是第一个就激活新的第一个
                    const closedIndex = openDocuments.findIndex(d => d.id === documentId);
                    newActiveId = filteredDocs[Math.max(0, closedIndex - 1)]?.id || null;
                }

                set({
                    openDocuments: filteredDocs,
                    activeDocumentId: newActiveId,
                });
            },

            activateDocument: documentId => {
                set({ activeDocumentId: documentId });
            },

            updateDocument: (documentId, updates) => {
                const { openDocuments } = get();

                const updatedDocs = openDocuments.map(d =>
                    d.id === documentId ? { ...d, ...updates } : d
                );

                set({ openDocuments: updatedDocs });
            },

            closeAllDocuments: () => {
                set({
                    openDocuments: [],
                    activeDocumentId: null,
                });
            },

            closeOtherDocuments: documentId => {
                const { openDocuments } = get();

                const filteredDocs = openDocuments.filter(d => d.id === documentId);

                set({
                    openDocuments: filteredDocs,
                    activeDocumentId: documentId,
                });
            },
        }),
        {
            name: 'editor-ui-state',
            partialize: state => ({
                // 只保存打开的文档列表，不保存活动文档（重启后重置）
                openDocuments: state.openDocuments,
            }),
        },
    ),
);
