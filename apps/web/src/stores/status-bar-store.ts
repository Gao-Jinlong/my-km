/**
 * StatusBarStore - 状态栏独立 store
 *
 * 使用 useSyncExternalStore 管理光标位置和字数信息。
 * 与 EditorState 分离，避免高频更新触发全局重渲染。
 */

'use client';

import { useSyncExternalStore } from 'react';

/**
 * 状态栏数据接口
 */
export interface StatusBarState {
    cursorLine: number;
    cursorCol: number;
    charCount: number;
}

let states: Map<string, StatusBarState> = new Map();
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

function getSnapshot(): Map<string, StatusBarState> {
    return states;
}

const serverSnapshot: Map<string, StatusBarState> = new Map();

function getServerSnapshot(): Map<string, StatusBarState> {
    return serverSnapshot;
}

/**
 * 更新状态栏数据
 *
 * 由 StatusBarPlugin 在 composer 内部调用，通过 RAF 节流。
 */
export function setStatusBarState(documentId: string, state: StatusBarState): void {
    states = new Map(states);
    states.set(documentId, state);
    for (const l of listeners) {
        l();
    }
}

/**
 * 消费状态栏数据
 *
 * @param documentId 文档 ID（当前活跃文档）
 * @returns 状态栏数据，无文档时返回 null
 */
export function useStatusBarState(documentId: string | null): StatusBarState | null {
    const allStates = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
    if (!documentId) return null;
    return allStates.get(documentId) ?? null;
}
