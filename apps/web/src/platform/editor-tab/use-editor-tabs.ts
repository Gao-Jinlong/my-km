'use client';

import { useSyncExternalStore } from 'react';
import { container } from '@/platform/bootstrap';
import { EditorTabService } from './service';
import type { OpenDocument } from './types';

const editorTabService = container.get<EditorTabService>(EditorTabService);

interface EditorTabsState {
    openDocuments: OpenDocument[];
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

function getServerSnapshot(): EditorTabsState {
    return { openDocuments: [], activeDocumentId: null };
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
