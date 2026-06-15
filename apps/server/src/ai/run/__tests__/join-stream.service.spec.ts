import { type RunStreamEvent, runChannel } from '../../event/event-bus';
import { InProcessEventBus } from '../../event/in-process.event-bus';
import type { RunEventStore } from '../../store/run-event-store';
import { JoinStreamService } from '../join-stream.service';
import type { RunRow } from '../lease.types';
import type { RunEventSink } from '../run-event-sink';
import type { RunStateRepository } from '../run-state.repository';

/** 收集器 sink：收集 push 的事件 + 记录 close（闭包持有状态，无 this 绑定问题） */
function collectorSink(): RunEventSink & {
    events: RunStreamEvent[];
    closed: boolean;
} {
    const events: RunStreamEvent[] = [];
    let closed = false;
    return {
        events,
        get closed() {
            return closed;
        },
        push(e: RunStreamEvent) {
            events.push(e);
        },
        close() {
            closed = true;
        },
    };
}

/** 构造 mock RunStateRepository，findById 返回指定 RunRow（或 null） */
function mockRunStateRepo(run: RunRow | null) {
    return { findById: jest.fn().mockResolvedValue(run) } as unknown as RunStateRepository;
}

/** 构造 mock RunEventStore，replay 返回指定事件列表（prisma RunEvent 形状） */
function mockEventStore(events: Array<{ seq: number; eventType: string; payload: unknown }>) {
    return {
        replay: jest
            .fn()
            .mockResolvedValue(
                events.map(e => ({
                    runId: 'r1',
                    threadId: 't1',
                    ...e,
                    eventName: '',
                    createdAt: new Date(),
                })),
            ),
    } as unknown as RunEventStore;
}

describe('JoinStreamService — terminal replay', () => {
    let eventBus: InProcessEventBus;

    beforeEach(() => {
        eventBus = new InProcessEventBus();
    });

    it('throws NotFoundException when the run does not exist', async () => {
        const service = new JoinStreamService(eventBus, mockRunStateRepo(null), mockEventStore([]));
        const sink = collectorSink();
        await expect(service.joinStream('nope', 0, sink)).rejects.toThrow(/not found/i);
        expect(sink.closed).toBe(false);
    });

    it('replays persisted events (seq > since) for a completed run and closes', async () => {
        const run = { id: 'r1', status: 'completed' } as RunRow;
        const events = [
            { seq: 1, eventType: 'values', payload: { n: 1 } },
            { seq: 2, eventType: 'end', payload: {} },
        ];
        const service = new JoinStreamService(
            eventBus,
            mockRunStateRepo(run),
            mockEventStore(events),
        );
        const sink = collectorSink();

        const cleanup = await service.joinStream('r1', 0, sink);

        expect(sink.events).toEqual([
            { seq: 1, eventType: 'values', payload: { n: 1 } },
            { seq: 2, eventType: 'end', payload: {} },
        ]);
        expect(sink.closed).toBe(true);
        expect(typeof cleanup).toBe('function');
    });

    it('filters out events with seq <= since', async () => {
        const run = { id: 'r1', status: 'completed' } as RunRow;
        const events = [
            { seq: 1, eventType: 'values', payload: { old: true } },
            { seq: 5, eventType: 'values', payload: { n: 5 } },
            { seq: 6, eventType: 'end', payload: {} },
        ];
        const service = new JoinStreamService(
            eventBus,
            mockRunStateRepo(run),
            mockEventStore(events),
        );
        const sink = collectorSink();

        await service.joinStream('r1', 4, sink);

        // seq 1 <= 4 过滤；seq 5,6 保留
        expect(sink.events).toEqual([
            { seq: 5, eventType: 'values', payload: { n: 5 } },
            { seq: 6, eventType: 'end', payload: {} },
        ]);
        expect(sink.closed).toBe(true);
    });

    it('returns a no-op cleanup for terminal runs (already closed)', async () => {
        const run = { id: 'r1', status: 'failed' } as RunRow;
        const events = [{ seq: 1, eventType: 'error', payload: { error: 'x' } }];
        const service = new JoinStreamService(
            eventBus,
            mockRunStateRepo(run),
            mockEventStore(events),
        );
        const sink = collectorSink();

        const cleanup = await service.joinStream('r1', 0, sink);
        expect(sink.closed).toBe(true);
        // cleanup 幂等安全（已 close，再调不抛）
        expect(() => cleanup()).not.toThrow();
    });
});
