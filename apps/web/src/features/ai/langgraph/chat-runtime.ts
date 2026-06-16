import { Emitter } from '@/base/common/event';
import type { IDisposable } from '@/base/common/lifecycle';
import type { ConfirmationRequest } from '@/features/ai/tools/types';
import { extractTaskInterrupts, projectMessages } from './message-projection';
import type {
    ConnectionPhase,
    LangGraphChatRuntimeApi,
    LangGraphChatRuntimeOptions,
    LangGraphChatSnapshot,
    LangGraphConnectionAtom,
    LangGraphErrorAtom,
    LangGraphInterruptStateAtom,
    LangGraphMessagesAtom,
    LangGraphRawMessage,
    LangGraphRunStateAtom,
    LangGraphRunsStreamPayload,
    LangGraphStreamEvent,
    LangGraphThreadMetaAtom,
    LangGraphToolInterrupt,
} from './types';

const STREAM_MODE = ['messages', 'values', 'tasks'];

const RECONNECT_BASE_DELAY_MS = 10;
const RECONNECT_MAX_DELAY_MS = 5000;
const RECONNECT_MAX_ATTEMPTS = 5;

export class LangGraphChatRuntime implements LangGraphChatRuntimeApi {
    private readonly client: LangGraphChatRuntimeOptions['client'];
    private readonly toolExecutor: LangGraphChatRuntimeOptions['toolExecutor'];
    private readonly assistantId: string;

    /** spec 5.5：6 个独立 Emitter，精确订阅 */
    private readonly messagesEmitter = new Emitter<LangGraphMessagesAtom>();
    private readonly connectionEmitter = new Emitter<LangGraphConnectionAtom>();
    private readonly errorEmitter = new Emitter<LangGraphErrorAtom>();
    private readonly threadMetaEmitter = new Emitter<LangGraphThreadMetaAtom>();
    private readonly runStateEmitter = new Emitter<LangGraphRunStateAtom>();
    private readonly interruptStateEmitter = new Emitter<LangGraphInterruptStateAtom>();

    /** 内部状态存储（不暴露，仅 Emitter 推送最新值） */
    private messagesState: LangGraphMessagesAtom = { messages: [], lastSeq: 0 };
    private connectionState: LangGraphConnectionAtom = { phase: 'idle' };
    private errorState: LangGraphErrorAtom = { error: null };
    private threadMetaState: LangGraphThreadMetaAtom = { threadId: null };
    private runStateState: LangGraphRunStateAtom = { runId: null };
    private interruptState: LangGraphInterruptStateAtom = { interrupt: null };

    /** 缓存的 snapshot 引用，状态不变时返回相同对象 */
    private cachedSnapshot: LangGraphChatSnapshot | null = null;
    /**
     * 已处理的 tool_call_id 集合（性能优化，避免重复 dispatch）。
     * 注意：这是纯内存优化，不影响外部状态，仅用于防止同一 stream 中
     * 重复 tasks 事件触发多次 dispatch。真正的持久化去重应通过
     * toolStatus='completed' 的消息投影实现。
     */
    private readonly handledToolCallIds = new Set<string>();
    private currentAbortController: AbortController | null = null;
    /**
     * 控制 openThread 三段式（list/getState/joinStream）+ autoReconnect 的 AbortController。
     * openThread 入口、sendMessage/resume 入口、dispose 都会 abort 它，确保旧 thread 的
     * background reconnect 不会以旧 run 覆盖新 run 状态。
     */
    private currentJoinAbortController: AbortController | null = null;
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

    /**
     * 向后兼容：由 6 atom 实时拼接
     */
    getSnapshot(): LangGraphChatSnapshot {
        if (!this.cachedSnapshot) {
            const isStreaming =
                this.connectionState.phase === 'streaming' ||
                this.connectionState.phase === 'reconnecting';
            this.cachedSnapshot = {
                messages: this.messagesState.messages,
                lastSeq: this.messagesState.lastSeq,
                connectionPhase: this.connectionState.phase,
                error: this.errorState.error,
                threadId: this.threadMetaState.threadId,
                runId: this.runStateState.runId,
                interrupt: this.interruptState.interrupt,
                isStreaming,
                isLastMessageStreaming:
                    isStreaming &&
                    this.messagesState.messages.length > 0 &&
                    this.messagesState.messages[this.messagesState.messages.length - 1].role ===
                        'ai',
            };
        }
        return this.cachedSnapshot;
    }

