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
import { type EventBus, type RunStreamEvent, runChannel } from '../event/event-bus';
import type { TokenUsage } from '../types/ai.types';
import { RunStatus } from '../types/run.types';
import type { RunContext } from './run-context';
import type { RunEventSink } from './run-event-sink';

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

    /** Run 事件流 sink（SSE 推送 / 回放推等）。spec 3.8。 */
    private readonly sinks = new Set<RunEventSink>();

    /**
     * 注册事件 sink（如 SSE Response 推送），返回注销函数。
     */
    registerSink(sink: RunEventSink): () => void {
        this.sinks.add(sink);
        return () => {
            sink.close();
            this.sinks.delete(sink);
        };
    }

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
     * 发射状态边界事件：SSE 即时推 + EventStore 落盘 + EventBus 广播（spec 3.2/3.3）。
     * seq 在入口分配，供三路共用（PG append 与 EventBus publish 同一 seq）。
     * publish 失败不阻塞 SSE/PG（降级 warn，spec 3.3 [2]）。
     */
    async emitEvent(event: { event: string; data: unknown }) {
        const seq = this.seq++;
        const streamEvent: RunStreamEvent = {
            seq,
            eventType: event.event,
            payload: event.data,
        };

        // [1] Sink push（如 SSE 即时推，带 seq 供前端 id: 行重连锚）
        for (const sink of this.sinks) {
            sink.push({ seq, eventType: event.event, payload: event.data });
        }

        // [3] PG 落盘（状态边界）
        try {
            await this.runContext.eventStore.append(this.id, this.threadId, {
                seq,
                eventType: event.event,
                // biome-ignore lint/suspicious/noExplicitAny: LangGraph stream event data is untyped
                eventName: (event.data as any)?.event ?? '',
                payload: event.data as Record<string, unknown>,
            });
        } catch (err) {
            this.logger.warn(`EventStore append failed: ${(err as Error).message}`);
        }

        // [2] EventBus 广播（非 owner 副本续实时，spec 3.3）
        try {
            await this.runContext.eventBus.publish(runChannel(this.id), streamEvent);
        } catch (err) {
            this.logger.warn(`EventBus publish failed: ${(err as Error).message}`);
        }
    }

    /**
     * 发射临时事件（messages token）：SSE 即时推 + EventBus 广播，不落盘（spec 3.2）。
     * 仍分配 seq（供续实时去重）。publish fire-and-forget（高频，不 await），
     * 但 rejection 必须 catch 防 unhandled rejection。
     */
    emitSSEOnly(event: { event: string; data: unknown }) {
        const seq = this.seq++;
        const streamEvent: RunStreamEvent = {
            seq,
            eventType: event.event,
            payload: event.data,
        };

        // [1] Sink push（如 SSE 即时推，带 seq）
        for (const sink of this.sinks) {
            sink.push({ seq, eventType: event.event, payload: event.data });
        }

        // [2] EventBus 广播（不落盘 [3]）
        void this.runContext.eventBus.publish(runChannel(this.id), streamEvent).catch(err => {
            this.logger.warn(`EventBus publish failed: ${(err as Error).message}`);
        });
    }

    /**
     * 完成运行，返回 token 用量快照
     */
    finalize(): TokenUsage {
        return this.tokenUsage;
    }

    /**
     * 订阅 run 的控制 channel（cancel/interrupt 等），返回 unsubscribe。
     * 收到 cancel → this.abort()。收到 interrupt → this.abort()。
     * sourceReplicaId 排重：自己发的信号跳过，避免循环。
     * 注意：Control 事件结构不同于 RunStreamEvent，使用类型转换。
     */
    subscribeControlChannel(eventBus: EventBus, replicaId: string): () => void {
        const channel = `run:${this.id}:control`;
        return eventBus.subscribe(channel, (event: unknown) => {
            const controlEvent = event as { kind?: string; sourceReplicaId?: string };
            if (controlEvent.sourceReplicaId === replicaId) return;
            if (controlEvent.kind === 'cancel' || controlEvent.kind === 'interrupt') {
                this.abort();
            }
        }).unsubscribe;
    }
}
