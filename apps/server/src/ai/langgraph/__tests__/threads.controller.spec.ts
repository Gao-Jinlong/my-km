/**
 * ThreadsController unit tests
 *
 * 验证 LangGraph 协议 controller 的路由处理：
 *   - createThread / searchThreads / getThread / patch / delete
 *   - streamRun（新 run / resume / 无 user message / multitask_strategy 透传）
 *   - getThreadState
 *
 * Mock AiChatService / ThreadService / MessageService，
 * 不启动 Nest app，直接 new controller。
 */

import { NotFoundException } from '@nestjs/common';
import type { Response } from 'express';
import type { AiChatService } from '../../ai.service';
import type { CheckpointReaderService } from '../../checkpointer/checkpoint-reader.service';
import type { JoinStreamService } from '../../run/join-stream.service';
import type { ThreadService } from '../../thread/thread.service';

// Mock langgraph ESM modules to prevent uuid ESM error in Jest.
// 必须在 import ThreadsController 之前 mock，因为 controller 间接
// import 了 chat-graph → @langchain/langgraph → uuid（ESM 包）。
jest.mock('@langchain/langgraph', () => ({
    StateGraph: jest.fn().mockReturnValue({
        addNode: jest.fn().mockReturnThis(),
        addEdge: jest.fn().mockReturnThis(),
        addConditionalEdges: jest.fn().mockReturnThis(),
        compile: jest.fn().mockReturnValue({ stream: jest.fn() }),
    }),
    START: '__start__',
    END: '__end__',
    Annotation: { Root: jest.fn().mockReturnValue({}) },
}));

jest.mock('@langchain/langgraph-checkpoint', () => ({
    MemorySaver: jest.fn().mockImplementation(() => ({ type: 'MemorySaver' })),
}));

jest.mock('../graphs/chat-graph', () => ({
    ChatGraph: jest.fn().mockImplementation(() => ({
        name: 'chat',
        createGraph: jest.fn().mockReturnValue({
            compile: jest.fn().mockReturnValue({ type: 'compiled-graph', stream: jest.fn() }),
        }),
    })),
}));

import { ThreadsController } from '../threads.controller';

/**
 * 构造 mock Express Response 以捕获 SSE 写入
 */
function createMockResponse(): {
    res: Response;
    writes: string[];
} {
    const writes: string[] = [];
    const res = {
        writableEnded: false,
        write: jest.fn((chunk: string) => {
            writes.push(chunk);
            return true;
        }),
        end: jest.fn(() => {
            (res as { writableEnded: boolean }).writableEnded = true;
        }),
        setHeader: jest.fn(),
        flushHeaders: jest.fn(),
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
        on: jest.fn(),
    } as unknown as Response;
    return { res, writes };
}

