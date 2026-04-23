'use client';

import { useSyncExternalStore } from 'react';
import { container } from '@/platform/bootstrap';
import { DocumentStore } from './service';
import type { DocumentMetadata } from './types';

const documentStore = container.get<DocumentStore>(DocumentStore);

const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

function getServerSnapshot(): DocumentMetadata | null {
    return null;
}

let initialized = false;
function ensureInitialized() {
    if (initialized) return;
    initialized = true;

    documentStore.onDidChange(() => {
        for (const l of listeners) {
            l();
        }
    });
}

export function useDocument(id: string | null): DocumentMetadata | null {
    ensureInitialized();

    const getSnapshotById = (): DocumentMetadata | null => {
        if (!id) return null;
        return documentStore.get(id) ?? null;
    };

    return useSyncExternalStore(subscribe, getSnapshotById, getServerSnapshot);
}
