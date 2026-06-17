/**
 * AiChatService.streamRun / joinStream 单测
 *
 * Mock 全部依赖，验证：
 *   - resume vs 新 run 路由
 *   - SSE 胶水（setSseHeaders/writeSSE/sendProtocolError/res.end/res.on）
 *   - 错误码映射（invalid_input / busy / execution_error）
 *   - sink register/unregister 生命周期
 */
import { ConflictException, NotFoundException } from '@nestjs/common';
import type { Response } from 'express';
import type { JoinStreamService } from '../run/join-stream.service';
import type { RunRecord } from '../run/run-record';
import { AiChatService } from '../ai.service';

// mock langgraph ESM 依赖（ai.service.ts → checkpointer → langgraph-checkpoint → uuid ESM 会崩）
jest.mock('@langchain/langgraph', () => ({
    StateGraph: jest.fn().mockReturnValue({
        addNode: jest.fn().mockReturnThis(),
        addEdge: jest.fn().mockReturnThis(),
        addConditionalEdges: jest.fn().mockReturnThis(),
        compile: jest.fn(),
    }),
    START: '__start__',
    END: '__end__',
    Annotation: { Root: jest.fn().mockReturnValue({}) },
    Command: jest.fn(),
}));

jest.mock('@langchain/langgraph-checkpoint', () => ({
    MemorySaver: jest.fn().mockImplementation(() => ({ type: 'MemorySaver' })),
}));

jest.mock('../langgraph/graphs/chat-graph', () => ({
    ChatGraph: jest.fn().mockImplementation(() => ({
        name: 'chat',
        createGraph: jest.fn().mockReturnValue({
            compile: jest.fn().mockReturnValue({ type: 'compiled-graph', stream: jest.fn() }),
        }),
    })),
}));

function createMockResponse(): { res: Response; writes: string[] } {
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
        on: jest.fn(),
    } as unknown as Response;
    return { res, writes };
}

interface MockDeps {
    startRun?: jest.Mock;
    resumeFromCommand?: jest.Mock;
    executeRunProtocol?: jest.Mock;
    cancel?: jest.Mock;
    joinStreamService?: Partial<JoinStreamService>;
}

function makeService(deps: MockDeps = {}) {
    const record = {
        registerSink: jest.fn().mockImplementation(sink => {
            queueMicrotask(() => {
                sink.push({ eventType: 'values', payload: { messages: [] }, seq: 1 });
            });
            return jest.fn();
        }),
        emitEvent: jest.fn().mockResolvedValue(undefined),
        emitSSEOnly: jest.fn(),
    } as unknown as RunRecord;

    const startRun = deps.startRun ?? jest.fn().mockResolvedValue(record);
    const resumeFromCommand = deps.resumeFromCommand ?? jest.fn().mockResolvedValue(record);
    const executeRunProtocol = deps.executeRunProtocol ?? jest.fn().mockResolvedValue(undefined);

    // 使用真实原型，使 streamRun/joinStream 这两个门面方法走真实实现；
    // 依赖方法（startRun/resumeFromCommand/executeRunProtocol/joinStreamService）
    // 作为实例属性覆盖，这样门面方法内部 this.startRun 等会命中 mock。
    const service = Object.create(AiChatService.prototype) as AiChatService;
    (service as unknown as Record<string, unknown>).startRun = startRun;
    (service as unknown as Record<string, unknown>).resumeFromCommand = resumeFromCommand;
    (service as unknown as Record<string, unknown>).executeRunProtocol = executeRunProtocol;
    (service as unknown as Record<string, unknown>).cancel = deps.cancel ?? jest.fn();
    (service as unknown as Record<string, unknown>).joinStreamService = {
        lookupRun: deps.joinStreamService?.lookupRun ?? jest.fn().mockResolvedValue(undefined),
        joinStream: deps.joinStreamService?.joinStream ?? jest.fn().mockResolvedValue(jest.fn()),
    };
    // streamRun 内部用 this.logger.error
    (service as unknown as { logger: { error: jest.Mock } }).logger = { error: jest.fn() };

    return { service, record, startRun, resumeFromCommand, executeRunProtocol };
}