describe('ThreadsController', () => {
    let controller: ThreadsController;
    let mockAiService: jest.Mocked<AiChatService>;
    let mockThreadService: jest.Mocked<ThreadService>;
    let mockCheckpointReader: jest.Mocked<CheckpointReaderService>;
    let mockJoinStreamService: jest.Mocked<JoinStreamService>;

    const sampleThread = {
        id: 'thread-1',
        title: 'Hello',
        status: 'active',
        model: null,
        provider: null,
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-01T00:00:00Z'),
    };

    beforeEach(() => {
        mockAiService = {
            startRun: jest.fn(),
            resumeFromCommand: jest.fn(),
            executeRunProtocol: jest.fn().mockResolvedValue(undefined),
            cancel: jest.fn(),
        } as unknown as jest.Mocked<AiChatService>;

        mockThreadService = {
            create: jest.fn().mockResolvedValue(sampleThread),
            findAll: jest.fn().mockResolvedValue([sampleThread]),
            findById: jest.fn().mockResolvedValue(sampleThread),
            update: jest.fn().mockResolvedValue(sampleThread),
            delete: jest.fn().mockResolvedValue(undefined),
        } as unknown as jest.Mocked<ThreadService>;

        mockCheckpointReader = {
            getThreadState: jest.fn().mockResolvedValue({
                values: { messages: [] },
                next: [],
                checkpoint: { thread_id: 'thread-1' },
                tasks: [],
            }),
        } as unknown as jest.Mocked<CheckpointReaderService>;

        mockJoinStreamService = {
            joinStream: jest.fn().mockResolvedValue(jest.fn()),
        } as unknown as jest.Mocked<JoinStreamService>;

        controller = new ThreadsController(
            mockAiService,
            mockThreadService,
            mockCheckpointReader,
            mockJoinStreamService,
        );
    });

    describe('createThread', () => {
        it('extracts title from metadata.title and converts to LangGraph format', async () => {
            const result = await controller.createThread({
                metadata: { title: 'My Thread' },
                thread_id: 'tid-1',
            });

            expect(mockThreadService.create).toHaveBeenCalledWith({
                id: 'tid-1',
                title: 'My Thread',
            });
            expect(result.thread_id).toBe('thread-1');
            expect(result.metadata.title).toBe('Hello');
            expect(result.status).toBe('idle');
            expect(result.values).toEqual({});
        });

        it('handles missing metadata gracefully', async () => {
            const result = await controller.createThread({});

            expect(mockThreadService.create).toHaveBeenCalledWith({
                id: undefined,
                title: undefined,
            });
            expect(result.thread_id).toBe('thread-1');
        });
    });

    describe('searchThreads', () => {
        it('passes limit and offset to ThreadService.findAll', async () => {
            await controller.searchThreads({ limit: 20, offset: 5 });

            expect(mockThreadService.findAll).toHaveBeenCalledWith({
                limit: 20,
                offset: 5,
            });
        });

        it('uses defaults when limit/offset omitted', async () => {
            await controller.searchThreads({});

            expect(mockThreadService.findAll).toHaveBeenCalledWith({
                limit: 10,
                offset: 0,
            });
        });

        it('returns LangGraph-formatted threads', async () => {
            const result = await controller.searchThreads({});

            expect(result).toHaveLength(1);
            expect(result[0].thread_id).toBe('thread-1');
            expect(result[0].metadata.title).toBe('Hello');
        });
    });

    describe('getThread', () => {
        it('returns thread when found', async () => {
            const result = await controller.getThread('thread-1');
            expect(result.thread_id).toBe('thread-1');
        });

        it('throws NotFoundException when thread missing', async () => {
            mockThreadService.findById.mockResolvedValueOnce(null as never);

            await expect(controller.getThread('missing')).rejects.toThrow(NotFoundException);
        });
    });

    describe('getThreadState', () => {
        it('returns LangGraph ThreadState shape', async () => {
            mockCheckpointReader.getThreadState.mockResolvedValueOnce({
                values: {
                    messages: [
                        { type: 'human', content: 'hi', id: 'm1' },
                        { type: 'ai', content: 'hello', id: 'm2' },
                    ],
                },
                next: [],
                checkpoint: { thread_id: 'thread-1' },
                tasks: [],
            } as never);

            const result = await controller.getThreadState('thread-1');

            expect(result.values.messages).toEqual([
                { type: 'human', content: 'hi', id: 'm1' },
                { type: 'ai', content: 'hello', id: 'm2' },
            ]);
            expect(result.next).toEqual([]);
            expect(result.checkpoint.thread_id).toBe('thread-1');
            expect(result.tasks).toEqual([]);
        });
    });

    describe('streamRun', () => {
        it('starts a new run when input.messages contains human message', async () => {
            const fakeRecord = { id: 'run-1', threadId: 'thread-1', setSseWriter: jest.fn() };
            mockAiService.startRun.mockResolvedValueOnce(fakeRecord as never);
            const { res } = createMockResponse();

            await controller.streamRun(
                'thread-1',
                {
                    input: { messages: [{ type: 'human', content: 'hello' }] },
                    multitask_strategy: 'interrupt',
                },
                res,
            );

            expect(mockAiService.startRun).toHaveBeenCalledWith({
                content: 'hello',
                threadId: 'thread-1',
                context: undefined,
                multitaskStrategy: 'interrupt',
            });
            expect(fakeRecord.setSseWriter).toHaveBeenCalled();
            expect(mockAiService.executeRunProtocol).toHaveBeenCalledWith(fakeRecord);
        });

        it('passes multitask_strategy="enqueue" through to service (service decides fallback)', async () => {
            const fakeRecord = { id: 'run-1', threadId: 'thread-1', setSseWriter: jest.fn() };
            mockAiService.startRun.mockResolvedValueOnce(fakeRecord as never);
            const { res } = createMockResponse();

            await controller.streamRun(
                'thread-1',
                {
                    input: { messages: [{ type: 'human', content: 'hi' }] },
                    multitask_strategy: 'enqueue',
                },
                res,
            );

            expect(mockAiService.startRun).toHaveBeenCalledWith(
                expect.objectContaining({ multitaskStrategy: 'enqueue' }),
            );
        });

        it('defaults multitask_strategy to "reject" when omitted', async () => {
            const fakeRecord = { id: 'run-1', threadId: 'thread-1', setSseWriter: jest.fn() };
            mockAiService.startRun.mockResolvedValueOnce(fakeRecord as never);
            const { res } = createMockResponse();

            await controller.streamRun(
                'thread-1',
                { input: { messages: [{ type: 'human', content: 'hi' }] } },
                res,
            );

            expect(mockAiService.startRun).toHaveBeenCalledWith(
                expect.objectContaining({ multitaskStrategy: 'reject' }),
            );
        });

        it('routes to resumeFromCommand when body.command.resume present', async () => {
            const fakeRecord = { id: 'run-1', threadId: 'thread-1', setSseWriter: jest.fn() };
            mockAiService.resumeFromCommand.mockResolvedValueOnce(fakeRecord as never);
            const { res } = createMockResponse();

            await controller.streamRun(
                'thread-1',
                { command: { resume: { tool_call_id: 'tc-1', tool_result: 'ok' } } },
                res,
            );

            expect(mockAiService.resumeFromCommand).toHaveBeenCalledWith('thread-1', {
                resume: { tool_call_id: 'tc-1', tool_result: 'ok' },
            });
            expect(mockAiService.startRun).not.toHaveBeenCalled();
            expect(mockAiService.executeRunProtocol).toHaveBeenCalledWith(fakeRecord);
        });

        it('writes invalid_input error when no human message provided', async () => {
            const { res, writes } = createMockResponse();

            await controller.streamRun('thread-1', { input: { messages: [] } }, res);

            expect(mockAiService.startRun).not.toHaveBeenCalled();
            const errorWrite = writes.find(w => w.startsWith('event: error'));
            expect(errorWrite).toBeDefined();
            expect(errorWrite).toContain('invalid_input');
        });

        it('writes execution_error event when service throws', async () => {
            mockAiService.startRun.mockRejectedValueOnce(new Error('LLM blew up'));
            const { res, writes } = createMockResponse();

            await controller.streamRun(
                'thread-1',
                { input: { messages: [{ type: 'human', content: 'hi' }] } },
                res,
            );

            const errorWrite = writes.find(w => w.startsWith('event: error'));
            expect(errorWrite).toBeDefined();
            expect(errorWrite).toContain('execution_error');
            expect(errorWrite).toContain('LLM blew up');
        });
    });

    describe('cancelRun', () => {
        it('delegates to AiChatService.cancel', async () => {
            await controller.cancelRun('thread-1', 'run-1');
            expect(mockAiService.cancel).toHaveBeenCalledWith('run-1');
        });
    });

    describe('joinStream', () => {
        it('delegates to JoinStreamService with parsed since and SSE sink', async () => {
            const { res, writes } = createMockResponse();
            const cleanup = jest.fn();
            mockJoinStreamService.joinStream.mockResolvedValueOnce(cleanup);

            await controller.joinStream('thread-1', 'run-1', '5', res);

            // since parsed to number
            expect(mockJoinStreamService.joinStream).toHaveBeenCalledWith(
                'run-1',
                5,
                expect.objectContaining({
                    push: expect.any(Function),
                    close: expect.any(Function),
                }),
            );

            // sink.push drives writeSSE onto res
            const sink = mockJoinStreamService.joinStream.mock.calls[0][2];
            sink.push({ seq: 6, eventType: 'values', payload: { v: 1 } });
            expect(writes.some(w => w.startsWith('event: values'))).toBe(true);

            // sink.close ends res exactly once
            expect(res.end).not.toHaveBeenCalled();
            sink.close();
            expect(res.end).toHaveBeenCalledTimes(1);
        });

        it('defaults since to 0 when missing or non-numeric', async () => {
            const { res } = createMockResponse();
            mockJoinStreamService.joinStream.mockResolvedValueOnce(jest.fn());

            await controller.joinStream('thread-1', 'run-1', undefined, res);
            expect(mockJoinStreamService.joinStream).toHaveBeenLastCalledWith(
                'run-1',
                0,
                expect.anything(),
            );

            await controller.joinStream('thread-1', 'run-1', 'abc', res);
            expect(mockJoinStreamService.joinStream).toHaveBeenLastCalledWith(
                'run-1',
                0,
                expect.anything(),
            );
        });

        it('treats negative since as 0', async () => {
            const { res } = createMockResponse();
            mockJoinStreamService.joinStream.mockResolvedValueOnce(jest.fn());

            await controller.joinStream('thread-1', 'run-1', '-3', res);
            expect(mockJoinStreamService.joinStream).toHaveBeenLastCalledWith(
                'run-1',
                0,
                expect.anything(),
            );
        });

        it('maps NotFoundException to 404 JSON before stream starts', async () => {
            const { res } = createMockResponse();
            mockJoinStreamService.joinStream.mockRejectedValueOnce(
                new NotFoundException('Run not found: run-1'),
            );

            await controller.joinStream('thread-1', 'run-1', undefined, res);

            expect(res.status).toHaveBeenCalledWith(404);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'not_found' }));
            // SSE error path NOT taken
            expect(res.write).not.toHaveBeenCalled();
        });

        it('writes SSE execution_error event when service throws non-NotFound error', async () => {
            const { res, writes } = createMockResponse();
            mockJoinStreamService.joinStream.mockRejectedValueOnce(new Error('boom'));

            await controller.joinStream('thread-1', 'run-1', undefined, res);

            const errorWrite = writes.find(w => w.startsWith('event: error'));
            expect(errorWrite).toBeDefined();
            expect(errorWrite).toContain('execution_error');
            expect(errorWrite).toContain('boom');
        });

        it('registers res.on(close) cleanup to avoid subscription leak', async () => {
            const { res } = createMockResponse();
            const cleanup = jest.fn();
            mockJoinStreamService.joinStream.mockResolvedValueOnce(cleanup);

            await controller.joinStream('thread-1', 'run-1', undefined, res);

            // res.on('close', ...) registered
            const onClose = (res as unknown as { on: jest.Mock }).on;
            expect(onClose).toHaveBeenCalledWith('close', expect.any(Function));

            // invoking the close handler runs the cleanup returned by the service
            const handler = onClose.mock.calls[0][1];
            handler();
            expect(cleanup).toHaveBeenCalledTimes(1);
        });
    });
});
