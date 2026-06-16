import type { Event, IDisposable } from '@/base/common/event';
import type { ConfirmationRequest } from '@/features/ai/tools/types';

/** spec 5.2 连接态状态机六态 */
export type ConnectionPhase =
    | 'idle'
    | 'loading'
    | 'ready'
    | 'streaming'
    | 'paused'
    | 'reconnecting';

/**
 * spec 5.5：6 个独立 atom，每个有自己的 Emitter
 */
export interface LangGraphMessagesAtom {
    messages: LangGraphChatMessage[];
    lastSeq: number;
}

export interface LangGraphConnectionAtom {
    phase: ConnectionPhase;
}

export interface LangGraphErrorAtom {
    error: string | null;
}

export interface LangGraphThreadMetaAtom {
    threadId: string | null;
}

export interface LangGraphRunStateAtom {
    runId: string | null;
}

export interface LangGraphInterruptStateAtom {
    interrupt: LangGraphToolInterrupt | null;
}

/** 派生 selector 结果（供 hook 使用） */
export interface LangGraphDerivedState {
    isStreaming: boolean; // phase === 'streaming' || 'reconnecting'
    isLastMessageStreaming: boolean;
}

/** runs.list 返回的 run 摘要(后端 RunDto 子集,前端只关心 id + status) */
export interface LangGraphRunSummary {
    id: string;
    status: string;
}

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
    /** spec 5.6: 工具调用状态，由 additional_kwargs.tool_status 派生 */
    toolStatus?: 'pending' | 'completed' | 'rejected';
    /** 工具名称（用于 ToolCallCard 显示） */
    toolName?: string;
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
    /** spec 5.2 连接态 */
    connectionPhase: ConnectionPhase;
    /** 最近一次确认的 seq,重连 since=lastSeq 锚(spec 5.3/5.4) */
    lastSeq: number;
}

export interface LangGraphStreamEvent {
    id?: string;
    event: string;
    data: unknown;
    /** per-run 单调递增序号,重连去重锚(spec 3.5,后端 SSE id: 行透传) */
    seq?: number;
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
        /** GET /api/threads/:tid/runs/:rid/stream?since —— 回放 + 续实时(spec 3.5) */
        joinStream(
            threadId: string,
            runId: string,
            since?: number,
            signal?: AbortSignal,
        ): AsyncIterable<LangGraphStreamEvent>;
        /** GET /api/threads/:tid/runs —— 列 run(查活跃 run,spec 5.3) */
        list(threadId: string, signal?: AbortSignal): Promise<LangGraphRunSummary[]>;
        cancel(
            threadId: string,
            runId: string,
            wait?: boolean,
            action?: string,
            signal?: AbortSignal,
        ): Promise<void>;
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
    /** 旧版全局订阅（保留向后兼容） */
    subscribe(listener: () => void): IDisposable;
    /** spec 5.5：per-atom 精确订阅 */
    subscribeMessages(listener: (state: LangGraphMessagesAtom) => void): IDisposable;
    subscribeConnection(listener: (state: LangGraphConnectionAtom) => void): IDisposable;
    subscribeError(listener: (state: LangGraphErrorAtom) => void): IDisposable;
    subscribeThreadMeta(listener: (state: LangGraphThreadMetaAtom) => void): IDisposable;
    subscribeRunState(listener: (state: LangGraphRunStateAtom) => void): IDisposable;
    subscribeInterruptState(listener: (state: LangGraphInterruptStateAtom) => void): IDisposable;
    openThread(threadId: string): Promise<void>;
    sendMessage(content: string, context?: Record<string, unknown>): Promise<void>;
    resumeWithToolResult(toolCallId: string, result: unknown): Promise<void>;
    stop(): Promise<void>;
    dispose(): void;
}
