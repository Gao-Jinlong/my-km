import { PrismaService } from '../../../../prisma/prisma.service';
import { PrismaMessageStoreProvider } from '../prisma-message-store.provider';

function makeMocks() {
    const create = jest.fn();
    const findMany = jest.fn();
    const aggregate = jest.fn();
    const count = jest.fn();

    const prismaService = {
        message: {
            create,
            findMany,
            aggregate,
            count,
        },
        $transaction: jest.fn(async ops => {
            const results = [];
            for (const op of ops) {
                results.push(await op);
            }
            return results;
        }),
    } as unknown as PrismaService;

    return {
        prismaService,
        create,
        findMany,
        aggregate,
        count,
    };
}

describe('PrismaMessageStoreProvider', () => {
    it('should create a message and return MessageRecord', async () => {
        const mocks = makeMocks();
        mocks.create.mockResolvedValue({
            id: 'msg-1',
            roomId: 'room-1',
            role: 'user',
            content: 'Hello',
            toolCalls: null,
            toolResultId: null,
            tokenCount: null,
            finishReason: null,
            metadata: null,
            createdAt: new Date('2026-01-01'),
        });

        const provider = new PrismaMessageStoreProvider(mocks.prismaService);
        const result = await provider.create({
            roomId: 'room-1',
            role: 'user',
            content: 'Hello',
        });

        expect(result.id).toBe('msg-1');
        expect(result.roomId).toBe('room-1');
        expect(result.role).toBe('user');
        expect(result.content).toBe('Hello');
        expect(result.createdAt).toBeInstanceOf(Date);
    });

    it('should createMany with transaction and return all records', async () => {
        const mocks = makeMocks();
        mocks.create
            .mockResolvedValueOnce({
                id: 'msg-1',
                roomId: 'room-1',
                role: 'assistant',
                content: 'Hi',
                toolCalls: null,
                toolResultId: null,
                tokenCount: null,
                finishReason: null,
                metadata: null,
                createdAt: new Date('2026-01-01'),
            })
            .mockResolvedValueOnce({
                id: 'msg-2',
                roomId: 'room-1',
                role: 'tool',
                content: 'result',
                toolCalls: null,
                toolResultId: 'tc-1',
                tokenCount: null,
                finishReason: null,
                metadata: null,
                createdAt: new Date('2026-01-01'),
            });

        const provider = new PrismaMessageStoreProvider(mocks.prismaService);
        const results = await provider.createMany([
            { roomId: 'room-1', role: 'assistant', content: 'Hi' },
            { roomId: 'room-1', role: 'tool', content: 'result', toolResultId: 'tc-1' },
        ]);

        expect(results).toHaveLength(2);
        expect(results[0].id).toBe('msg-1');
        expect(results[1].id).toBe('msg-2');
    });

    it('should createMany with empty array and return empty', async () => {
        const mocks = makeMocks();
        const provider = new PrismaMessageStoreProvider(mocks.prismaService);
        const results = await provider.createMany([]);
        expect(results).toEqual([]);
    });

    it('should findByRoom with ascending order', async () => {
        const mocks = makeMocks();
        mocks.findMany.mockResolvedValue([
            {
                id: 'msg-1',
                roomId: 'room-1',
                role: 'user',
                content: 'Hello',
                toolCalls: null,
                toolResultId: null,
                tokenCount: null,
                finishReason: null,
                metadata: null,
                createdAt: new Date('2026-01-01'),
            },
            {
                id: 'msg-2',
                roomId: 'room-1',
                role: 'assistant',
                content: 'Hi',
                toolCalls: null,
                toolResultId: null,
                tokenCount: null,
                finishReason: null,
                metadata: null,
                createdAt: new Date('2026-01-02'),
            },
        ]);

        const provider = new PrismaMessageStoreProvider(mocks.prismaService);
        const results = await provider.findByRoom('room-1', { orderBy: 'asc' });

        expect(results).toHaveLength(2);
        expect(mocks.findMany).toHaveBeenCalledWith(
            expect.objectContaining({ where: { roomId: 'room-1' }, orderBy: { createdAt: 'asc' } }),
        );
    });

    it('should findByRoom with limit', async () => {
        const mocks = makeMocks();
        mocks.findMany.mockResolvedValue([
            {
                id: 'msg-1',
                roomId: 'room-1',
                role: 'user',
                content: 'Hello',
                toolCalls: null,
                toolResultId: null,
                tokenCount: null,
                finishReason: null,
                metadata: null,
                createdAt: new Date('2026-01-01'),
            },
        ]);

        const provider = new PrismaMessageStoreProvider(mocks.prismaService);
        await provider.findByRoom('room-1', { limit: 1 });

        expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 1 }));
    });

    it('should aggregateTokens returning sum', async () => {
        const mocks = makeMocks();
        mocks.aggregate.mockResolvedValue({ _sum: { tokenCount: 42 } });

        const provider = new PrismaMessageStoreProvider(mocks.prismaService);
        const result = await provider.aggregateTokens('room-1');

        expect(result).toBe(42);
    });

    it('should aggregateTokens returning 0 when no tokens', async () => {
        const mocks = makeMocks();
        mocks.aggregate.mockResolvedValue({ _sum: { tokenCount: null } });

        const provider = new PrismaMessageStoreProvider(mocks.prismaService);
        const result = await provider.aggregateTokens('room-1');

        expect(result).toBe(0);
    });

    it('should healthCheck return true on success', async () => {
        const mocks = makeMocks();
        mocks.count.mockResolvedValue(1);

        const provider = new PrismaMessageStoreProvider(mocks.prismaService);
        const result = await provider.healthCheck();

        expect(result).toBe(true);
    });

    it('should healthCheck return false on failure', async () => {
        const mocks = makeMocks();
        mocks.count.mockRejectedValue(new Error('DB down'));

        const provider = new PrismaMessageStoreProvider(mocks.prismaService);
        const result = await provider.healthCheck();

        expect(result).toBe(false);
    });

    it('should map toolCalls from Prisma JsonValue', async () => {
        const mocks = makeMocks();
        const toolCallData = [{ id: 'tc-1', name: 'search', arguments: { q: 'test' } }];
        mocks.create.mockResolvedValue({
            id: 'msg-1',
            roomId: 'room-1',
            role: 'assistant',
            content: 'Let me search',
            toolCalls: toolCallData,
            toolResultId: null,
            tokenCount: null,
            finishReason: null,
            metadata: null,
            createdAt: new Date('2026-01-01'),
        });

        const provider = new PrismaMessageStoreProvider(mocks.prismaService);
        const result = await provider.create({
            roomId: 'room-1',
            role: 'assistant',
            content: 'Let me search',
            toolCalls: [
                { id: 'tc-1', name: 'search', arguments: { q: 'test' }, timestamp: new Date() },
            ],
        });

        expect(result.toolCalls).toEqual(toolCallData);
    });
});
