import { Test, type TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../prisma/prisma.service';
import type { ThreadStatus } from '../../types/thread.types';
import { ThreadService } from '../thread.service';

describe('ThreadService', () => {
    let service: ThreadService;
    let prisma: PrismaService;

    const mockThread = {
        id: 'thread-1',
        userId: null,
        title: 'Test Thread',
        status: 'active',
        model: null,
        provider: null,
        messageCount: 0,
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
    };

    const createMock = {
        id: 'new-thread',
        userId: null,
        title: 'New Thread',
        status: 'active',
        model: null,
        provider: null,
        messageCount: 0,
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                ThreadService,
                {
                    provide: PrismaService,
                    useValue: {
                        thread: {
                            create: jest.fn().mockResolvedValue(createMock),
                            findUnique: jest.fn().mockResolvedValue(mockThread),
                            findMany: jest.fn().mockResolvedValue([mockThread]),
                            update: jest.fn().mockResolvedValue({
                                ...mockThread,
                                title: 'Updated',
                            }),
                            delete: jest.fn().mockResolvedValue(mockThread),
                            count: jest.fn().mockResolvedValue(1),
                        },
                    },
                },
            ],
        }).compile();

        service = module.get<ThreadService>(ThreadService);
        prisma = module.get<PrismaService>(PrismaService);
    });

    describe('create', () => {
        it('should create a thread with given options', async () => {
            const result = await service.create({ title: 'New Thread' });
            expect(result).toEqual(createMock);
            expect(prisma.thread.create).toHaveBeenCalledWith({
                data: expect.objectContaining({
                    title: 'New Thread',
                    status: 'active',
                }),
            });
        });

        it('should create a thread with client-generated ID', async () => {
            await service.create({ id: 'client-id' });
            expect(prisma.thread.create).toHaveBeenCalledWith({
                data: expect.objectContaining({ id: 'client-id' }),
            });
        });

        it('should create thread with optional model/provider config', async () => {
            await service.create({ model: 'claude-4', provider: 'anthropic' });
            expect(prisma.thread.create).toHaveBeenCalledWith({
                data: expect.objectContaining({
                    model: 'claude-4',
                    provider: 'anthropic',
                }),
            });
        });
    });

    describe('findById', () => {
        it('should find a thread by ID', async () => {
            const result = await service.findById('thread-1');
            expect(result).toEqual(mockThread);
            expect(prisma.thread.findUnique).toHaveBeenCalledWith({
                where: { id: 'thread-1' },
            });
        });

        it('should return null when thread not found', async () => {
            jest.spyOn(prisma.thread, 'findUnique').mockResolvedValue(null);
            const result = await service.findById('nonexistent');
            expect(result).toBeNull();
        });
    });

    describe('findAll', () => {
        it('should list active threads with default pagination', async () => {
            const result = await service.findAll();
            expect(result).toHaveLength(1);
            expect(prisma.thread.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { status: 'active' },
                    take: 50,
                    skip: 0,
                }),
            );
        });

        it('should list threads with custom pagination and status filter', async () => {
            await service.findAll({ limit: 10, offset: 5, status: 'archived' as ThreadStatus });
            expect(prisma.thread.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { status: 'archived' },
                    take: 10,
                    skip: 5,
                }),
            );
        });
    });

    describe('findByUserId', () => {
        it('should list threads by user ID', async () => {
            await service.findByUserId('user-1');
            expect(prisma.thread.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({ userId: 'user-1' }),
                }),
            );
        });
    });

    describe('update', () => {
        it('should update thread metadata', async () => {
            await service.update('thread-1', { title: 'Updated' });
            expect(prisma.thread.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { id: 'thread-1' },
                    data: expect.objectContaining({ title: 'Updated' }),
                }),
            );
        });
    });

    describe('archive', () => {
        it('should set thread status to archived', async () => {
            await service.archive('thread-1');
            expect(prisma.thread.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { id: 'thread-1' },
                    data: { status: 'archived' },
                }),
            );
        });
    });

    describe('delete', () => {
        it('should soft-delete a thread', async () => {
            jest.spyOn(prisma.thread, 'update').mockResolvedValue({
                ...mockThread,
                status: 'deleted',
            });
            await service.delete('thread-1');
            expect(prisma.thread.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { id: 'thread-1' },
                    data: { status: 'deleted' },
                }),
            );
        });
    });

    describe('getStats', () => {
        it('should return thread statistics', async () => {
            jest.spyOn(prisma.thread, 'count').mockResolvedValue(5);
            const result = await service.getStats();
            expect(result).toEqual({ total: 5, active: 5 });
        });
    });
});
