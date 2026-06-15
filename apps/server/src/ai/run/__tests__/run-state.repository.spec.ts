import { Test, type TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../prisma/prisma.service';
import { RunStateRepository } from '../run-state.repository';

function createMockPrisma(): PrismaService {
    return {
        run: {
            findUnique: jest.fn(),
            findFirst: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            updateMany: jest.fn(),
        },
    } as unknown as PrismaService;
}

describe('RunStateRepository', () => {
    let repo: RunStateRepository;
    let prisma: PrismaService;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                RunStateRepository,
                { provide: PrismaService, useFactory: createMockPrisma },
            ],
        }).compile();
        repo = module.get(RunStateRepository);
        prisma = module.get(PrismaService);
    });

    describe('findById', () => {
        it('returns run row by id', async () => {
            (prisma.run.findUnique as jest.Mock).mockResolvedValue({ id: 'r1', status: 'running' });
            const row = await repo.findById('r1');
            expect(row?.id).toBe('r1');
            expect(prisma.run.findUnique).toHaveBeenCalledWith({ where: { id: 'r1' } });
        });
    });

    describe('findActiveRunByThread', () => {
        it('queries active runs ordered by newest', async () => {
            (prisma.run.findFirst as jest.Mock).mockResolvedValue({ id: 'r1', threadId: 't1' });
            const row = await repo.findActiveRunByThread('t1');
            expect(row?.id).toBe('r1');
            expect(prisma.run.findFirst).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: {
                        threadId: 't1',
                        status: { in: ['pending', 'running', 'interrupted'] },
                    },
                    orderBy: { createdAt: 'desc' },
                }),
            );
        });
    });

    describe('createRun', () => {
        it('persists all authoritative fields', async () => {
            (prisma.run.create as jest.Mock).mockResolvedValue({ id: 'r1' });
            await repo.createRun({
                id: 'r1',
                threadId: 't1',
                status: 'pending',
                model: 'glm-5',
                provider: 'zhipu',
                inputKind: 'message',
                content: 'hi',
                requestContext: { selectedText: 'x' },
                llmConfig: { provider: 'zhipu', model: 'glm-5' },
                ownerId: 'replica-A',
                leaseUntil: expect.any(Date),
                traceId: 'trace-1',
            });
            expect(prisma.run.create).toHaveBeenCalledWith({
                data: expect.objectContaining({
                    id: 'r1',
                    inputKind: 'message',
                    content: 'hi',
                    ownerId: 'replica-A',
                    lastSeq: 0,
                }),
            });
        });
    });

    describe('setStatus', () => {
        it('sets startedAt when running', async () => {
            await repo.setStatus('r1', 'running');
            expect(prisma.run.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { id: 'r1' },
                    data: expect.objectContaining({ status: 'running' }),
                }),
            );
            const data = (prisma.run.update as jest.Mock).mock.calls[0][0].data;
            expect(data.startedAt).toBeInstanceOf(Date);
        });

        it('sets completedAt for terminal statuses', async () => {
            await repo.setStatus('r1', 'completed');
            const data = (prisma.run.update as jest.Mock).mock.calls[0][0].data;
            expect(data.completedAt).toBeInstanceOf(Date);
        });
    });

    describe('saveResumePayload', () => {
        it('writes resumePayload', async () => {
            await repo.saveResumePayload('r1', { tool_call_id: 'tc-1' });
            expect(prisma.run.update).toHaveBeenCalledWith({
                where: { id: 'r1' },
                data: { resumePayload: { tool_call_id: 'tc-1' } },
            });
        });
    });

    describe('updateLastSeq', () => {
        it('writes lastSeq', async () => {
            await repo.updateLastSeq('r1', 42);
            expect(prisma.run.update).toHaveBeenCalledWith({
                where: { id: 'r1' },
                data: { lastSeq: 42 },
            });
        });
    });
});
