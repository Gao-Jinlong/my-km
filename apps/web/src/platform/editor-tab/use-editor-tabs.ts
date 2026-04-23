'use client';

import { useSyncExternalStore } from 'react';
import { container } from '@/platform/bootstrap';
import { EditorTabService } from './service';
import type { TabInfo } from './types';

const editorTabService = container.get<EditorTabService>(EditorTabService);

interface EditorTabsState {
    openDocuments: TabInfo[];
    activeDocumentId: string | null;
}

let currentState: EditorTabsState = {
    openDocuments: editorTabService.getOpenDocuments(),
    activeDocumentId: editorTabService.getActiveDocumentId(),
};

const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

function getSnapshot(): EditorTabsState {
    return currentState;
}

const serverSnapshot: EditorTabsState = { openDocuments: [], activeDocumentId: null };

function getServerSnapshot(): EditorTabsState {
    return serverSnapshot;
}

// Subscribe to service events once
let initialized = false;
function ensureInitialized() {
    if (initialized) return;
    initialized = true;

    editorTabService.onDidChangeDocuments(() => {
        currentState = {
            openDocuments: editorTabService.getOpenDocuments(),
            activeDocumentId: editorTabService.getActiveDocumentId(),
        };
        for (const l of listeners) {
            l();
        }
    });
}

export function useEditorTabs() {
    ensureInitialized();
    const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

    return {
        ...state,
        openDocument: editorTabService.openDocument.bind(editorTabService),
        closeDocument: editorTabService.closeDocument.bind(editorTabService),
        activateDocument: editorTabService.activateDocument.bind(editorTabService),
        closeOtherDocuments: editorTabService.closeOtherDocuments.bind(editorTabService),
        closeAllDocuments: editorTabService.closeAllDocuments.bind(editorTabService),
    };
}
