import { Test, type TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../prisma/prisma.service';
import { RunEventStore } from '../run-event-store';

describe('RunEventStore', () => {
    let store: RunEventStore;
    let prisma: PrismaService;

    const mockEvent = {
        id: 1,
        runId: 'run-1',
        threadId: 'thread-1',
        seq: 0,
        eventType: 'lifecycle',
        eventName: 'started',
        payload: { event: 'started', timestamp: 1000 },
        createdAt: new Date(),
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                RunEventStore,
                {
                    provide: PrismaService,
                    useValue: {
                        runEvent: {
                            create: jest.fn().mockResolvedValue(mockEvent),
                            createMany: jest.fn().mockResolvedValue({ count: 2 }),
                            findMany: jest.fn().mockResolvedValue([mockEvent]),
                            deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
                        },
                    },
                },
            ],
        }).compile();

        store = module.get<RunEventStore>(RunEventStore);
        prisma = module.get<PrismaService>(PrismaService);
    });

    describe('append', () => {
        it('should buffer events without immediately writing to DB', async () => {
            await store.append('run-1', 'thread-1', {
                eventType: 'lifecycle',
                eventName: 'started',
                seq: 0,
                payload: { event: 'started' },
            });

            // Should NOT have called create (buffered, not flushed)
            expect(prisma.runEvent.create).not.toHaveBeenCalled();
            expect(prisma.runEvent.createMany).not.toHaveBeenCalled();
        });

        it('should auto-flush when buffer reaches threshold', async () => {
            // FLUSH_THRESHOLD is 10
            for (let i = 0; i < 10; i++) {
                await store.append('run-1', 'thread-1', {
                    eventType: 'values',
                    eventName: '',
                    seq: i,
                    payload: { seq: i },
                });
            }

            // Should have flushed via createMany
            expect(prisma.runEvent.createMany).toHaveBeenCalledTimes(1);
            expect(prisma.runEvent.createMany).toHaveBeenCalledWith({
                data: expect.arrayContaining([
                    expect.objectContaining({ runId: 'run-1', seq: 0 }),
                    expect.objectContaining({ runId: 'run-1', seq: 9 }),
                ]),
            });
        });
    });

    describe('flushRun', () => {
        it('should flush buffered events for a specific run', async () => {
            await store.append('run-1', 'thread-1', {
                eventType: 'metadata',
                eventName: '',
                seq: 0,
                payload: { run_id: 'run-1' },
            });
            await store.append('run-1', 'thread-1', {
                eventType: 'values',
                eventName: '',
                seq: 1,
                payload: { messages: [] },
            });

            // Not yet flushed
            expect(prisma.runEvent.createMany).not.toHaveBeenCalled();

            await store.flushRun('run-1');

            expect(prisma.runEvent.createMany).toHaveBeenCalledWith({
                data: [
                    expect.objectContaining({ eventType: 'metadata', seq: 0 }),
                    expect.objectContaining({ eventType: 'values', seq: 1 }),
                ],
            });
        });

        it('should do nothing when no buffered events for run', async () => {
            await store.flushRun('nonexistent-run');
            expect(prisma.runEvent.createMany).not.toHaveBeenCalled();
        });

        it('should keep buffer on flush failure for retry', async () => {
            (prisma.runEvent.createMany as jest.Mock).mockRejectedValueOnce(new Error('DB down'));

            await store.append('run-1', 'thread-1', {
                eventType: 'metadata',
                eventName: '',
                seq: 0,
                payload: {},
            });
            await store.flushRun('run-1');

            // Failed flush should keep buffer entry
            // A second flush should retry
            await store.flushRun('run-1');
            expect(prisma.runEvent.createMany).toHaveBeenCalledTimes(2);
        });
    });

    describe('flushAll', () => {
        it('should flush all buffered runs', async () => {
            await store.append('run-1', 'thread-1', {
                eventType: 'metadata',
                eventName: '',
                seq: 0,
                payload: {},
            });
            await store.append('run-2', 'thread-1', {
                eventType: 'metadata',
                eventName: '',
                seq: 0,
                payload: {},
            });

            await store.flushAll();

            expect(prisma.runEvent.createMany).toHaveBeenCalledTimes(2);
        });
    });

    describe('appendBatch', () => {
        it('should accept a batch of events', async () => {
            const events = [
                { eventType: 'lifecycle', eventName: 'started', seq: 0, payload: {} },
                { eventType: 'messages', eventName: 'content-block-delta', seq: 1, payload: {} },
            ];
            await store.appendBatch('run-1', 'thread-1', events);
            expect(prisma.runEvent.createMany).toHaveBeenCalledWith({
                data: events.map(e => ({
                    runId: 'run-1',
                    threadId: 'thread-1',
                    ...e,
                })),
            });
        });

        it('should return count 0 for empty batch', async () => {
            const result = await store.appendBatch('run-1', 'thread-1', []);
            expect(result).toEqual({ count: 0 });
        });
    });

    describe('replay', () => {
        it('should return all events for a run', async () => {
            const result = await store.replay('run-1');
            expect(result).toEqual([mockEvent]);
            expect(prisma.runEvent.findMany).toHaveBeenCalledWith({
                where: { runId: 'run-1' },
                orderBy: { seq: 'asc' },
            });
        });

        it('should support pagination', async () => {
            await store.getEvents('run-1', { offset: 10, limit: 20 });
            expect(prisma.runEvent.findMany).toHaveBeenCalledWith({
                where: { runId: 'run-1' },
                orderBy: { seq: 'asc' },
                skip: 10,
                take: 20,
            });
        });
    });

    describe('cleanup', () => {
        it('should delete events older than maxAge', async () => {
            await store.cleanup(3600);
            expect(prisma.runEvent.deleteMany).toHaveBeenCalledWith({
                where: {
                    createdAt: {
                        lt: expect.any(Date),
                    },
                },
            });
        });
    });
});
