import { describe, expect, it, vi } from 'vitest';
import { LangGraphChatRuntime } from '../chat-runtime';
import type { LangGraphRuntimeClient, LangGraphStreamEvent } from '../types';

async function* streamOf(events: LangGraphStreamEvent[]) {
    for (const event of events) {
        yield event;
    }
}

function createClient(streams: LangGraphStreamEvent[][]): LangGraphRuntimeClient {
    return {
        threads: {
            create: vi.fn(async () => ({ thread_id: 'thread-1' })),
            getState: vi.fn(),
        },
        runs: {
            stream: vi.fn((_threadId, _assistantId, _payload) => {
                const events = streams.shift() ?? [];
                return streamOf(events);
            }),
            joinStream: vi.fn(() => streamOf([])),
            list: vi.fn(async () => []),
            cancel: vi.fn(),
        },
    };
}

/**
 * 可控 SSE 流：push 入队事件，close 结束生成器。用于测试 stop() 时 runStream 处于
 * 进行中（stream 未结束）的场景 —— 固定数组的 streamOf 会立刻结束，无法测中途回调。
 */
function controllableStream() {
    const queue: LangGraphStreamEvent[] = [];
    const waiters: Array<() => void> = [];
    let closed = false;
    async function* gen(): AsyncGenerator<LangGraphStreamEvent> {
        for (;;) {
            while (queue.length > 0) {
                yield queue.shift() as LangGraphStreamEvent;
            }
            if (closed) return;
            await new Promise<void>(resolve => waiters.push(resolve));
        }
    }
    return {
        gen,
        push(event: LangGraphStreamEvent) {
            queue.push(event);
            const waiter = waiters.shift();
            if (waiter) waiter();
        },
        close() {
            closed = true;
            const waiter = waiters.shift();
            if (waiter) waiter();
        },
    };
}