describe('AiChatService.streamRun', () => {
    it('routes to resumeFromCommand when command.resume present', async () => {
        const { service, resumeFromCommand, startRun } = makeService({});
        const { res } = createMockResponse();
        await service.streamRun({ threadId: 't1', command: { resume: 'x' } }, res);
        expect(resumeFromCommand).toHaveBeenCalledWith('t1', { resume: 'x' });
        expect(startRun).not.toHaveBeenCalled();
    });

    it('writes invalid_input error frame when input has no human message', async () => {
        const { service } = makeService({});
        const { res, writes } = createMockResponse();
        await service.streamRun({ threadId: 't1', input: { messages: [] } }, res);
        expect(writes.join('')).toContain('"error":"invalid_input"');
        expect(res.end).toHaveBeenCalled();
    });

    it('writes busy error frame on ConflictException from startRun', async () => {
        const { service } = makeService({
            startRun: jest.fn().mockRejectedValue(new ConflictException('busy')),
        });
        const { res, writes } = createMockResponse();
        await service.streamRun(
            { threadId: 't1', input: { messages: [{ type: 'human', content: 'hi' }] } },
            res,
        );
        expect(writes.join('')).toContain('"error":"busy"');
    });

    it('sets SSE headers then registers sink and executes run protocol', async () => {
        const { service, record, executeRunProtocol } = makeService({});
        const { res } = createMockResponse();
        await service.streamRun(
            { threadId: 't1', input: { messages: [{ type: 'human', content: 'hi' }] } },
            res,
        );
        expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
        expect(res.flushHeaders).toHaveBeenCalled();
        expect(record.registerSink).toHaveBeenCalled();
        expect(executeRunProtocol).toHaveBeenCalled();
    });

    it('unregisters sink in finally even when executeRunProtocol throws', async () => {
        const unregister = jest.fn();
        const record = {
            registerSink: jest.fn().mockReturnValue(unregister),
            emitEvent: jest.fn(),
            emitSSEOnly: jest.fn(),
        } as unknown as RunRecord;
        const { service } = makeService({
            startRun: jest.fn().mockResolvedValue(record),
            executeRunProtocol: jest.fn().mockRejectedValue(new Error('LLM blew up')),
        });
        const { res } = createMockResponse();
        await service.streamRun(
            { threadId: 't1', input: { messages: [{ type: 'human', content: 'hi' }] } },
            res,
        );
        expect(unregister).toHaveBeenCalled();
    });

    it('writes execution_error frame for unknown error', async () => {
        const { service } = makeService({
            startRun: jest.fn().mockRejectedValue(new Error('LLM blew up')),
        });
        const { res, writes } = createMockResponse();
        await service.streamRun(
            { threadId: 't1', input: { messages: [{ type: 'human', content: 'hi' }] } },
            res,
        );
        expect(writes.join('')).toContain('"error":"execution_error"');
    });

    it('ends response in finally if not already ended', async () => {
        const { service } = makeService({});
        const { res } = createMockResponse();
        await service.streamRun(
            { threadId: 't1', input: { messages: [{ type: 'human', content: 'hi' }] } },
            res,
        );
        expect(res.end).toHaveBeenCalled();
    });
});

describe('AiChatService.joinStream', () => {
    it('propagates NotFoundException before flushing headers (404 must be JSON)', async () => {
        const { service } = makeService({
            joinStreamService: {
                lookupRun: jest.fn().mockRejectedValue(new NotFoundException('run not found')),
            },
        });
        const { res } = createMockResponse();
        await expect(service.joinStream('r1', 0, res)).rejects.toThrow(NotFoundException);
        expect(res.setHeader).not.toHaveBeenCalled();
    });

    it('sets SSE headers after lookup succeeds and delegates to joinStreamService', async () => {
        const joinStream = jest.fn().mockResolvedValue(jest.fn());
        const { service } = makeService({
            joinStreamService: {
                lookupRun: jest.fn().mockResolvedValue(undefined),
                joinStream,
            },
        });
        const { res } = createMockResponse();
        await service.joinStream('r1', 5, res);
        expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
        expect(joinStream).toHaveBeenCalledTimes(1);
        const sinkArg = joinStream.mock.calls[0][2];
        expect(sinkArg).toHaveProperty('push');
        expect(sinkArg).toHaveProperty('close');
    });

    it('registers cleanup on res close', async () => {
        const { service } = makeService({});
        const { res } = createMockResponse();
        await service.joinStream('r1', 0, res);
        expect(res.on).toHaveBeenCalledWith('close', expect.any(Function));
    });

    it('writes execution_error frame when joinStream throws mid-stream', async () => {
        const { service } = makeService({
            joinStreamService: {
                lookupRun: jest.fn().mockResolvedValue(undefined),
                joinStream: jest.fn().mockRejectedValue(new Error('boom')),
            },
        });
        const { res, writes } = createMockResponse();
        await service.joinStream('r1', 0, res);
        expect(writes.join('')).toContain('"error":"execution_error"');
    });
});
