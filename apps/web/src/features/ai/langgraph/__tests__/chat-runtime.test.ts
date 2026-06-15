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
            cancel: vi.fn(),
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
});
