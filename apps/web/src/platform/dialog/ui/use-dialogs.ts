'use client';

import React, { useSyncExternalStore } from 'react';
import { container } from '@/platform/bootstrap';
import { DialogService } from '../service';
import type { DialogRequest } from '../types';

interface DialogsState {
    dialogs: Map<string, DialogRequest>;
}

const dialogService = container.get<DialogService>(DialogService);

let currentState: DialogsState = {
    dialogs: new Map(),
};

const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

function getSnapshot(): DialogsState {
    return currentState;
}

const serverSnapshot: DialogsState = { dialogs: new Map() };

function getServerSnapshot(): DialogsState {
    return serverSnapshot;
}

let initialized = false;
function ensureInitialized() {
    if (initialized) return;
    initialized = true;

    dialogService.onDidRequestDialog((request: DialogRequest) => {
        currentState = {
            dialogs: new Map(currentState.dialogs).set(request.id, request),
        };
        for (const l of listeners) {
            l();
        }
    });

    dialogService.onDidDismissDialog((id: string) => {
        currentState = {
            dialogs: new Map(currentState.dialogs),
        };
        currentState.dialogs.delete(id);
        for (const l of listeners) {
            l();
        }
    });
}

export function useDialogs() {
    ensureInitialized();
    const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

    const dismissDialog = React.useCallback((request: DialogRequest) => {
        console.log('[useDialogs] dismissDialog called:', request.id);
        console.log('[useDialogs] dialogs before delete:', currentState.dialogs.size);

        const id = request.id;
        // 创建新的 Map 对象而不是直接修改
        currentState = {
            dialogs: new Map(currentState.dialogs),
        };
        currentState.dialogs.delete(id);

        console.log('[useDialogs] dialogs after delete:', currentState.dialogs.size);
        console.log('[useDialogs] notifying listeners');

        // 通知所有监听器状态已变更
        for (const l of listeners) {
            l();
        }

        // Resolve the promise to prevent leaks (null = cancelled, false = dismissed)
        console.log('[useDialogs] resolving promise');
        request.resolve(
            request.type === 'input' ? null : request.type === 'confirm' ? false : undefined,
        );
    }, []);

    console.log('[useDialogs] render, dialogs count:', state.dialogs.size);

    return {
        dialogs: state.dialogs,
        dismissDialog,
    };
}