    /** 旧版全局订阅（保留向后兼容，任意 atom 变化都会触发） */
    subscribe(listener: () => void): IDisposable {
        const d1 = this.messagesEmitter.event(listener);
        const d2 = this.connectionEmitter.event(listener);
        const d3 = this.errorEmitter.event(listener);
        const d4 = this.threadMetaEmitter.event(listener);
        const d5 = this.runStateEmitter.event(listener);
        const d6 = this.interruptStateEmitter.event(listener);
        return {
            dispose: () => {
                d1.dispose();
                d2.dispose();
                d3.dispose();
                d4.dispose();
                d5.dispose();
                d6.dispose();
            },
        };
    }

    /** spec 5.5：per-atom 精确订阅 */
    subscribeMessages(listener: (state: LangGraphMessagesAtom) => void): IDisposable {
        return this.messagesEmitter.event(listener);
    }

    subscribeConnection(listener: (state: LangGraphConnectionAtom) => void): IDisposable {
        return this.connectionEmitter.event(listener);
    }

    subscribeError(listener: (state: LangGraphErrorAtom) => void): IDisposable {
        return this.errorEmitter.event(listener);
    }

    subscribeThreadMeta(listener: (state: LangGraphThreadMetaAtom) => void): IDisposable {
        return this.threadMetaEmitter.event(listener);
    }

    subscribeRunState(listener: (state: LangGraphRunStateAtom) => void): IDisposable {
        return this.runStateEmitter.event(listener);
    }

    subscribeInterruptState(listener: (state: LangGraphInterruptStateAtom) => void): IDisposable {
        return this.interruptStateEmitter.event(listener);
    }

    async openThread(threadId: string): Promise<void> {
        this.currentAbortController?.abort();
        this.currentJoinAbortController?.abort();
        // bump generation:任何旧 join/reconnect 在 await 后都会 no-op,
        // 不会再写入新 thread 的 phase/messages。
        const generation = ++this.connectionGeneration;
        const joinAbortController = new AbortController();
        this.currentJoinAbortController = joinAbortController;
        this.resetAllAtoms();
        this.setThreadId(threadId);
        this.setPhase('loading');

        try {
            // [1] 读 checkpoint，渲染历史消息（spec 5.3）
            const state = await this.client.threads.getState?.(threadId);
            if (!this.isCurrentGeneration(generation)) return;
            const messages = state?.values?.messages;
            if (Array.isArray(messages)) {
                this.setMessages(messages);
            }

            // [2] 查活跃 run（status ∈ {running, interrupted}）
            const runs = await this.client.runs.list(threadId, joinAbortController.signal);
            if (!this.isCurrentGeneration(generation)) return;
            const active = runs.find(r => r.status === 'running' || r.status === 'interrupted');

            // [3] 有活跃 run → joinStream?since=0 回放+续实时；无 → ready
            if (active) {
                this.setRunId(active.id);
                try {
                    await this.joinActiveStream(
                        threadId,
                        active.id,
                        0,
                        generation,
                        joinAbortController.signal,
                    );
                } catch {
                    if (!this.isCurrentGeneration(generation)) return;
                    await this.autoReconnect(
                        threadId,
                        active.id,
                        generation,
                        joinAbortController.signal,
                    );
                }
            } else {
                this.setPhase('ready');
            }
        } catch (error) {
            // getState/list/join 任意一步失败：避免 UI 卡 loading；
            // 仅在仍是当前 generation 时落 ready+error，否则交给新 openThread 主导。
            if (!this.isCurrentGeneration(generation)) return;
            this.setPhase('ready');
            this.setInterrupt(null);
            this.setError(error instanceof Error ? error.message : String(error));
            return;
        } finally {
            // 若仍是本 controller（未被 sendMessage/openThread/dispose 接管），保留以便后续 dispose abort。
            // 但若 phase 已落 ready 且 join 完成，长连接已结束，可清理避免泄漏。
            // 简化：保持引用（abort 是幂等的，下一次入口会 abort+替换）。
        }
    }

