import { Emitter } from '@/base/common/event';
import type { IDisposable } from '@/base/common/lifecycle';
import type { ConfirmationRequest } from '@/features/ai/tools/types';
import { extractTaskInterrupts, projectMessages } from './message-projection';
import type {
    LangGraphChatRuntimeApi,
    LangGraphChatRuntimeOptions,
    LangGraphChatSnapshot,
    LangGraphRawMessage,
    LangGraphRunsStreamPayload,
    LangGraphStreamEvent,
    LangGraphToolInterrupt,
} from './types';

const STREAM_MODE = ['messages', 'values', 'tasks'];

const EMPTY_SNAPSHOT: LangGraphChatSnapshot = {
    messages: [],
    isStreaming: false,
    isLastMessageStreaming: false,
    error: null,
    threadId: null,
    runId: null,
    interrupt: null,
};

export class LangGraphChatRuntime implements LangGraphChatRuntimeApi {
    private readonly client: LangGraphChatRuntimeOptions['client'];
    private readonly toolExecutor: LangGraphChatRuntimeOptions['toolExecutor'];
    private readonly assistantId: string;
    private readonly _onDidChange = new Emitter<void>();
    private snapshot: LangGraphChatSnapshot = { ...EMPTY_SNAPSHOT };
    private handledToolCallIds = new Set<string>();
    private currentAbortController: AbortController | null = null;

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
        this.handledToolCallIds.clear();
        this.updateSnapshot({
            ...EMPTY_SNAPSHOT,
            threadId,
        });

        const state = await this.client.threads.getState?.(threadId);
        const messages = state?.values?.messages;
        if (Array.isArray(messages)) {
            this.setMessages(messages);
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
        this.currentAbortController?.abort();
        if (this.snapshot.threadId && this.snapshot.runId) {
            await this.client.runs.cancel(this.snapshot.threadId, this.snapshot.runId, false);
        }
        this.updateSnapshot({ isStreaming: false, interrupt: null });
    }

    dispose(): void {
        this.currentAbortController?.abort();
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
        this.updateSnapshot({ isStreaming: true, error: null });

        try {
            const stream = this.client.runs.stream(threadId, this.assistantId, {
                ...payload,
                streamMode: STREAM_MODE,
                signal: abortController.signal,
            });

            for await (const event of stream) {
                await this.handleStreamEvent(event);
            }
        } catch (error) {
            if (!abortController.signal.aborted) {
                this.updateSnapshot({
                    error: error instanceof Error ? error.message : String(error),
                });
            }
        } finally {
            if (this.currentAbortController === abortController) {
                this.currentAbortController = null;
            }
            this.updateSnapshot({ isStreaming: false, interrupt: null });
        }
    }

    private async handleStreamEvent(event: LangGraphStreamEvent): Promise<void> {
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
        this.updateSnapshot({ interrupt });

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

    private updateSnapshot(patch: Partial<LangGraphChatSnapshot>): void {
        const nextMessages = patch.messages ?? this.snapshot.messages;
        const nextIsStreaming = patch.isStreaming ?? this.snapshot.isStreaming;
        this.snapshot = {
            ...this.snapshot,
            ...patch,
            messages: nextMessages,
            isLastMessageStreaming:
                nextIsStreaming &&
                nextMessages.length > 0 &&
                nextMessages[nextMessages.length - 1].role === 'ai',
        };
        this._onDidChange.fire();
    }
}

function isRawMessage(value: unknown): value is LangGraphRawMessage {
    return Boolean(value && typeof value === 'object' && ('type' in value || 'role' in value));
}
