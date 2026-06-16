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

    it('openThread aborts a running stream without flipping the new loading phase to ready', async () => {
        function deferred<T>() {
            let resolve!: (value: T | PromiseLike<T>) => void;
            let reject!: (reason?: unknown) => void;
            const promise = new Promise<T>((res, rej) => {
                resolve = res;
                reject = rej;
            });
            return { promise, resolve, reject };
        }

        const getStateGate = deferred<{ values: { messages: LangGraphStreamEvent[] } }>();

        const client: LangGraphRuntimeClient = {
            threads: {
                create: vi.fn(async () => ({ thread_id: 'thread-1' })),
                // 让 openThread 卡在 getState 这步,phase 留在 loading
                getState: vi.fn(() => getStateGate.promise as never),
            },
            runs: {
                stream: vi.fn((_threadId, _assistantId, payload) => {
                    const signal = payload?.signal as AbortSignal;
                    async function* gen(): AsyncGenerator<LangGraphStreamEvent> {
                        yield {
                            event: 'metadata',
                            data: { run_id: 'run-1', thread_id: 'thread-1' },
                        };
                        // 等到 abort 时主动抛出,模拟 fetch 在 abort 时 reject
                        await new Promise<never>((_resolve, reject) => {
                            if (signal.aborted) {
                                reject(new DOMException('aborted', 'AbortError'));
                                return;
                            }
                            signal.addEventListener('abort', () => {
                                reject(new DOMException('aborted', 'AbortError'));
                            });
                        });
                    }
                    return gen();
                }),
                joinStream: vi.fn(() => streamOf([])),
                list: vi.fn(async () => []),
                cancel: vi.fn(async () => {}),
            },
        };

        const runtime = new LangGraphChatRuntime({
            client,
            toolExecutor: { dispatch: vi.fn() },
        });

        // 启动旧 sendMessage,等进入 streaming
        const sendPromise = runtime.sendMessage('Hi');
        await vi.waitFor(() => expect(runtime.getSnapshot().connectionPhase).toBe('streaming'));

        // openThread 切到新 thread:abort 旧 stream,phase 立即 → loading
        const openPromise = runtime.openThread('thread-2');
        expect(runtime.getSnapshot().connectionPhase).toBe('loading');

        // 等旧 runStream catch 被触发(microtask)。在 getState 仍 pending 期间,
        // phase 必须保持 loading,不能被旧 runStream catch finishRun 覆盖成 ready。
        await Promise.resolve();
        await Promise.resolve();
        await vi.waitFor(() =>
            // 旧 stream 的 abort 已经传播过 catch
            expect(client.runs.stream).toHaveBeenCalledTimes(1),
        );

        expect(runtime.getSnapshot().connectionPhase).toBe('loading');

        // 解除 getState gate,openThread 走完三段式 → ready
        getStateGate.resolve({ values: { messages: [] } });
        await openPromise;
        await sendPromise.catch(() => undefined);

        expect(runtime.getSnapshot().connectionPhase).toBe('ready');
        expect(runtime.getSnapshot().threadId).toBe('thread-2');
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

    it('auto-reconnects on joinStream error with exponential backoff and since=lastSeq', async () => {
        let joinCall = 0;
        const client: LangGraphRuntimeClient = {
            threads: {
                create: vi.fn(),
                getState: vi.fn(async () => ({ values: {} })),
            },
            runs: {
                stream: async function* () {},
                joinStream: vi.fn(async function* (_tid, _rid, since) {
                    joinCall += 1;
                    if (joinCall === 1) {
                        yield {
                            event: 'values',
                            data: { messages: [{ id: 'ai-1', type: 'ai', content: 'partial' }] },
                            seq: 7,
                        };
                        throw new Error('network drop');
                    }
                    yield {
                        event: 'values',
                        data: { messages: [{ id: 'ai-2', type: 'ai', content: 'more' }] },
                        seq: (since ?? 0) + 1,
                    };
                    yield { event: 'end', data: {}, seq: (since ?? 0) + 2 };
                }),
                list: vi.fn(async () => [{ id: 'run-live', status: 'running' }]),
                cancel: vi.fn(),
            },
        };
        const runtime = new LangGraphChatRuntime({ client, toolExecutor: { dispatch: vi.fn() } });

        await runtime.openThread('thread-1');

        await vi.waitFor(() => expect(runtime.getSnapshot().connectionPhase).toBe('ready'));
        expect(joinCall).toBe(2);
        expect(client.runs.joinStream).toHaveBeenLastCalledWith('thread-1', 'run-live', 7);
    });

    it('switching thread during reconnect does not let the old autoReconnect overwrite new thread', async () => {
        // thread-1 setup: joinStream 第一次抛错触发 autoReconnect。
        // 在 sleep 期间调用 openThread('thread-2'),旧 reconnect 必须 no-op。
        const joinStreamMock = vi.fn(async function* (
            threadId: string,
            _runId: string,
            _since: number,
        ): AsyncGenerator<LangGraphStreamEvent> {
            if (threadId === 'thread-1') {
                throw new Error('network drop');
            }
            // thread-2 不应被调用(无 active);保留 yield 占位让类型为 AsyncGenerator
            if (false as boolean) {
                yield { event: 'end', data: {} };
            }
        });
        const listMock = vi.fn(async (threadId: string) => {
            if (threadId === 'thread-1') {
                return [{ id: 'run-1', status: 'running' as const }];
            }
            return [];
        });
        const getStateMock = vi.fn(async (threadId: string) => {
            if (threadId === 'thread-1') {
                return { values: { messages: [] } };
            }
            return { values: { messages: [] } };
        });
        const client: LangGraphRuntimeClient = {
            threads: { create: vi.fn(), getState: getStateMock },
            runs: {
                stream: async function* () {},
                joinStream: joinStreamMock,
                list: listMock,
                cancel: vi.fn(),
            },
        };
        const runtime = new LangGraphChatRuntime({ client, toolExecutor: { dispatch: vi.fn() } });

        // 启动 thread-1 open;不 await 完整结果,等它进入 reconnecting
        const open1 = runtime.openThread('thread-1');
        await vi.waitFor(() => expect(runtime.getSnapshot().connectionPhase).toBe('reconnecting'));

        const callsBeforeSwitch = joinStreamMock.mock.calls.length;

        // 在 sleep 期间切到 thread-2
        const open2 = runtime.openThread('thread-2');
        await open2;

        // thread-2 完成 open: 无 active run → ready
        expect(runtime.getSnapshot().threadId).toBe('thread-2');
        expect(runtime.getSnapshot().connectionPhase).toBe('ready');

        // 等足够时间让旧 autoReconnect 可能跑完所有 sleep+retry,确认它不再调用 joinStream
        await new Promise(r => setTimeout(r, 400));

        // 旧 autoReconnect 必须 no-op:不再以 thread-1/run-1 调用 joinStream
        const callsAfter = joinStreamMock.mock.calls.length;
        expect(callsAfter).toBe(callsBeforeSwitch);

        // phase 不能被旧 reconnect 改回 reconnecting/streaming/ready+error
        expect(runtime.getSnapshot().connectionPhase).toBe('ready');
        expect(runtime.getSnapshot().error).toBeNull();
        expect(runtime.getSnapshot().threadId).toBe('thread-2');
        // 旧 thread-1 yield 任何消息都不该出现在新 thread snapshot 中
        expect(runtime.getSnapshot().messages).toEqual([]);

        await open1;
    });

    it('auto-reconnect: all retries fail → phase=ready, error set, messages preserved, since=lastSeq', async () => {
        const client: LangGraphRuntimeClient = {
            threads: {
                create: vi.fn(),
                getState: vi.fn(async () => ({ values: {} })),
            },
            runs: {
                stream: async function* () {},
                joinStream: vi.fn(async function* (_tid, _rid, _since) {
                    yield {
                        event: 'values',
                        data: { messages: [{ id: 'ai-1', type: 'ai', content: 'partial' }] },
                        seq: 7,
                    };
                    throw new Error('network drop');
                }),
                list: vi.fn(async () => [{ id: 'run-live', status: 'running' }]),
                cancel: vi.fn(),
            },
        };
        const runtime = new LangGraphChatRuntime({ client, toolExecutor: { dispatch: vi.fn() } });

        await runtime.openThread('thread-1');

        // 首轮 + 5 次重试 = 6 次 joinStream
        expect(client.runs.joinStream).toHaveBeenCalledTimes(6);
        // 最后一次 retry 用 lastSeq=7 作为 since
        expect(client.runs.joinStream).toHaveBeenLastCalledWith('thread-1', 'run-live', 7);

        const snapshot = runtime.getSnapshot();
        expect(snapshot.connectionPhase).toBe('ready');
        expect(snapshot.error).toBe('连接断开，可重试');
        // 首轮 yield 的消息保留
        expect(snapshot.messages).toEqual([
            expect.objectContaining({ id: 'ai-1', content: 'partial' }),
        ]);
        expect(snapshot.lastSeq).toBe(7);
    });

    it('enters paused phase during tool interrupt and returns to streaming on resume', async () => {
        const dispatch = vi.fn(async () => ({ success: true }));
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
                                id: 'i-1',
                                value: {
                                    tool_call_id: 'tc-1',
                                    tool_name: 'file_ops',
                                    args: { operation: 'create', path: 'a.km' },
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
                    data: { messages: [{ id: 'ai-2', type: 'ai', content: 'Done' }] },
                },
                { event: 'end', data: {} },
            ],
        ]);
        const runtime = new LangGraphChatRuntime({ client, toolExecutor: { dispatch } });

        const phases: string[] = [];
        const sub = runtime.subscribe(() => phases.push(runtime.getSnapshot().connectionPhase));

        await runtime.sendMessage('Create note');

        expect(phases).toContain('paused');
        expect(phases).toContain('streaming');
        expect(runtime.getSnapshot().connectionPhase).toBe('ready');
        sub.dispose();
    });
});
