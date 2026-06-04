/**
 * RunRecord — 单次 Run 的完整状态
 *
 * 持有：
 * - run ID、thread ID
 * - 运行状态（pending → running → completed/interrupted/failed/cancelled）
 * - token 用量累计
 * - abort controller
 * - SSE 事件发射（写入 Response + EventStore）
 *
 * execute() 和 resume() 的实际 graph 调用由 AiChatService 编排，
 * RunRecord 负责：
 * 1. 状态管理
 * 2. 事件发射（emitEvent → SSE + EventStore）
 * 3. token 累计
 * 4. abort 处理
 */

import type { BaseCheckpointSaver } from '@langchain/langgraph-checkpoint';
import { Logger } from '@nestjs/common';
import type { RunEventStore } from '../store/run-event-store';
import type { TokenUsage } from '../types/ai.types';
import { RunStatus } from '../types/run.types';

export interface RunRecordOpts {
    id: string;
    threadId: string;
    eventStore: RunEventStore;
    checkpointer: BaseCheckpointSaver;
}

export class RunRecord {
    private readonly logger = new Logger(RunRecord.name);

    readonly id: string;
    readonly threadId: string;
    readonly abortController = new AbortController();
    readonly abortSignal: AbortSignal;

    private _status: RunStatus = RunStatus.Pending;
    private _tokenUsage: TokenUsage = {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
    };

    private seq = 0;
    private readonly eventStore: RunEventStore;
    private readonly checkpointer: BaseCheckpointSaver;

    /** SSE response writer（由 controller 设置） */
    private sseWriter?: (event: { event: string; data: unknown }) => void;

    constructor(opts: RunRecordOpts) {
        this.id = opts.id;
        this.threadId = opts.threadId;
        this.eventStore = opts.eventStore;
        this.checkpointer = opts.checkpointer;
        this.abortSignal = this.abortController.signal;
    }

    get status(): RunStatus {
        return this._status;
    }

    get tokenUsage(): TokenUsage {
        return { ...this._tokenUsage };
    }

    /**
     * 设置 SSE writer（controller 调用）
     */
    setSseWriter(writer: (event: { event: string; data: unknown }) => void) {
        this.sseWriter = writer;
    }

    /**
     * 更新状态
     */
    setStatus(status: RunStatus) {
        this.logger.log(`Run ${this.id}: ${this._status} → ${status}`);
        this._status = status;
    }

    /**
     * 中止 Run
     */
    abort() {
        this.abortController.abort();
        if (this._status === RunStatus.Running || this._status === RunStatus.Pending) {
            this._status = RunStatus.Cancelled;
        }
    }

    /**
     * 累加 token 用量
     */
    accumulateTokens(usage: TokenUsage) {
        this._tokenUsage.promptTokens += usage.promptTokens;
        this._tokenUsage.completionTokens += usage.completionTokens;
        this._tokenUsage.totalTokens += usage.totalTokens;
    }

    /**
     * 发射事件：同时写入 SSE response + EventStore
     */
    async emitEvent(event: { event: string; data: unknown }) {
        // 写 SSE
        if (this.sseWriter) {
            this.sseWriter(event);
        }

        // 写 EventStore
        try {
            await this.eventStore.append(this.id, this.threadId, {
                seq: this.seq++,
                eventType: event.event,
                // biome-ignore lint/suspicious/noExplicitAny: LangGraph stream event data is untyped
                eventName: (event.data as any)?.event ?? '',
                payload: event.data as Record<string, unknown>,
            });
        } catch (err) {
            // EventStore 写入失败不应阻塞 SSE 流
            this.logger.warn(`EventStore append failed: ${(err as Error).message}`);
        }
    }

    /**
     * 完成运行，返回 token 用量快照
     */
    finalize(): TokenUsage {
        return this.tokenUsage;
    }
}
