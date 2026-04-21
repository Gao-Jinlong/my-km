'use client';

import { useSyncExternalStore } from 'react';
import type { EditorState } from '@/features/editor/service/EditorService';
import { container } from '@/platform/bootstrap';
import type { EditorContainer } from './container/editor-container';

type EditorStateMap = Map<string, EditorState>;

let editorStates: EditorStateMap = new Map();
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

function getSnapshot(): EditorStateMap {
    return editorStates;
}

const serverSnapshot: EditorStateMap = new Map();

function getServerSnapshot(): EditorStateMap {
    return serverSnapshot;
}

let initialized = false;
function ensureInitialized() {
    if (initialized) return;
    initialized = true;

    const editorContainer = container.get('EditorContainer') as EditorContainer;
    editorContainer.onDidChangeEditorState(({ documentId, state }) => {
        editorStates = new Map(editorStates);
        editorStates.set(documentId, state);
        for (const l of listeners) {
            l();
        }
    });
}

export function useEditorServiceState(documentId: string | null): EditorState | null {
    ensureInitialized();
    const states = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
    if (!documentId) return null;
    return states.get(documentId) ?? null;
}

export function useAllEditorServiceStates(): EditorStateMap {
    ensureInitialized();
    return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