    async sendMessage(content: string, context?: Record<string, unknown>): Promise<void> {
        const threadId = await this.ensureThreadId();
        // bump generation + abort 任何 background autoReconnect/joinStream，
        // 防止旧 reconnect 用旧 run 覆盖即将开始的新 run snapshot。
        this.connectionGeneration += 1;
        this.currentJoinAbortController?.abort();
        this.currentJoinAbortController = null;
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
        if (!this.threadMetaState.threadId) {
            throw new Error('Cannot resume without an active LangGraph thread');
        }

        // bump generation + abort:同 sendMessage,防止 background reconnect 干扰 resume run。
        this.connectionGeneration += 1;
        this.currentJoinAbortController?.abort();
        this.currentJoinAbortController = null;

        await this.runStream(this.threadMetaState.threadId, {
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
        if (this.threadMetaState.threadId && this.runStateState.runId) {
            await this.client.runs.cancel(
                this.threadMetaState.threadId,
                this.runStateState.runId,
                false,
            );
        }
    }

    dispose(): void {
        this.currentAbortController?.abort();
        this.currentJoinAbortController?.abort();
        this.currentJoinAbortController = null;
        // bump generation:在途 join/reconnect 在下一个 await 后 no-op,不再写状态。
        this.connectionGeneration += 1;
        if ('dispose' in this.toolExecutor && typeof this.toolExecutor.dispose === 'function') {
            this.toolExecutor.dispose();
        }
    }

    private async ensureThreadId(): Promise<string> {
        if (this.threadMetaState.threadId) {
            return this.threadMetaState.threadId;
        }

        const thread = await this.client.threads.create();
        this.setThreadId(thread.thread_id);
        return thread.thread_id;
    }

    private async runStream(
        threadId: string,
        payload: Omit<LangGraphRunsStreamPayload, 'streamMode' | 'signal'>,
    ): Promise<void> {
        const abortController = new AbortController();
        this.currentAbortController = abortController;
        this.setPhase('streaming');
        this.setError(null);

        try {
            const stream = this.client.runs.stream(threadId, this.assistantId, {
                ...payload,
                streamMode: STREAM_MODE,
                signal: abortController.signal,
            });

            for await (const event of stream) {
                await this.handleStreamEvent(event);
            }
            if (this.connectionState.phase === 'streaming') {
                this.finishRun();
            }
        } catch (error) {
            // 旧 stream 被新流程(openThread/dispose)abort:phase 由新流程主导,
            // 这里不能 finishRun 把 loading 覆盖回 ready。
            if (abortController.signal.aborted) {
                return;
            }
            this.setError(error instanceof Error ? error.message : String(error));
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
        signal?: AbortSignal,
    ): Promise<void> {
        if (!this.isCurrentGeneration(generation)) return;
        this.setPhase('streaming');
        const stream = this.client.runs.joinStream(threadId, runId, since, signal);
        for await (const event of stream) {
            if (!this.isCurrentGeneration(generation)) return;
            await this.handleStreamEvent(event);
        }
        if (!this.isCurrentGeneration(generation)) return;
        if (this.connectionState.phase === 'streaming') {
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
        signal?: AbortSignal,
    ): Promise<void> {
        for (let attempt = 0; attempt < RECONNECT_MAX_ATTEMPTS; attempt += 1) {
            if (!this.isCurrentGeneration(generation)) return;
            if (signal?.aborted) return;
            this.setPhase('reconnecting');
            const delay = Math.min(RECONNECT_BASE_DELAY_MS * 2 ** attempt, RECONNECT_MAX_DELAY_MS);
            await sleep(delay);
            if (!this.isCurrentGeneration(generation)) return;
            if (signal?.aborted) return;
            try {
                await this.joinActiveStream(
                    threadId,
                    runId,
                    this.messagesState.lastSeq,
                    generation,
                    signal,
                );
                return;
            } catch {
                // 继续退避重试
            }
        }
        if (!this.isCurrentGeneration(generation)) return;
        if (signal?.aborted) return;
        this.setPhase('ready');
        this.setInterrupt(null);
        this.setError('连接断开，可重试');
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
        if (typeof metadata.run_id === 'string') {
            this.setRunId(metadata.run_id);
        }
        if (typeof metadata.thread_id === 'string') {
            this.setThreadId(metadata.thread_id);
        }
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
        this.setError(message);
    }

    private async handleToolInterrupt(interrupt: LangGraphToolInterrupt): Promise<void> {
        // spec 5.6: 已处理过的工具不再重复 dispatch
        // 使用内存 Set 作为性能优化，避免同一 stream 中重复 tasks 事件
        if (this.handledToolCallIds.has(interrupt.toolCallId)) {
            return;
        }
        this.handledToolCallIds.add(interrupt.toolCallId);

        this.setInterrupt(interrupt);
        this.setPhase('paused');

        const result = await this.toolExecutor.dispatch(interrupt.toolName, interrupt.input);
        await this.resumeWithToolResult(interrupt.toolCallId, result);
    }

    // ========== 原子更新方法（spec 5.5） ==========

    private setMessages(messages: LangGraphRawMessage[]): void {
        const projected = projectMessages(messages);
        this.messagesState = { ...this.messagesState, messages: projected };
        this.cachedSnapshot = null;
        this.messagesEmitter.fire(this.messagesState);
    }

    private upsertMessage(message: LangGraphRawMessage): void {
        const projected = projectMessages([message])[0];
        if (!projected) {
            return;
        }

        const messages = [...this.messagesState.messages];
        const index = messages.findIndex(item => item.id === projected.id);
        if (index >= 0) {
            messages[index] = projected;
        } else {
            messages.push(projected);
        }
        this.messagesState = { ...this.messagesState, messages };
        this.cachedSnapshot = null;
        this.messagesEmitter.fire(this.messagesState);
    }

    private setLastSeq(seq: number): void {
        if (seq <= this.messagesState.lastSeq) return;
        this.messagesState = { ...this.messagesState, lastSeq: seq };
        this.cachedSnapshot = null;
        this.messagesEmitter.fire(this.messagesState);
    }

    private setPhase(phase: ConnectionPhase): void {
        this.connectionState = { phase };
        this.cachedSnapshot = null;
        this.connectionEmitter.fire(this.connectionState);
    }

    private setError(error: string | null): void {
        this.errorState = { error };
        this.cachedSnapshot = null;
        this.errorEmitter.fire(this.errorState);
    }

    private setThreadId(threadId: string | null): void {
        this.threadMetaState = { threadId };
        this.cachedSnapshot = null;
        this.threadMetaEmitter.fire(this.threadMetaState);
    }

    private setRunId(runId: string | null): void {
        this.runStateState = { runId };
        this.cachedSnapshot = null;
        this.runStateEmitter.fire(this.runStateState);
    }

    private setInterrupt(interrupt: LangGraphToolInterrupt | null): void {
        this.interruptState = { interrupt };
        this.cachedSnapshot = null;
        this.interruptStateEmitter.fire(this.interruptState);
    }

    /** 重置所有 atom 为初始状态（openThread 入口用） */
    private resetAllAtoms(): void {
        this.messagesState = { messages: [], lastSeq: 0 };
        this.connectionState = { phase: 'idle' };
        this.errorState = { error: null };
        this.threadMetaState = { threadId: null };
        this.runStateState = { runId: null };
        this.interruptState = { interrupt: null };
        this.handledToolCallIds.clear();
        this.cachedSnapshot = null;
        // 所有 emitter fire 确保订阅者收到初始状态
        this.messagesEmitter.fire(this.messagesState);
        this.connectionEmitter.fire(this.connectionState);
        this.errorEmitter.fire(this.errorState);
        this.threadMetaEmitter.fire(this.threadMetaState);
        this.runStateEmitter.fire(this.runStateState);
        this.interruptStateEmitter.fire(this.interruptState);
    }

    /** 记录入站事件的 seq（单调取大），作为重连 since 锚（spec 5.3/5.4） */
    private trackSeq(seq: number | undefined): void {
        if (seq !== undefined) {
            this.setLastSeq(seq);
        }
    }

    private finishRun(): void {
        this.setPhase('ready');
        this.setInterrupt(null);
    }
}

function isRawMessage(value: unknown): value is LangGraphRawMessage {
    return Boolean(value && typeof value === 'object' && ('type' in value || 'role' in value));
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}
