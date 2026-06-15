import type { Event, IDisposable } from '@/base/common/event';
import type { ConfirmationRequest } from '@/features/ai/tools/types';

export interface LangGraphRawMessage {
    id?: string;
    type?: string;
    role?: string;
    content?: unknown;
    tool_calls?: Array<{ id?: string; name?: string }>;
    tool_call_id?: string;
    additional_kwargs?: Record<string, unknown>;
}

export interface LangGraphChatMessage {
    id: string;
    role: 'human' | 'ai' | 'tool' | 'system';
    content: string;
    toolCalls?: Array<{ id: string; name: string }>;
    toolCallId?: string;
}

export interface LangGraphToolInterrupt {
    toolCallId: string;
    toolName: string;
    input: Record<string, unknown>;
}

export interface LangGraphChatSnapshot {
    messages: LangGraphChatMessage[];
    isStreaming: boolean;
    isLastMessageStreaming: boolean;
    error: string | null;
    threadId: string | null;
    runId: string | null;
    interrupt: LangGraphToolInterrupt | null;
}

export interface LangGraphStreamEvent {
    id?: string;
    event: string;
    data: unknown;
}

export interface LangGraphRunsStreamPayload {
    input?: Record<string, unknown> | null;
    command?: { resume?: unknown };
    context?: unknown;
    metadata?: Record<string, unknown>;
    streamMode?: string[];
    multitaskStrategy?: 'reject' | 'interrupt' | 'rollback' | 'enqueue';
    signal?: AbortSignal;
}

export interface LangGraphRuntimeClient {
    threads: {
        create(): Promise<{ thread_id: string }>;
        getState?(threadId: string): Promise<{ values?: { messages?: LangGraphRawMessage[] } }>;
    };
    runs: {
        stream(
            threadId: string,
            assistantId: string,
            payload?: LangGraphRunsStreamPayload,
        ): AsyncIterable<LangGraphStreamEvent>;
        cancel(threadId: string, runId: string, wait?: boolean, action?: string): Promise<void>;
    };
}

export interface LangGraphRuntimeToolExecutor {
    readonly onConfirmationRequest?: Event<ConfirmationRequest>;
    dispatch(toolName: string, input: Record<string, unknown>): Promise<unknown>;
}

export interface LangGraphChatRuntimeOptions {
    client: LangGraphRuntimeClient;
    toolExecutor: LangGraphRuntimeToolExecutor;
    assistantId?: string;
}

export interface LangGraphChatRuntimeApi {
    readonly onConfirmationRequest?: Event<ConfirmationRequest>;
    getSnapshot(): LangGraphChatSnapshot;
    subscribe(listener: () => void): IDisposable;
    openThread(threadId: string): Promise<void>;
    sendMessage(content: string, context?: Record<string, unknown>): Promise<void>;
    resumeWithToolResult(toolCallId: string, result: unknown): Promise<void>;
    stop(): Promise<void>;
    dispose(): void;
}
