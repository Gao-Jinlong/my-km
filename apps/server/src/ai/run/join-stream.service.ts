import { Injectable, NotFoundException } from '@nestjs/common';
import { EventBus, type RunStreamEvent, runChannel } from '../event/event-bus';
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
        if (!isTerminal) {
            // running/interrupted —— Task 2 实现
            throw new Error(
                `joinStream for non-terminal status (${run.status}) not yet implemented`,
            );
        }

        // terminal：纯回放 seq > since，遇终态 close
        let closed = false;
        const close = () => {
            if (!closed) {
                closed = true;
                sink.close();
            }
        };

        const events = (await this.eventStore.replay(runId)).filter(e => e.seq > since);
        for (const e of events) {
            sink.push(toRunStreamEvent(e));
            if (e.eventType === 'end' || e.eventType === 'error') {
                close();
                break;
            }
        }
        close(); // 防御：无终态事件也 close

        return () => close(); // terminal 已 close，cleanup 幂等 no-op
    }
}
