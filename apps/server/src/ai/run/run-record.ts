/**
 * RunRecord — 单次 Run 的完整状态
 *
 * 持有：
 * - run ID、thread ID
 * - 运行状态（pending → running → completed/interrupted/failed/cancelled）
 * - RunContext（创建时的上下文快照）
 * - RunExecutionSnapshot（执行输入的显式、类型化快照）
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

import { Logger } from '@nestjs/common';
import type { TokenUsage } from '../types/ai.types';
import { RunStatus } from '../types/run.types';
import type { RunContext } from './run-context';

/**
 * 执行输入快照 — 显式、类型化、可测试
 */
export interface RunExecutionSnapshot {
    readonly content: string;
    readonly requestContext?: Readonly<Record<string, unknown>>;
}

export interface RunRecordOpts {
    id: string;
    threadId: string;
    runContext: RunContext;
    snapshot: RunExecutionSnapshot;
    /** seq 起点（resume 时从 Run.lastSeq 恢复，默认 0） */
    lastSeq?: number;
}

export class RunRecord {
    private readonly logger = new Logger(RunRecord.name);

    readonly id: string;
    readonly threadId: string;
    readonly runContext: RunContext;
    readonly snapshot: RunExecutionSnapshot;
    readonly abortController = new AbortController();
    readonly abortSignal: AbortSignal;

    private _status: RunStatus = RunStatus.Pending;
    private _tokenUsage: TokenUsage = {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
    };

    private seq: number;

    /** SSE response writer（由 controller 设置） */
    private sseWriter?: (event: { event: string; data: unknown }) => void;

    /**
     * 待恢复的 resume payload（由 resumeFromCommand 注入）
     * executeRunProtocol 检测到此字段时，用 `new Command({resume})` 作为 graph 输入
     */
    private _pendingResume?: unknown;

    constructor(opts: RunRecordOpts) {
        this.id = opts.id;
        this.threadId = opts.threadId;
        this.runContext = opts.runContext;
        this.snapshot = opts.snapshot;
        this.abortSignal = this.abortController.signal;
        this.seq = opts.lastSeq ?? 0;
    }

    get status(): RunStatus {
        return this._status;
    }

    get tokenUsage(): TokenUsage {
        return { ...this._tokenUsage };
    }

    /** 是否通过 command.resume 恢复 */
    get isResume(): boolean {
        return this._pendingResume !== undefined;
    }

    /**
     * 设置 resume payload（controller 调用 resumeFromCommand 时注入）
     */
    setResumePayload(payload: unknown): void {
        this._pendingResume = payload;
    }

    /** 获取 resume payload */
    get pendingResume(): unknown {
        return this._pendingResume;
    }

    /** 当前下一次将分配的 seq（next-to-allocate）。emitEvent 使用后置自增写入此值后再 +1。 */
    get currentSeq(): number {
        return this.seq;
    }

    /** 重置下一次将分配的 seq（resume 路径从 RunRow.lastSeq 锚定）。 */
    setLastSeq(seq: number): void {
        this.seq = seq;
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
     *
     * EventStore 通过 runContext.eventStore 统一来源
     */
    async emitEvent(event: { event: string; data: unknown }) {
        // 写 SSE
        if (this.sseWriter) {
            this.sseWriter(event);
        }

        // 写 EventStore（通过 runContext.eventStore 统一来源）
        try {
            await this.runContext.eventStore.append(this.id, this.threadId, {
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
     * 仅写 SSE，不持久化到 EventStore。
     * 用于 messages/partial 等高频流式事件（量大，不应写入 DB）。
     */
    emitSSEOnly(event: { event: string; data: unknown }) {
        if (this.sseWriter) {
            this.sseWriter(event);
        }
        // 不写 EventStore — 不调用 this.runContext.eventStore.append
    }

    /**
     * 完成运行，返回 token 用量快照
     */
    finalize(): TokenUsage {
        return this.tokenUsage;
    }
}