describe('LangGraphChatRuntime', () => {
    it('returns the same snapshot reference until runtime state changes', async () => {
        const client = createClient([
            [
                {
                    event: 'values',
                    data: {
                        messages: [{ id: 'ai-1', type: 'ai', content: 'Hello' }],
                    },
                },
            ],
        ]);
        const runtime = new LangGraphChatRuntime({
            client,
            toolExecutor: { dispatch: vi.fn() },
        });

        const initialSnapshot = runtime.getSnapshot();

        expect(runtime.getSnapshot()).toBe(initialSnapshot);

        await runtime.sendMessage('Hello');

        const updatedSnapshot = runtime.getSnapshot();
        expect(updatedSnapshot).not.toBe(initialSnapshot);
        expect(runtime.getSnapshot()).toBe(updatedSnapshot);
    });

    it('projects LangGraph values events into renderable chat messages', async () => {
        const client = createClient([
            [
                { event: 'metadata', data: { run_id: 'run-1', thread_id: 'thread-1' } },
                {
                    event: 'values',
                    data: {
                        messages: [
                            { id: 'h-1', type: 'human', content: 'Hello' },
                            { id: 'ai-1', type: 'ai', content: 'Hi there' },
                        ],
                    },
                },
            ],
        ]);
        const runtime = new LangGraphChatRuntime({
            client,
            toolExecutor: { dispatch: vi.fn() },
        });

        await runtime.sendMessage('Hello');

        expect(runtime.getSnapshot().messages).toEqual([
            {
                id: 'h-1',
                role: 'human',
                content: 'Hello',
                toolCalls: undefined,
                toolCallId: undefined,
            },
            {
                id: 'ai-1',
                role: 'ai',
                content: 'Hi there',
                toolCalls: undefined,
                toolCallId: undefined,
            },
        ]);
    });

    it('executes LangGraph task interrupts and resumes through the LangGraph command protocol', async () => {
        const dispatch = vi.fn(async () => ({ success: true, content: 'created' }));
        const client = createClient([
            [
                { event: 'metadata', data: { run_id: 'run-1', thread_id: 'thread-1' } },
                {
                    event: 'tasks',
                    data: {
                        id: 'task-1',
                        name: 'tools',
                        input: {},
                        triggers: [],
                        interrupts: [
                            {
                                id: 'interrupt-1',
                                value: {
                                    tool_call_id: 'tc-1',
                                    tool_name: 'file_ops',
                                    args: { operation: 'create', path: 'notes/a.km' },
                                },
                            },
                        ],
                    },
                },
            ],
            [
                { event: 'metadata', data: { run_id: 'run-2', thread_id: 'thread-1' } },
                {
                    event: 'values',
                    data: {
                        messages: [{ id: 'ai-2', type: 'ai', content: 'Done' }],
                    },
                },
            ],
        ]);
        const runtime = new LangGraphChatRuntime({
            client,
            toolExecutor: { dispatch },
        });

        await runtime.sendMessage('Create a note');

        expect(dispatch).toHaveBeenCalledTimes(1);
        expect(dispatch).toHaveBeenCalledWith('file_ops', {
            operation: 'create',
            path: 'notes/a.km',
        });
        expect(client.runs.stream).toHaveBeenCalledTimes(2);
        expect(client.runs.stream).toHaveBeenLastCalledWith('thread-1', 'default', {
            command: {
                resume: {
                    tool_call_id: 'tc-1',
                    tool_result: { success: true, content: 'created' },
                },
            },
            input: null,
            streamMode: ['messages', 'values', 'tasks'],
            signal: expect.any(AbortSignal),
        });
    });

    it('does not execute the same interrupt twice', async () => {
        const dispatch = vi.fn(async () => ({ success: true }));
        const duplicateInterrupt = {
            id: 'task-1',
            name: 'tools',
            input: {},
            triggers: [],
            interrupts: [
                {
                    id: 'interrupt-1',
                    value: {
                        tool_call_id: 'tc-1',
                        tool_name: 'doc_read',
                        args: { path: 'notes/a.km' },
                    },
                },
            ],
        };
        const client = createClient([
            [
                { event: 'metadata', data: { run_id: 'run-1', thread_id: 'thread-1' } },
                { event: 'tasks', data: duplicateInterrupt },
                { event: 'tasks', data: duplicateInterrupt },
            ],
            [{ event: 'metadata', data: { run_id: 'run-2', thread_id: 'thread-1' } }],
        ]);
        const runtime = new LangGraphChatRuntime({
            client,
            toolExecutor: { dispatch },
        });

        await runtime.sendMessage('Read note');

        expect(dispatch).toHaveBeenCalledTimes(1);
        expect(client.runs.stream).toHaveBeenCalledTimes(2);
    });

    it('stop() posts cancel without aborting the fetch and waits for the SSE terminal', async () => {
        const cs = controllableStream();
        const client: LangGraphRuntimeClient = {
            threads: {
                create: vi.fn(async () => ({ thread_id: 'thread-1' })),
                getState: vi.fn(),
            },
            runs: {
                stream: vi.fn(() => cs.gen()),
                joinStream: vi.fn(() => streamOf([])),
                list: vi.fn(async () => []),
                cancel: vi.fn(async () => {}),
            },
        };
        const runtime = new LangGraphChatRuntime({
            client,
            toolExecutor: { dispatch: vi.fn() },
        });

        // 启动 runStream（不 await —— stream pending，runStream 仍在 for await）
        const runPromise = runtime.sendMessage('Hello');
        cs.push({ event: 'metadata', data: { run_id: 'run-1', thread_id: 'thread-1' } });
        cs.push({
            event: 'values',
            data: { messages: [{ id: 'ai-1', type: 'ai', content: 'Hi' }] },
        });

        // 等 runStream 进入 streaming 态
        await vi.waitFor(() => expect(runtime.getSnapshot().isStreaming).toBe(true));
        expect(runtime.getSnapshot().runId).toBe('run-1');

        // stop()：spec 3.7 —— 只调 cancel，不 abort、不立即清 isStreaming
        await runtime.stop();
        expect(client.runs.cancel).toHaveBeenCalledWith('thread-1', 'run-1', false);
        expect(runtime.getSnapshot().isStreaming).toBe(true); // 仍 streaming，等 SSE 终态

        // SSE 推 end{cancelled} 并关闭流 → runStream finally 落定 isStreaming=false
        cs.push({ event: 'end', data: { finish_reason: 'cancelled' } });
        cs.close();
        await vi.waitFor(() => expect(runtime.getSnapshot().isStreaming).toBe(false));

        await runPromise; // stream 结束，runStream resolve
    });

    it('tracks connectionPhase: ready → streaming → ready through runStream', async () => {
        const cs = controllableStream();
        const client: LangGraphRuntimeClient = {
            threads: {
                create: vi.fn(async () => ({ thread_id: 'thread-1' })),
                getState: vi.fn(),
            },
            runs: {
                stream: vi.fn(() => cs.gen()),
                joinStream: vi.fn(() => streamOf([])),
                list: vi.fn(async () => []),
                cancel: vi.fn(async () => {}),
            },
        };
        const runtime = new LangGraphChatRuntime({ client, toolExecutor: { dispatch: vi.fn() } });

        expect(runtime.getSnapshot().connectionPhase).toBe('idle');
        expect(runtime.getSnapshot().lastSeq).toBe(0);

        const promise = runtime.sendMessage('Hi');
        cs.push({ event: 'metadata', data: { run_id: 'run-1', thread_id: 'thread-1' } });
        cs.push({
            event: 'values',
            data: { messages: [{ id: 'ai-1', type: 'ai', content: 'Hi' }] },
        });

        await vi.waitFor(() => expect(runtime.getSnapshot().connectionPhase).toBe('streaming'));
        expect(runtime.getSnapshot().isStreaming).toBe(true);

        cs.push({ event: 'end', data: {} });
        cs.close();
        await promise;

        expect(runtime.getSnapshot().connectionPhase).toBe('ready');
        expect(runtime.getSnapshot().isStreaming).toBe(false);
    });

    it('updates lastSeq from inbound events carrying seq', async () => {
        const client: LangGraphRuntimeClient = {
            threads: { create: vi.fn(async () => ({ thread_id: 'thread-1' })), getState: vi.fn() },
            runs: {
                stream: async function* () {
                    yield { event: 'metadata', data: { run_id: 'run-1' }, seq: 0 };
                    yield { event: 'values', data: { messages: [] }, seq: 3 };
                    yield { event: 'end', data: {}, seq: 5 };
                },
                joinStream: async function* () {},
                list: vi.fn(async () => []),
                cancel: vi.fn(async () => {}),
            },
        };
        const runtime = new LangGraphChatRuntime({ client, toolExecutor: { dispatch: vi.fn() } });
        await runtime.sendMessage('Hi');
        expect(runtime.getSnapshot().lastSeq).toBe(5);
    });

    it('openThread: no active run → loading → ready', async () => {
        const client: LangGraphRuntimeClient = {
            threads: {
                create: vi.fn(),
                getState: vi.fn(async () => ({
                    values: { messages: [{ id: 'h-1', type: 'human', content: 'old' }] },
                })),
            },
            runs: {
                stream: async function* () {},
                joinStream: async function* () {},
                list: vi.fn(async () => [{ id: 'run-old', status: 'completed' }]),
                cancel: vi.fn(),
            },
        };
        const runtime = new LangGraphChatRuntime({ client, toolExecutor: { dispatch: vi.fn() } });

        await runtime.openThread('thread-1');

        expect(client.threads.getState).toHaveBeenCalledWith('thread-1');
        expect(client.runs.list).toHaveBeenCalledWith('thread-1');
        expect(runtime.getSnapshot().messages).toEqual([
            expect.objectContaining({ id: 'h-1', content: 'old' }),
        ]);
        expect(runtime.getSnapshot().connectionPhase).toBe('ready');
        expect(runtime.getSnapshot().threadId).toBe('thread-1');
    });

    it('openThread: active running run → joinStream since=0 → streaming', async () => {
        const joinEvents = [
            { event: 'metadata', data: { run_id: 'run-live', thread_id: 'thread-1' }, seq: 0 },
            {
                event: 'values',
                data: { messages: [{ id: 'ai-1', type: 'ai', content: 'live' }] },
                seq: 2,
            },
        ];
        const client: LangGraphRuntimeClient = {
            threads: {
                create: vi.fn(),
                getState: vi.fn(async () => ({ values: { messages: [] } })),
            },
            runs: {
                stream: async function* () {},
                joinStream: vi.fn(async function* () {
                    for (const e of joinEvents) yield e;
                }),
                list: vi.fn(async () => [{ id: 'run-live', status: 'running' }]),
                cancel: vi.fn(),
            },
        };
        const runtime = new LangGraphChatRuntime({ client, toolExecutor: { dispatch: vi.fn() } });

        await runtime.openThread('thread-1');

        expect(client.runs.joinStream).toHaveBeenCalledWith('thread-1', 'run-live', 0);
        expect(runtime.getSnapshot().runId).toBe('run-live');
        expect(runtime.getSnapshot().lastSeq).toBe(2);
        // joinStream 流结束（无 end 事件）→ 终态落 ready
        expect(runtime.getSnapshot().connectionPhase).toBe('ready');
    });
});
