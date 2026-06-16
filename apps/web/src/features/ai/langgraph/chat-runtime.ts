import { Emitter } from '@/base/common/event';
import type { IDisposable } from '@/base/common/lifecycle';
import type { ConfirmationRequest } from '@/features/ai/tools/types';
import { extractTaskInterrupts, projectMessages } from './message-projection';
import type {
    ConnectionPhase,
    LangGraphChatRuntimeApi,
    LangGraphChatRuntimeOptions,
    LangGraphChatSnapshot,
    LangGraphRawMessage,
    LangGraphRunsStreamPayload,
    LangGraphStreamEvent,
    LangGraphToolInterrupt,
} from './types';

const STREAM_MODE = ['messages', 'values', 'tasks'];

const RECONNECT_BASE_DELAY_MS = 10;
const RECONNECT_MAX_DELAY_MS = 5000;
const RECONNECT_MAX_ATTEMPTS = 5;

const EMPTY_SNAPSHOT: LangGraphChatSnapshot = {
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

type LangGraphChatSnapshotPatch = Omit<
    Partial<LangGraphChatSnapshot>,
    'isStreaming' | 'isLastMessageStreaming'
>;

export class LangGraphChatRuntime implements LangGraphChatRuntimeApi {
    private readonly client: LangGraphChatRuntimeOptions['client'];
    private readonly toolExecutor: LangGraphChatRuntimeOptions['toolExecutor'];
    private readonly assistantId: string;
    private readonly _onDidChange = new Emitter<void>();
    private snapshot: LangGraphChatSnapshot = { ...EMPTY_SNAPSHOT };
    private handledToolCallIds = new Set<string>();
    private currentAbortController: AbortController | null = null;
    /**
     * 单调递增的"连接代际"。每次 openThread / dispose 都 bump。
     * 在途的 joinStream / autoReconnect 持有发起时的 generation,
     * 任何 phase/messages 写入前先校验 generation 仍是 current,否则 no-op。
     * 防止旧 thread 的重连循环或 SSE event 覆盖新 thread 的状态。
     */
    private connectionGeneration = 0;

    constructor(options: LangGraphChatRuntimeOptions) {
        this.client = options.client;
        this.toolExecutor = options.toolExecutor;
        this.assistantId = options.assistantId ?? 'default';
    }

    get onConfirmationRequest():
        | ((listener: (event: ConfirmationRequest) => void) => IDisposable)
        | undefined {
        return this.toolExecutor.onConfirmationRequest;
    }

    getSnapshot(): LangGraphChatSnapshot {
        return this.snapshot;
    }

    subscribe(listener: () => void): IDisposable {
        return this._onDidChange.event(listener);
    }

    async openThread(threadId: string): Promise<void> {
        this.currentAbortController?.abort();
        // bump generation:任何旧 join/reconnect 在 await 后都会 no-op,
        // 不会再写入新 thread 的 phase/messages。
        const generation = ++this.connectionGeneration;
        this.handledToolCallIds.clear();
        this.snapshot = { ...EMPTY_SNAPSHOT };
        this.updateSnapshot({
            threadId,
            connectionPhase: 'loading',
        });

        // [1] 读 checkpoint，渲染历史消息（spec 5.3）
        const state = await this.client.threads.getState?.(threadId);
        if (!this.isCurrentGeneration(generation)) return;
        const messages = state?.values?.messages;
        if (Array.isArray(messages)) {
            this.setMessages(messages);
        }

        // [2] 查活跃 run（status ∈ {running, interrupted}）
        const runs = await this.client.runs.list(threadId);
        if (!this.isCurrentGeneration(generation)) return;
        const active = runs.find(r => r.status === 'running' || r.status === 'interrupted');

        // [3] 有活跃 run → joinStream?since=0 回放+续实时；无 → ready
        if (active) {
            this.updateSnapshot({ runId: active.id });
            try {
                await this.joinActiveStream(threadId, active.id, 0, generation);
            } catch {
                if (!this.isCurrentGeneration(generation)) return;
                await this.autoReconnect(threadId, active.id, generation);
            }
        } else {
            this.setPhase('ready');
        }
    }

    async sendMessage(content: string, context?: Record<string, unknown>): Promise<void> {
        const threadId = await this.ensureThreadId();
        await this.runStream(threadId, {
            input: {
                messages: [
                    {
                        type: 'human',
                        content,
                    },
                ],
            },
            context,
            multitaskStrategy: 'reject',
        });
    }

    async resumeWithToolResult(toolCallId: string, result: unknown): Promise<void> {
        if (!this.snapshot.threadId) {
            throw new Error('Cannot resume without an active LangGraph thread');
        }

        await this.runStream(this.snapshot.threadId, {
            input: null,
            command: {
                resume: {
                    tool_call_id: toolCallId,
                    tool_result: result,
                },
            },
        });
    }

    async stop(): Promise<void> {
        // spec 3.7：只调 cancel，不 abort 本地 fetch、不立即清 isStreaming。
        // 后端 cancel → abort → 写 end{finish_reason:'cancelled'} 并关 SSE，
        // runStream 的 for await 收到流结束 → finally 落定 isStreaming=false。
        // 本地 abort 仅保留 unmount（dispose）场景。
        if (this.snapshot.threadId && this.snapshot.runId) {
            await this.client.runs.cancel(this.snapshot.threadId, this.snapshot.runId, false);
        }
    }

    dispose(): void {
        this.currentAbortController?.abort();
        // bump generation:在途 join/reconnect 在下一个 await 后 no-op,不再写状态。
        this.connectionGeneration += 1;
        if ('dispose' in this.toolExecutor && typeof this.toolExecutor.dispose === 'function') {
            this.toolExecutor.dispose();
        }
        this._onDidChange.dispose();
        this.handledToolCallIds.clear();
    }

    private async ensureThreadId(): Promise<string> {
        if (this.snapshot.threadId) {
            return this.snapshot.threadId;
        }

        const thread = await this.client.threads.create();
        this.updateSnapshot({ threadId: thread.thread_id });
        return thread.thread_id;
    }

    private async runStream(
        threadId: string,
        payload: Omit<LangGraphRunsStreamPayload, 'streamMode' | 'signal'>,
    ): Promise<void> {
        const abortController = new AbortController();
        this.currentAbortController = abortController;
        this.setPhase('streaming');
        this.updateSnapshot({ error: null });

        try {
            const stream = this.client.runs.stream(threadId, this.assistantId, {
                ...payload,
                streamMode: STREAM_MODE,
                signal: abortController.signal,
            });

            for await (const event of stream) {
                await this.handleStreamEvent(event);
            }
            if (this.snapshot.connectionPhase === 'streaming') {
                this.finishRun();
            }
        } catch (error) {
            // 旧 stream 被新流程(openThread/dispose)abort:phase 由新流程主导,
            // 这里不能 finishRun 把 loading 覆盖回 ready。
            if (abortController.signal.aborted) {
                return;
            }
            this.updateSnapshot({
                error: error instanceof Error ? error.message : String(error),
            });
            // dispatch 失败 / stream 错误都必须落 ready 并清 interrupt,
            // 否则 phase=paused + interrupt 残留会让 runtime 永久卡住。
            // resume 已发起的正常路径里,inner runStream 会接管 phase,
            // outer catch 不会触发(无错抛出)。
            this.finishRun();
        } finally {
            if (this.currentAbortController === abortController) {
                this.currentAbortController = null;
            }
        }
    }

    /**
     * 消费 joinStream（openThread 三段式 / 自动重连）。沿用 handleStreamEvent 处理事件 +
     * trackSeq。流结束（无 end 事件，如 run 已终止或 SSE close）→ finishRun 落 ready。
     * 流抛错（网络断）→ 重抛交由调用方（重连逻辑，Task 8）处理。
     *
     * generation 校验:每次 await 前/后检查 connectionGeneration 是否仍 current。
     * 不 match 表示 openThread/dispose 已切走,本次调用必须 no-op,不能写 phase/messages。
     */
    private async joinActiveStream(
        threadId: string,
        runId: string,
        since: number,
        generation: number,
    ): Promise<void> {
        if (!this.isCurrentGeneration(generation)) return;
        this.setPhase('streaming');
        const stream = this.client.runs.joinStream(threadId, runId, since);
        for await (const event of stream) {
            if (!this.isCurrentGeneration(generation)) return;
            await this.handleStreamEvent(event);
        }
        if (!this.isCurrentGeneration(generation)) return;
        if (this.snapshot.connectionPhase === 'streaming') {
            this.finishRun();
        }
    }

    /**
     * 自动重连(spec 5.4):joinStream 抛错(网络断,非用户 stop)→ phase=reconnecting
     * (保留已渲染 messages)→ 指数退避重试 joinStream?since=lastSeq→成功回 streaming;
     * 达上限→ready + error。
     *
     * generation 校验:openThread/dispose 切走后,sleep/重试不再写新 thread 的 phase。
     */
    private async autoReconnect(
        threadId: string,
        runId: string,
        generation: number,
    ): Promise<void> {
        for (let attempt = 0; attempt < RECONNECT_MAX_ATTEMPTS; attempt += 1) {
            if (!this.isCurrentGeneration(generation)) return;
            this.setPhase('reconnecting');
            const delay = Math.min(RECONNECT_BASE_DELAY_MS * 2 ** attempt, RECONNECT_MAX_DELAY_MS);
            await sleep(delay);
            if (!this.isCurrentGeneration(generation)) return;
            try {
                await this.joinActiveStream(threadId, runId, this.snapshot.lastSeq, generation);
                return;
            } catch {
                // 继续退避重试
            }
        }
        if (!this.isCurrentGeneration(generation)) return;
        this.updateSnapshot({
            connectionPhase: 'ready',
            interrupt: null,
            error: '连接断开，可重试',
        });
    }

    /** 校验当前是否仍是发起时的连接代际(未被新 openThread / dispose 取代) */
    private isCurrentGeneration(generation: number): boolean {
        return this.connectionGeneration === generation;
    }

    private async handleStreamEvent(event: LangGraphStreamEvent): Promise<void> {
        this.trackSeq(event.seq);
        switch (event.event) {
            case 'metadata':
                this.handleMetadata(event.data);
                return;
            case 'values':
                this.handleValues(event.data);
                return;
            case 'messages/partial':
            case 'messages/complete':
                this.handleMessageList(event.data);
                return;
            case 'messages':
                this.handleMessagesEvent(event.data);
                return;
            case 'tasks':
                await this.handleTaskEvent(event.data);
                return;
            case 'error':
                this.handleProtocolError(event.data);
                this.finishRun();
                return;
            case 'end':
                this.finishRun();
                return;
            default:
                return;
        }
    }

    private handleMetadata(data: unknown): void {
        if (!data || typeof data !== 'object') {
            return;
        }
        const metadata = data as { run_id?: unknown; thread_id?: unknown };
        this.updateSnapshot({
            runId: typeof metadata.run_id === 'string' ? metadata.run_id : this.snapshot.runId,
            threadId:
                typeof metadata.thread_id === 'string'
                    ? metadata.thread_id
                    : this.snapshot.threadId,
        });
    }

    private handleValues(data: unknown): void {
        if (!data || typeof data !== 'object') {
            return;
        }
        const messages = (data as { messages?: unknown }).messages;
        if (Array.isArray(messages)) {
            this.setMessages(messages as LangGraphRawMessage[]);
        }
    }

    private handleMessageList(data: unknown): void {
        if (Array.isArray(data)) {
            this.setMessages(data as LangGraphRawMessage[]);
        }
    }

    private handleMessagesEvent(data: unknown): void {
        if (Array.isArray(data) && data.length === 2 && isRawMessage(data[0])) {
            this.upsertMessage(data[0]);
        } else {
            this.handleMessageList(data);
        }
    }

    private async handleTaskEvent(data: unknown): Promise<void> {
        for (const interrupt of extractTaskInterrupts(data)) {
            await this.handleToolInterrupt(interrupt);
        }
    }

    private handleProtocolError(data: unknown): void {
        const message =
            data &&
            typeof data === 'object' &&
            typeof (data as { message?: unknown }).message === 'string'
                ? (data as { message: string }).message
                : 'LangGraph stream error';
        this.updateSnapshot({ error: message });
    }

    private async handleToolInterrupt(interrupt: LangGraphToolInterrupt): Promise<void> {
        if (this.handledToolCallIds.has(interrupt.toolCallId)) {
            return;
        }
        this.handledToolCallIds.add(interrupt.toolCallId);
        // spec 5.2：interrupt 期间 phase=paused（标记，保持 auto-dispatch；5.6 派生留 P4）
        this.updateSnapshot({ interrupt, connectionPhase: 'paused' });

        const result = await this.toolExecutor.dispatch(interrupt.toolName, interrupt.input);
        await this.resumeWithToolResult(interrupt.toolCallId, result);
    }

    private setMessages(messages: LangGraphRawMessage[]): void {
        this.updateSnapshot({
            messages: projectMessages(messages),
        });
    }

    private upsertMessage(message: LangGraphRawMessage): void {
        const projected = projectMessages([message])[0];
        if (!projected) {
            return;
        }

        const messages = [...this.snapshot.messages];
        const index = messages.findIndex(item => item.id === projected.id);
        if (index >= 0) {
            messages[index] = projected;
        } else {
            messages.push(projected);
        }
        this.updateSnapshot({ messages });
    }

    private updateSnapshot(patch: LangGraphChatSnapshotPatch): void {
        const nextPhase = patch.connectionPhase ?? this.snapshot.connectionPhase;
        const nextMessages = patch.messages ?? this.snapshot.messages;
        const nextLastSeq = patch.lastSeq ?? this.snapshot.lastSeq;
        const nextIsStreaming = nextPhase === 'streaming' || nextPhase === 'reconnecting';
        this.snapshot = {
            ...this.snapshot,
            ...patch,
            connectionPhase: nextPhase,
            lastSeq: nextLastSeq,
            messages: nextMessages,
            isStreaming: nextIsStreaming,
            isLastMessageStreaming:
                nextIsStreaming &&
                nextMessages.length > 0 &&
                nextMessages[nextMessages.length - 1].role === 'ai',
        };
        this._onDidChange.fire();
    }

    private setPhase(phase: ConnectionPhase): void {
        this.updateSnapshot({ connectionPhase: phase });
    }

    /** 记录入站事件的 seq（单调取大），作为重连 since 锚（spec 5.3/5.4） */
    private trackSeq(seq: number | undefined): void {
        if (seq !== undefined && seq > this.snapshot.lastSeq) {
            this.updateSnapshot({ lastSeq: seq });
        }
    }

    private finishRun(): void {
        this.updateSnapshot({ connectionPhase: 'ready', interrupt: null });
    }
}

function isRawMessage(value: unknown): value is LangGraphRawMessage {
    return Boolean(value && typeof value === 'object' && ('type' in value || 'role' in value));
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}
