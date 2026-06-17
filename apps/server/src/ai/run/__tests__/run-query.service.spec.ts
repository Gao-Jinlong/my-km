import type { PrismaService } from '../../../prisma/prisma.service';
import { RunQueryService } from '../run-query.service';

function mockPrisma(runs: unknown[]) {
    return {
        run: {
            findMany: jest.fn().mockResolvedValue(runs),
            findUnique: jest.fn().mockResolvedValue(runs[0] ?? null),
        },
    } as unknown as PrismaService;
}

describe('RunQueryService', () => {
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

    describe('listByThread', () => {
        it('queries runs by threadId ordered desc, default limit 50', async () => {
            const prisma = mockPrisma([sampleRun]);
            const service = new RunQueryService(prisma);
            const result = await service.listByThread('thread-1');
            expect(prisma.run.findMany).toHaveBeenCalledWith({
                where: { threadId: 'thread-1' },
                orderBy: { createdAt: 'desc' },
                take: 50,
            });
            expect(result).toEqual([sampleRun]);
        });

        it('honors custom limit', async () => {
            const prisma = mockPrisma([sampleRun]);
            const service = new RunQueryService(prisma);
            await service.listByThread('thread-1', 10);
            expect(prisma.run.findMany).toHaveBeenCalledWith(
                expect.objectContaining({ take: 10 }),
            );
        });
    });

    describe('findById', () => {
        it('queries findUnique by id', async () => {
            const prisma = mockPrisma([sampleRun]);
            const service = new RunQueryService(prisma);
            const result = await service.findById('run-1');
            expect(prisma.run.findUnique).toHaveBeenCalledWith({ where: { id: 'run-1' } });
            expect(result).toEqual(sampleRun);
        });

        it('returns null when not found', async () => {
            const prisma = {
                run: { findUnique: jest.fn().mockResolvedValue(null) },
            } as unknown as PrismaService;
            const service = new RunQueryService(prisma);
            expect(await service.findById('missing')).toBeNull();
        });
    });
});
