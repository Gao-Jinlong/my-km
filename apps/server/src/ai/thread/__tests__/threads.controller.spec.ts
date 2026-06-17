/**
 * ThreadsController（瘦身版）单测
 *
 * 验证 Thread CRUD + getThreadState 是纯路由：
 *   - createThread / searchThreads / getThread / updateThread / deleteThread / getThreadState
 *   - 通过 mapper 转换，不直接碰 SSE/Run 逻辑
 *
 * Mock ThreadService / CheckpointReaderService。
 */
import { NotFoundException } from '@nestjs/common';
import type { CheckpointReaderService } from '../../checkpointer/checkpoint-reader.service';
import type { ThreadService } from '../thread.service';
import { ThreadsController } from '../threads.controller';

jest.mock('@langchain/langgraph', () => ({
    StateGraph: jest.fn(),
    START: '__start__',
    END: '__end__',
    Annotation: { Root: jest.fn() },
}));

jest.mock('@langchain/langgraph-checkpoint', () => ({
    MemorySaver: jest.fn().mockImplementation(() => ({ type: 'MemorySaver' })),
}));

const sampleThread = {
    id: 'thread-1',
    title: 'Hello',
    status: 'active',
    model: 'gpt-4',
    provider: 'openai',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
};

describe('ThreadsController (slim)', () => {
    let controller: ThreadsController;
    let mockThreadService: jest.Mocked<ThreadService>;
    let mockCheckpointReader: jest.Mocked<CheckpointReaderService>;

    beforeEach(() => {
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

        controller = new ThreadsController(mockThreadService, mockCheckpointReader);
    });

    describe('createThread', () => {
        it('extracts title from metadata.title and converts to LangGraph format', async () => {
            const result = await controller.createThread({
                metadata: { title: 'My Thread' },
                thread_id: 'tid-1',
            });
            expect(mockThreadService.create).toHaveBeenCalledWith({ id: 'tid-1', title: 'My Thread' });
            expect(result.thread_id).toBe('thread-1');
            expect(result.status).toBe('idle');
        });

        it('handles missing metadata gracefully', async () => {
            const result = await controller.createThread({});
            expect(mockThreadService.create).toHaveBeenCalledWith({ id: undefined, title: undefined });
            expect(result.thread_id).toBe('thread-1');
        });
    });

    describe('searchThreads', () => {
        it('passes limit and offset with defaults', async () => {
            await controller.searchThreads({});
            expect(mockThreadService.findAll).toHaveBeenCalledWith({ limit: 10, offset: 0 });
        });

        it('returns LangGraph-formatted threads', async () => {
            const result = await controller.searchThreads({});
            expect(result[0].thread_id).toBe('thread-1');
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

    describe('updateThread', () => {
        it('extracts title and updates', async () => {
            await controller.updateThread('thread-1', { metadata: { title: 'New' } });
            expect(mockThreadService.update).toHaveBeenCalledWith('thread-1', { title: 'New' });
        });
    });

    describe('deleteThread', () => {
        it('delegates to threadService.delete', async () => {
            await controller.deleteThread('thread-1');
            expect(mockThreadService.delete).toHaveBeenCalledWith('thread-1');
        });
    });

    describe('getThreadState', () => {
        it('delegates to checkpointReader.getThreadState', async () => {
            await controller.getThreadState('thread-1');
            expect(mockCheckpointReader.getThreadState).toHaveBeenCalledWith('thread-1');
        });
    });
});
