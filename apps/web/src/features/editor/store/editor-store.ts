/**
 * Editor Store - Zustand store for editor state management
 *
 * 负责管理单个编辑器的状态，包括文档、选区、格式状态等
 */

import type { Document, FormatState, Selection } from '../types';

/**
 * Editor state interface
 */
interface EditorState {
    /** 当前文档 */
    document: Document | null;
    /** 当前选区 */
    selection: Selection | null;
    /** 当前格式状态 */
    formatState: FormatState | null;
    /** 是否为脏状态（已修改未保存） */
    isDirty: boolean;
    /** 是否正在加载 */
    isLoading: boolean;
    /** 错误信息 */
    error: string | null;
}

/**
 * Editor actions interface
 */
interface EditorActions {
    /** 设置文档 */
    setDocument: (doc: Document) => void;
    /** 设置选区 */
    setSelection: (sel: Selection | null) => void;
    /** 设置格式状态 */
    setFormatState: (fmt: FormatState) => void;
    /** 标记为脏状态 */
    markDirty: () => void;
    /** 标记为干净状态 */
    markClean: () => void;
    /** 设置错误信息 */
    setError: (err: string) => void;
    /** 清除错误 */
    clearError: () => void;
    /** 重置 store 到初始状态 */
    reset: () => void;
}

/**
 * Editor store API type - combined state and actions
 */
export type EditorStoreApi = EditorState & EditorActions;

/**
 * Initial state
 */
const initialState: EditorState = {
    document: null,
    selection: null,
    formatState: null,
    isDirty: false,
    isLoading: false,
    error: null,
};

/**
 * Create editor store
 * 返回一个 store 实例（包含 state 和 actions 的对象）
 */
export function createEditorStore(): EditorStoreApi {
    let state: EditorState = { ...initialState };
    const listeners: Set<() => void> = new Set();

    // Helper to notify listeners
    const notify = () => {
        listeners.forEach(listener => {
            listener();
        });
    };

    // Create API object with state and actions
    const api: EditorStoreApi = {
        // State (getters to access current state)
        get document() {
            return state.document;
        },
        get selection() {
            return state.selection;
        },
        get formatState() {
            return state.formatState;
        },
        get isDirty() {
            return state.isDirty;
        },
        get isLoading() {
            return state.isLoading;
        },
        get error() {
            return state.error;
        },

        // Actions
        setDocument: doc => {
            state = { ...state, document: doc, error: null };
            notify();
        },

        setSelection: sel => {
            state = { ...state, selection: sel };
            notify();
        },

        setFormatState: fmt => {
            state = { ...state, formatState: fmt };
            notify();
        },

        markDirty: () => {
            state = { ...state, isDirty: true };
            notify();
        },

        markClean: () => {
            state = { ...state, isDirty: false };
            notify();
        },

        setError: err => {
            state = { ...state, error: err };
            notify();
        },

        clearError: () => {
            state = { ...state, error: null };
            notify();
        },

        reset: () => {
            state = { ...initialState };
            notify();
        },
    };

    return api;
}

/**
 * Helper function to create an empty format state
 */
export function createEmptyFormatState(): FormatState {
    return {
        bold: false,
        italic: false,
        underline: false,
        code: false,
        strikethrough: false,
        subscript: false,
        superscript: false,
        highlight: false,
    };
}

/**
 * Helper function to create an empty selection
 */
export function createEmptySelection(): Selection {
    return {
        anchor: { blockId: '', offset: 0 },
        head: { blockId: '', offset: 0 },
        text: '',
    };
}
