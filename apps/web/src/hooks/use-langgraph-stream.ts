import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import type { Event } from '@/base/common/event';
import { createDefaultLangGraphChatRuntime } from '@/features/ai/langgraph/runtime-factory';
import type {
    LangGraphChatMessage,
    LangGraphChatRuntimeApi,
    LangGraphChatSnapshot,
    LangGraphConnectionAtom,
    LangGraphErrorAtom,
    LangGraphInterruptStateAtom,
    LangGraphMessagesAtom,
    LangGraphRunStateAtom,
    LangGraphThreadMetaAtom,
    LangGraphToolInterrupt,
} from '@/features/ai/langgraph/types';
import type { ConfirmationRequest } from '@/features/ai/tools/types';

export type ChatMessage = LangGraphChatMessage;
export type ToolInterrupt = LangGraphToolInterrupt;

export interface UseLangGraphStreamReturn extends LangGraphChatSnapshot {
    openThread: (threadId: string) => Promise<void>;
    sendMessage: (content: string, context?: Record<string, unknown>) => Promise<void>;
    resumeWithToolResult: (toolCallId: string, result: unknown) => Promise<void>;
    stop: () => Promise<void>;
    onConfirmationRequest?: Event<ConfirmationRequest>;
}

/**
 * spec 5.5: 精确订阅 hook，只订阅需要的 atom，避免无效重渲染。
 * 组件可以根据自己需要的数据选择对应的 selector。
 */
export function useLangGraphAtom<T>(
    runtime: LangGraphChatRuntimeApi,
    selector: (snapshot: LangGraphChatSnapshot) => T,
    serverSnapshot: T,
): T {
    const getSnapshot = () => selector(runtime.getSnapshot());

    return useSyncExternalStore(
        listener => {
            // 兼容模式：使用全局 subscribe（所有 atom 变化都触发）
            // 真正的精确订阅需要每个 atom 独立的 useSyncExternalStore 调用
            const subscription = runtime.subscribe(listener);
            return () => subscription.dispose();
        },
        getSnapshot,
        () => serverSnapshot,
    );
}

const SERVER_MESSAGES_ATOM: LangGraphMessagesAtom = { messages: [], lastSeq: 0 };
const SERVER_CONNECTION_ATOM: LangGraphConnectionAtom = { phase: 'idle' };
const SERVER_ERROR_ATOM: LangGraphErrorAtom = { error: null };
const SERVER_THREAD_META_ATOM: LangGraphThreadMetaAtom = { threadId: null };
const SERVER_RUN_STATE_ATOM: LangGraphRunStateAtom = { runId: null };
const SERVER_INTERRUPT_ATOM: LangGraphInterruptStateAtom = { interrupt: null };

export function useLangGraphStream(
    runtimeFactory: () => LangGraphChatRuntimeApi = createDefaultLangGraphChatRuntime,
): UseLangGraphStreamReturn {
    const runtimeRef = useRef<LangGraphChatRuntimeApi | null>(null);
    if (!runtimeRef.current) {
        runtimeRef.current = runtimeFactory();
    }

    const runtime = runtimeRef.current;

    // spec 5.5: 独立订阅每个 atom，精确触发重渲染
    const messagesState = useSyncExternalStore(
        listener => {
            const subscription = runtime.subscribeMessages(listener);
            return () => subscription.dispose();
        },
        () => ({
            messages: runtime.getSnapshot().messages,
            lastSeq: runtime.getSnapshot().lastSeq,
        }),
        () => SERVER_MESSAGES_ATOM,
    );

    const connectionState = useSyncExternalStore(
        listener => {
            const subscription = runtime.subscribeConnection(listener);
            return () => subscription.dispose();
        },
        () => ({ phase: runtime.getSnapshot().connectionPhase }),
        () => SERVER_CONNECTION_ATOM,
    );

    const errorState = useSyncExternalStore(
        listener => {
            const subscription = runtime.subscribeError(listener);
            return () => subscription.dispose();
        },
        () => ({ error: runtime.getSnapshot().error }),
        () => SERVER_ERROR_ATOM,
    );

    const threadMetaState = useSyncExternalStore(
        listener => {
            const subscription = runtime.subscribeThreadMeta(listener);
            return () => subscription.dispose();
        },
        () => ({ threadId: runtime.getSnapshot().threadId }),
        () => SERVER_THREAD_META_ATOM,
    );

    const runStateState = useSyncExternalStore(
        listener => {
            const subscription = runtime.subscribeRunState(listener);
            return () => subscription.dispose();
        },
        () => ({ runId: runtime.getSnapshot().runId }),
        () => SERVER_RUN_STATE_ATOM,
    );

    const interruptState = useSyncExternalStore(
        listener => {
            const subscription = runtime.subscribeInterruptState(listener);
            return () => subscription.dispose();
        },
        () => ({ interrupt: runtime.getSnapshot().interrupt }),
        () => SERVER_INTERRUPT_ATOM,
    );

    useEffect(() => () => runtime.dispose(), [runtime]);

    // 派生状态
    const isStreaming =
        connectionState.phase === 'streaming' || connectionState.phase === 'reconnecting';
    const isLastMessageStreaming =
        isStreaming &&
        messagesState.messages.length > 0 &&
        messagesState.messages[messagesState.messages.length - 1].role === 'ai';

    return useMemo(
        () => ({
            ...messagesState,
            ...connectionState,
            ...errorState,
            ...threadMetaState,
            ...runStateState,
            ...interruptState,
            isStreaming,
            isLastMessageStreaming,
            openThread: runtime.openThread.bind(runtime),
            sendMessage: runtime.sendMessage.bind(runtime),
            resumeWithToolResult: runtime.resumeWithToolResult.bind(runtime),
            stop: runtime.stop.bind(runtime),
            onConfirmationRequest: runtime.onConfirmationRequest,
        }),
        [
            messagesState,
            connectionState,
            errorState,
            threadMetaState,
            runStateState,
            interruptState,
            isStreaming,
            isLastMessageStreaming,
            runtime,
        ],
    );
}
