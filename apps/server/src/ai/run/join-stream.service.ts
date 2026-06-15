import { Injectable, NotFoundException } from '@nestjs/common';
import {
    EventBus,
    type EventBusSubscription,
    type RunStreamEvent,
    runChannel,
} from '../event/event-bus';
import type { RunEventStore } from '../store/run-event-store';
import type { RunEventSink } from './run-event-sink';
import type { RunStateRepository } from './run-state.repository';

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
 * Task 1 只实现 terminal 分支；running/interrupted 在后续 task 实现。
 */
@Injectable()
export class JoinStreamService {
    constructor(
        private readonly eventBus: EventBus,
        private readonly runStateRepo: RunStateRepository,
        private readonly eventStore: RunEventStore,
    ) {}

    async joinStream(runId: string, since: number, sink: RunEventSink): Promise<() => void> {
        const run = await this.runStateRepo.findById(runId);
        if (!run) {
            throw new NotFoundException(`Run not found: ${runId}`);
        }

        const isTerminal = TERMINAL_STATUSES.includes(run.status);

        // seq 去重游标：回放与实时回调共用，event.seq <= lastSeq 丢弃（spec 3.5）
        let lastSeq = since;
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

        // 回放 PG（先 subscribe 再回放，spec 3.5 Step 3）：seq > since 且 seq > lastSeq（实时可能已 push）
        const events = (await this.eventStore.replay(runId)).filter(e => e.seq > since);
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
