/**
 * useAIHarness — AI Harness 服务订阅 Hook
 *
 * 通过 useSyncExternalStore 订阅 AIHarnessService 的全部状态变更
 * （消息列表、生成状态、选中文字、连接状态、错误），替代组件内
 * 手动维护多个 useState + useEffect 监听器的模式。
 */

import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import type { AIHarnessService } from '@/features/ai/harness';
import { getContainer } from '@/platform/bootstrap';

interface AIHarnessSnapshot {
    messages: ReadonlyArray<import('@/features/ai/types/ai.types').MessageWire>;
    isGenerating: boolean;
    selectedText: string | null;
    documentTitle: string;
    isConnected: boolean;
    error: string | null;
}

/**
 * 创建外部 store 订阅：监听 harness 所有事件并维护快照。
 * 返回 unsubscribe 函数。
 */
function createSubscriber(
    harness: AIHarnessService,
    onSnapshot: (snap: AIHarnessSnapshot) => void,
) {
    // 初始快照
    let snap: AIHarnessSnapshot = {
        messages: harness.messages,
        isGenerating: harness.isGenerating,
        selectedText: harness.selectedText,
        documentTitle: '',
        isConnected: false,
        error: null,
    };

    const disposables: Array<{ dispose(): void }> = [];

    const update = () => onSnapshot({ ...snap });

    // 对话状态变更（消息列表、生成中）
    disposables.push(
        harness.onStateChange(({ messages, isGenerating }) => {
            snap = { ...snap, messages, isGenerating };
            update();
        }),
    );

    // 选中文字变更
    disposables.push(
        harness.onSelectionChange(({ selectedText, documentTitle }) => {
            snap = { ...snap, selectedText, documentTitle };
            update();
        }),
    );

    // 错误事件
    disposables.push(
        harness.onError(({ message }) => {
            snap = { ...snap, error: message };
            update();
        }),
    );

    // 连接状态变更
    disposables.push(
        harness.onConnectionChange(({ connected }) => {
            snap = { ...snap, isConnected: connected };
            update();
        }),
    );

    // 流式文本片段（更新当前 assistant 消息内容，触发 re-render）
    disposables.push(
        harness.onStreamChunk(() => {
            snap = { ...snap, messages: [...harness.messages] };
            update();
        }),
    );

    return () => {
        for (const d of disposables) d.dispose();
    };
}

export function useAIHarness() {
    const harnessRef = useRef<AIHarnessService | null>(null);

    // 惰性初始化 harness（仅在首次调用时）
    if (!harnessRef.current) {
        harnessRef.current = getContainer().get<AIHarnessService>('aiHarness');
    }

    const harness = harnessRef.current;

    // 错误自动清除 timer（用 ref 避免触发 re-render 重建订阅）
    const autoClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const snapshotRef = useRef<AIHarnessSnapshot>({
        messages: harness.messages,
        isGenerating: harness.isGenerating,
        selectedText: harness.selectedText,
        documentTitle: '',
        isConnected: false,
        error: null,
    });

    const subscribe = useCallback(
        (onStoreChange: () => void) => {
            // 组件挂载时增加引用
            harness.wsClient.acquire();

            const unsubscribe = createSubscriber(harness, snap => {
                snapshotRef.current = snap;
                // 错误自动清除：新错误触发时清除旧 timer
                if (snap.error && autoClearTimerRef.current) {
                    clearTimeout(autoClearTimerRef.current);
                }
                if (snap.error) {
                    autoClearTimerRef.current = setTimeout(() => {
                        snapshotRef.current = { ...snapshotRef.current, error: null };
                        onStoreChange();
                    }, 3000);
                }
                onStoreChange();
            });

            return () => {
                unsubscribe();
                // 组件卸载时减少引用，归零时 WSClientService 自动断开
                harness.wsClient.release();
            };
        },
        [harness],
    );

    // 组件卸载时清除 timer
    useEffect(() => {
        return () => {
            if (autoClearTimerRef.current) clearTimeout(autoClearTimerRef.current);
        };
    }, []);

    const getSnapshot = useCallback(() => snapshotRef.current, []);

    const snapshot = useSyncExternalStore(subscribe, getSnapshot);

    // 操作封装
    const connect = useCallback(
        async (wsUrl: string) => {
            await harness.connect(wsUrl);
        },
        [harness],
    );

    const disconnect = useCallback(() => {
        harness.disconnect();
    }, [harness]);

    const joinConversation = useCallback(
        (conversationId: string) => {
            harness.joinConversation(conversationId);
        },
        [harness],
    );

    const sendMessage = useCallback(
        (content: string) => {
            harness.sendMessage(content);
        },
        [harness],
    );

    const stopGenerating = useCallback(() => {
        harness.stopGenerating();
    }, [harness]);

    const registerTools = useCallback(
        (registerFn: (h: AIHarnessService) => void) => {
            registerFn(harness);
        },
        [harness],
    );

    return useMemo(
        () => ({
            // 状态
            messages: snapshot.messages,
            isGenerating: snapshot.isGenerating,
            isConnected: snapshot.isConnected,
            selectedText: snapshot.selectedText,
            documentTitle: snapshot.documentTitle,
            error: snapshot.error,

            // 原始 harness 引用（用于需要直接访问的场景）
            harness,

            // 操作
            connect,
            disconnect,
            joinConversation,
            sendMessage,
            stopGenerating,
            registerTools,
        }),
        [
            snapshot.messages,
            snapshot.isGenerating,
            snapshot.isConnected,
            snapshot.selectedText,
            snapshot.documentTitle,
            snapshot.error,
            harness,
            connect,
            disconnect,
            joinConversation,
            sendMessage,
            stopGenerating,
            registerTools,
        ],
    );
}
