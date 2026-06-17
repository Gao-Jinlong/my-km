/**
 * RunsController 单测 — 验证 controller 是纯路由
 *
 * 覆盖：
 *   - listRuns / getRun 转发 RunQueryService
 *   - streamRun 转发 aiService.streamRun（不 catch）
 *   - cancelRun 的 204/202 分支（依赖 replicaId）
 *   - joinStream 仅 catch NotFoundException（404 前置）+ since 解析
 */
import { NotFoundException } from '@nestjs/common';
import type { Response } from 'express';
import type { AiChatService } from '../../ai.service';
import type { RunQueryService } from '../run-query.service';
import { RunsController } from '../runs.controller';

jest.mock('@langchain/langgraph', () => ({
    StateGraph: jest.fn(),
    START: '__start__',
    END: '__end__',
    Annotation: { Root: jest.fn() },
}));

jest.mock('@langchain/langgraph-checkpoint', () => ({
    MemorySaver: jest.fn().mockImplementation(() => ({ type: 'MemorySaver' })),
}));

jest.mock('../../langgraph/graphs/chat-graph', () => ({
    ChatGraph: jest.fn().mockImplementation(() => ({
        name: 'chat',
        createGraph: jest.fn(),
    })),
}));

function createMockResponse(): Response {
    return {
        writableEnded: false,
        write: jest.fn().mockReturnValue(true),
        end: jest.fn(),
        setHeader: jest.fn(),
        flushHeaders: jest.fn(),
        on: jest.fn(),
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
    } as unknown as Response;
}

describe('RunsController', () => {
    let controller: RunsController;
    let mockRunQuery: jest.Mocked<RunQueryService>;
    let mockAiService: jest.Mocked<AiChatService>;

    const sampleRun = {
        id: 'run-1',
        threadId: 'thread-1',
        status: 'completed',
        model: 'gpt-4',
        provider: 'openai',
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        startedAt: null,
        completedAt: null,
        createdAt: new Date('2026-01-01T00:00:00Z'),
    };

    beforeEach(() => {
        mockRunQuery = {
            listByThread: jest.fn().mockResolvedValue([sampleRun]),
            findById: jest.fn().mockResolvedValue(sampleRun),
        } as unknown as jest.Mocked<RunQueryService>;

        mockAiService = {
            streamRun: jest.fn().mockResolvedValue(undefined),
            joinStream: jest.fn().mockResolvedValue(undefined),
            cancel: jest.fn().mockResolvedValue({ accepted: true, ownerId: 'replica-test' }),
        } as unknown as jest.Mocked<AiChatService>;

        controller = new RunsController(mockAiService, mockRunQuery, 'replica-test');
    });

    describe('listRuns', () => {
        it('delegates to runQuery.listByThread and maps to DTO', async () => {
            const result = await controller.listRuns('thread-1');
            expect(mockRunQuery.listByThread).toHaveBeenCalledWith('thread-1');
            expect(result).toHaveLength(1);
            expect(result[0].id).toBe('run-1');
        });
    });

    describe('getRun', () => {
        it('returns mapped DTO when found', async () => {
            const result = await controller.getRun('thread-1', 'run-1');
            expect(mockRunQuery.findById).toHaveBeenCalledWith('run-1');
            expect(result.id).toBe('run-1');
        });

        it('throws NotFoundException when not found', async () => {
            mockRunQuery.findById.mockResolvedValueOnce(null);
            await expect(controller.getRun('thread-1', 'missing')).rejects.toThrow(NotFoundException);
        });
    });

    describe('streamRun', () => {
        it('forwards merged command to aiService.streamRun, no catch', async () => {
            const res = createMockResponse();
            const body = {
                input: { messages: [{ type: 'human', content: 'hi' }] },
                context: { foo: 'bar' },
            };
            await controller.streamRun('thread-1', body, res);
            expect(mockAiService.streamRun).toHaveBeenCalledWith(
                {
                    threadId: 'thread-1',
                    input: body.input,
                    context: body.context,
                },
                res,
            );
            expect(mockAiService.streamRun).toHaveBeenCalledTimes(1);
        });
    });

    describe('cancelRun', () => {
        it('returns 204 when ownerId matches replicaId (本副本 owner)', async () => {
            const res = createMockResponse();
            mockAiService.cancel.mockResolvedValueOnce({ accepted: true, ownerId: 'replica-test' });
            await controller.cancelRun('thread-1', 'run-1', res);
            expect(res.status).toHaveBeenCalledWith(204);
            expect(res.end).toHaveBeenCalled();
        });

        it('returns 202 when ownerId differs (已转发给 owner)', async () => {
            const res = createMockResponse();
            mockAiService.cancel.mockResolvedValueOnce({
                accepted: true,
                ownerId: 'other-replica',
            });
            await controller.cancelRun('thread-1', 'run-1', res);
            expect(res.status).toHaveBeenCalledWith(202);
            expect(res.json).toHaveBeenCalledWith({ accepted: true, ownerId: 'other-replica' });
        });
    });

    describe('joinStream', () => {
        it('parses since numeric string', async () => {
            const res = createMockResponse();
            await controller.joinStream('thread-1', 'run-1', '10', res);
            expect(mockAiService.joinStream).toHaveBeenCalledWith('run-1', 10, res);
        });

        it('defaults since to 0 when undefined', async () => {
            const res = createMockResponse();
            await controller.joinStream('thread-1', 'run-1', undefined, res);
            expect(mockAiService.joinStream).toHaveBeenCalledWith('run-1', 0, res);
        });

        it('defaults since to 0 when non-numeric', async () => {
            const res = createMockResponse();
            await controller.joinStream('thread-1', 'run-1', 'abc', res);
            expect(mockAiService.joinStream).toHaveBeenCalledWith('run-1', 0, res);
        });

        it('returns 404 JSON before flush when service throws NotFoundException', async () => {
            const res = createMockResponse();
            mockAiService.joinStream.mockRejectedValueOnce(new NotFoundException('run not found'));
            await controller.joinStream('thread-1', 'run-1', '0', res);
            expect(res.status).toHaveBeenCalledWith(404);
            expect(res.json).toHaveBeenCalled();
            // SSE 头未设（flush 前 404）
            expect(res.setHeader).not.toHaveBeenCalled();
        });

        it('does not double-handle when res already ended (service wrote error frame)', async () => {
            const res = createMockResponse();
            (res as { writableEnded: boolean }).writableEnded = true;
            mockAiService.joinStream.mockRejectedValueOnce(new NotFoundException('late'));
            await controller.joinStream('thread-1', 'run-1', '0', res);
            // res 已 ended，不应再 status/json
            expect(res.status).not.toHaveBeenCalled();
        });
    });
});
