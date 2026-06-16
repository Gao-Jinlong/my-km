import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import type { Event } from '@/base/common/event';
import { createDefaultLangGraphChatRuntime } from '@/features/ai/langgraph/runtime-factory';
import type {
    LangGraphChatMessage,
    LangGraphChatRuntimeApi,
    LangGraphChatSnapshot,
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

const SERVER_SNAPSHOT: LangGraphChatSnapshot = {
    messages: [],
    isStreaming: false,
    isLastMessageStreaming: false,
    error: null,
    threadId: null,
    runId: null,
    interrupt: null,
    connectionPhase: 'idle',
    lastSeq: 0,
};

export function useLangGraphStream(
    runtimeFactory: () => LangGraphChatRuntimeApi = createDefaultLangGraphChatRuntime,
): UseLangGraphStreamReturn {
    const runtimeRef = useRef<LangGraphChatRuntimeApi | null>(null);
    if (!runtimeRef.current) {
        runtimeRef.current = runtimeFactory();
    }

    const runtime = runtimeRef.current;
    const snapshot = useSyncExternalStore(
        listener => {
            const subscription = runtime.subscribe(listener);
            return () => subscription.dispose();
        },
        () => runtime.getSnapshot(),
        () => SERVER_SNAPSHOT,
    );

    useEffect(() => () => runtime.dispose(), [runtime]);

    return useMemo(
        () => ({
            ...snapshot,
            openThread: runtime.openThread.bind(runtime),
            sendMessage: runtime.sendMessage.bind(runtime),
            resumeWithToolResult: runtime.resumeWithToolResult.bind(runtime),
            stop: runtime.stop.bind(runtime),
            onConfirmationRequest: runtime.onConfirmationRequest,
        }),
        [snapshot, runtime],
    );
}
