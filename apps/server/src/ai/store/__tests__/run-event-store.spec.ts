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
        it('should append a single event', async () => {
            const result = await store.append('run-1', 'thread-1', {
                eventType: 'lifecycle',
                eventName: 'started',
                seq: 0,
                payload: { event: 'started', timestamp: 1000 },
            });
            expect(result).toEqual(mockEvent);
            expect(prisma.runEvent.create).toHaveBeenCalledWith({
                data: {
                    runId: 'run-1',
                    threadId: 'thread-1',
                    seq: 0,
                    eventType: 'lifecycle',
                    eventName: 'started',
                    payload: { event: 'started', timestamp: 1000 },
                },
            });
        });

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
