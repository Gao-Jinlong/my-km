import { Injectable, NotFoundException } from '@nestjs/common';
import {
    EventBus,
    type EventBusSubscription,
    type RunStreamEvent,
    runChannel,
} from '../event/event-bus';
import { RunEventStore } from '../store/run-event-store';
import type { RunRow } from './lease.types';
import type { RunEventSink } from './run-event-sink';
import { RunStateRepository } from './run-state.repository';

/** 终态：纯回放，不续实时 */
const TERMINAL_STATUSES = ['completed', 'failed', 'cancelled'];

/** RunEvent（prisma）→ RunStreamEvent（EventBus/SSE 载荷） */
function toRunStreamEvent(e: { seq: number; eventType: string; payload: unknown }): RunStreamEvent {
    return { seq: e.seq, eventType: e.eventType, payload: e.payload };
}

/**
 * JoinStreamService — joinStream 编排（spec 3.5）。
 *
 * 读 Run 行判状态：terminal（completed/failed/cancelled）纯回放 PG；
 * running/interrupted 先 subscribe EventBus（续实时）再回放 PG，按 seq 去重衔接。
 * 终态（end/error）或客户端断开时关闭 sink。
 *
 * 返回 cleanup 函数：调用后 unsubscribe + close（幂等）。controller 必须在
 * res.on('close') 调用，否则 interrupted（无 end）连接的 subscription 泄漏。
 *
 * 实现规格：spec 第 3.5 节（joinStream 五步）+ 4.2 节（interrupted 无 end）。
 */
@Injectable()
export class JoinStreamService {
    constructor(
        private readonly eventBus: EventBus,
        private readonly runStateRepo: RunStateRepository,
        private readonly eventStore: RunEventStore,
    ) {}

    /**
     * 查 Run 行，不存在抛 NotFoundException。
     * 供 controller 在 flush SSE headers 前判 404（spec 3.5 Step 1）。
     */
    async lookupRun(runId: string): Promise<RunRow> {
        const run = await this.runStateRepo.findById(runId);
        if (!run) {
            throw new NotFoundException(`Run not found: ${runId}`);
        }
        return run;
    }

    async joinStream(runId: string, since: number, sink: RunEventSink): Promise<() => void> {
        const run = await this.lookupRun(runId);

        const isTerminal = TERMINAL_STATUSES.includes(run.status);

        // since 语义（spec 3.5 + controller 默认）：
        //   - since=0：从头回放（包含 seq=0 metadata）。前端首次 openThread join 用 0。
        //   - since>0：reconnect lastSeq，回放 seq > since（即客户端尚未确认的事件）。
        // seq 去重游标：回放与实时回调共用，event.seq <= lastSeq 丢弃。
        const fromStart = since === 0;
        const shouldReplay = (seq: number) => (fromStart ? seq >= 0 : seq > since);
        let lastSeq = fromStart ? -1 : since;
        let closed = false;
        let subscription: EventBusSubscription | null = null;

        const close = () => {
            if (closed) return;
            closed = true;
            subscription?.unsubscribe();
            sink.close();
        };

        // running/interrupted：先 subscribe（防漏），回调按 seq 去重 + push + 终态 close
        if (!isTerminal) {
            subscription = this.eventBus.subscribe(runChannel(runId), event => {
                if (closed || event.seq <= lastSeq) return;
                lastSeq = event.seq;
                sink.push(event);
                if (event.eventType === 'end' || event.eventType === 'error') {
                    close();
                }
            });
        }

        // 回放 PG（先 subscribe 再回放，spec 3.5 Step 3）。
        // since=0 包含 seq=0，否则 seq>since；再用 lastSeq 与实时回调去重。
        const events = (await this.eventStore.replay(runId)).filter(e => shouldReplay(e.seq));
        for (const e of events) {
            if (closed) break;
            if (e.seq <= lastSeq) continue; // 实时回调已 push
            lastSeq = e.seq;
            sink.push(toRunStreamEvent(e));
            if (e.eventType === 'end' || e.eventType === 'error') {
                close();
                break;
            }
        }

        // terminal：回放完必 close（无续实时）；running/interrupted：若回放含终态已 close，否则持续续实时
        if (isTerminal) {
            close();
        }

        return close; // cleanup（幂等）
    }
}
