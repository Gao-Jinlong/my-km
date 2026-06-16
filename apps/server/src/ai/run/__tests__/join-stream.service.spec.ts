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
        replay: jest.fn().mockResolvedValue(
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

    it('replays persisted events from start (since=0 includes seq=0) for a completed run and closes', async () => {
        const run = { id: 'r1', status: 'completed' } as RunRow;
        // since=0 表示从头回放：必须包含 seq=0 的 metadata（前端首次 openThread 不能丢）
        const events = [
            { seq: 0, eventType: 'metadata', payload: { run_id: 'r1' } },
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
            { seq: 0, eventType: 'metadata', payload: { run_id: 'r1' } },
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

    it('closes a cancelled run with no end/error event via the defensive close', async () => {
        const run = { id: 'r1', status: 'cancelled' } as RunRow;
        const events = [{ seq: 1, eventType: 'tasks', payload: {} }];
        const service = new JoinStreamService(
            eventBus,
            mockRunStateRepo(run),
            mockEventStore(events),
        );
        const sink = collectorSink();

        const cleanup = await service.joinStream('r1', 0, sink);

        expect(sink.events).toEqual([{ seq: 1, eventType: 'tasks', payload: {} }]);
        expect(sink.closed).toBe(true); // defensive close（replay 无 end/error，靠循环后的 close()）
        expect(typeof cleanup).toBe('function');
    });
});

describe('JoinStreamService — live resume (running/interrupted)', () => {
    let eventBus: InProcessEventBus;

    beforeEach(() => {
        eventBus = new InProcessEventBus();
    });

    it('subscribes EventBus and delivers live events after replay (running run)', async () => {
        const run = { id: 'r1', status: 'running' } as RunRow;
        // PG 空（run 刚开始，无持久化）
        const service = new JoinStreamService(eventBus, mockRunStateRepo(run), mockEventStore([]));
        const sink = collectorSink();

        const cleanup = await service.joinStream('r1', 0, sink);
        // 模拟 owner 端 publish 实时事件
        await eventBus.publish(runChannel('r1'), {
            seq: 1,
            eventType: 'values',
            payload: { n: 1 },
        });
        await eventBus.publish(runChannel('r1'), {
            seq: 2,
            eventType: 'messages',
            payload: { chunk: 'hi' },
        });
        await eventBus.publish(runChannel('r1'), { seq: 3, eventType: 'end', payload: {} });

        expect(sink.events).toEqual([
            { seq: 1, eventType: 'values', payload: { n: 1 } },
            { seq: 2, eventType: 'messages', payload: { chunk: 'hi' } },
            { seq: 3, eventType: 'end', payload: {} },
        ]);
        expect(sink.closed).toBe(true); // end → close
        cleanup();
    });

    it('dedups overlapping replay + live events by seq', async () => {
        const run = { id: 'r1', status: 'running' } as RunRow;
        // PG 已持久化 seq 1（values）；since=0
        const events = [{ seq: 1, eventType: 'values', payload: { n: 1 } }];
        const service = new JoinStreamService(
            eventBus,
            mockRunStateRepo(run),
            mockEventStore(events),
        );
        const sink = collectorSink();

        await service.joinStream('r1', 0, sink);
        // 模拟 owner 重新 publish seq 1（重叠，应去重）+ 新 seq 2
        await eventBus.publish(runChannel('r1'), {
            seq: 1,
            eventType: 'values',
            payload: { n: 1 },
        });
        await eventBus.publish(runChannel('r1'), { seq: 2, eventType: 'end', payload: {} });

        expect(sink.events).toEqual([
            { seq: 1, eventType: 'values', payload: { n: 1 } }, // 回放
            { seq: 2, eventType: 'end', payload: {} }, // 实时（seq 1 实时被去重）
        ]);
        expect(sink.closed).toBe(true);
    });

    it('replays persisted events then continues live for a running run', async () => {
        const run = { id: 'r1', status: 'running' } as RunRow;
        const events = [{ seq: 1, eventType: 'values', payload: { n: 1 } }];
        const service = new JoinStreamService(
            eventBus,
            mockRunStateRepo(run),
            mockEventStore(events),
        );
        const sink = collectorSink();

        await service.joinStream('r1', 0, sink);
        await eventBus.publish(runChannel('r1'), { seq: 2, eventType: 'end', payload: {} });

        expect(sink.events).toEqual([
            { seq: 1, eventType: 'values', payload: { n: 1 } }, // 回放
            { seq: 2, eventType: 'end', payload: {} }, // 实时续
        ]);
        expect(sink.closed).toBe(true);
    });

    it('keeps the stream open for interrupted runs (no end event)', async () => {
        const run = { id: 'r1', status: 'interrupted' } as RunRow;
        const events = [{ seq: 1, eventType: 'tasks', payload: { interrupt: true } }];
        const service = new JoinStreamService(
            eventBus,
            mockRunStateRepo(run),
            mockEventStore(events),
        );
        const sink = collectorSink();

        const cleanup = await service.joinStream('r1', 0, sink);
        // interrupted 无 end，stream 保持开
        expect(sink.closed).toBe(false);
        expect(sink.events).toEqual([{ seq: 1, eventType: 'tasks', payload: { interrupt: true } }]);

        // client 断开 → cleanup 关闭
        cleanup();
        expect(sink.closed).toBe(true);
    });

    it('cleanup stops live delivery (no further events after cleanup)', async () => {
        const run = { id: 'r1', status: 'running' } as RunRow;
        const service = new JoinStreamService(eventBus, mockRunStateRepo(run), mockEventStore([]));
        const sink = collectorSink();

        const cleanup = await service.joinStream('r1', 0, sink);
        await eventBus.publish(runChannel('r1'), {
            seq: 1,
            eventType: 'values',
            payload: { n: 1 },
        });
        expect(sink.events).toHaveLength(1);

        cleanup(); // client 断
        await eventBus.publish(runChannel('r1'), { seq: 2, eventType: 'end', payload: {} });
        // cleanup 后不再收到
        expect(sink.events).toHaveLength(1);
        expect(sink.closed).toBe(true);
    });

    it('closes when end arrives via replay (not live) for a running run', async () => {
        const run = { id: 'r1', status: 'running' } as RunRow;
        // PG 已含 end（owner 已 end + persist，client 后连）
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

        expect(sink.closed).toBe(true); // 回放含 end → close
        // 回放已 close，后续 publish 不应投递（subscription 已 unsubscribe，无 leak）
        await eventBus.publish(runChannel('r1'), {
            seq: 3,
            eventType: 'values',
            payload: { n: 3 },
        });
        expect(sink.events).toEqual([
            { seq: 1, eventType: 'values', payload: { n: 1 } },
            { seq: 2, eventType: 'end', payload: {} },
        ]);
        cleanup();
    });
});
