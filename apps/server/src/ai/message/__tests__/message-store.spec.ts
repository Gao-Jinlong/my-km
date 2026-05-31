import { MessageStoreImpl } from '../message-store.impl';
import type { MessageRecord } from '../message-store.types';
import type { MessageStoreProvider } from '../providers/message-store-provider.interface';

function makeMocks() {
    const provider: jest.Mocked<MessageStoreProvider> = {
        create: jest.fn(),
        createMany: jest.fn(),
        findByRoom: jest.fn(),
        aggregateTokens: jest.fn(),
        healthCheck: jest.fn(),
    };

    // Manually construct the store without NestJS DI
    const store = Object.create(MessageStoreImpl.prototype);
    (store as any).provider = provider;
    (store as any).logger = { debug: jest.fn() };
    (store as any).memory = new Map<string, MessageRecord[]>();
    (store as any).tokenUsage = new Map<string, number>();

    return { store, provider };
}

function makeRecord(overrides: Partial<MessageRecord> = {}): MessageRecord {
    return {
        id: 'msg-1',
        roomId: 'room-1',
        role: 'user',
        content: 'test',
        createdAt: new Date(),
        ...overrides,
    };
}

describe('MessageStoreImpl', () => {
    describe('init', () => {
        it('should load history from provider into memory', async () => {
            const { store, provider } = makeMocks();
            const records = [
                makeRecord({ id: '1', role: 'user', content: 'Hello' }),
                makeRecord({ id: '2', role: 'assistant', content: 'Hi' }),
            ];
            provider.findByRoom.mockResolvedValue(records);
            provider.aggregateTokens.mockResolvedValue(10);

            await store.init('room-1');
            const history = store.buildHistory('room-1');

            expect(provider.findByRoom).toHaveBeenCalledWith('room-1', { orderBy: 'asc' });
            expect(history).toHaveLength(2);
            expect(store.getTokenUsage('room-1')).toBe(10);
        });

        it('should trim history when maxTokens is specified', async () => {
            const { store, provider } = makeMocks();
            const records = [
                makeRecord({ id: '1', role: 'user', content: 'a'.repeat(100), tokenCount: 25 }),
                makeRecord({
                    id: '2',
                    role: 'assistant',
                    content: 'b'.repeat(100),
                    tokenCount: 25,
                }),
                makeRecord({ id: '3', role: 'user', content: 'c'.repeat(100), tokenCount: 25 }),
            ];
            provider.findByRoom.mockResolvedValue(records);
            provider.aggregateTokens.mockResolvedValue(75);

            await store.init('room-1', 50);
            const history = store.buildHistory('room-1');

            expect(history).toHaveLength(2);
            expect(history[0].content).toContain('b');
            expect(history[1].content).toContain('c');
        });

        it('should isolate memory by roomId', async () => {
            const { store, provider } = makeMocks();
            provider.findByRoom
                .mockResolvedValueOnce([
                    makeRecord({ id: 'a1', roomId: 'room-a', role: 'user', content: 'A' }),
                ])
                .mockResolvedValueOnce([
                    makeRecord({ id: 'b1', roomId: 'room-b', role: 'user', content: 'B' }),
                ]);
            provider.aggregateTokens.mockResolvedValue(0);

            await store.init('room-a');
            await store.init('room-b');

            // Verify isolation: room-a only has its own message
            const historyA = store.buildHistory('room-a');
            expect(historyA).toHaveLength(1);
            expect(historyA[0].content).toBe('A');

            // Verify isolation: room-b only has its own message
            const historyB = store.buildHistory('room-b');
            expect(historyB).toHaveLength(1);
            expect(historyB[0].content).toBe('B');

            // Verify they're different arrays
            expect(historyA).not.toBe(historyB);
        });
    });

    describe('persistUser', () => {
        it('should create user message and push to memory', async () => {
            const { store, provider } = makeMocks();
            const record = makeRecord({ id: 'new-1', role: 'user', content: 'Hello' });
            provider.create.mockResolvedValue(record);

            await store.init('room-1');
            await store.persistUser('room-1', 'Hello');

            expect(provider.create).toHaveBeenCalledWith({
                roomId: 'room-1',
                role: 'user',
                content: 'Hello',
            });
            const history = store.buildHistory('room-1');
            expect(history).toHaveLength(1);
            expect(history[0].content).toBe('Hello');
        });
    });

    describe('persistAssistant', () => {
        it('should create assistant message and push to memory', async () => {
            const { store, provider } = makeMocks();
            const record = makeRecord({ id: 'new-2', role: 'assistant', content: 'Hi there' });
            provider.create.mockResolvedValue(record);

            await store.init('room-1');
            await store.persistAssistant('room-1', 'Hi there');

            expect(provider.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    roomId: 'room-1',
                    role: 'assistant',
                    content: 'Hi there',
                }),
            );
            expect(store.buildHistory('room-1')).toHaveLength(1);
        });
    });

    describe('persistToolResult', () => {
        it('should create tool result and push to memory', async () => {
            const { store, provider } = makeMocks();
            const record = makeRecord({
                id: 't1',
                role: 'tool',
                content: 'result',
                toolResultId: 'tc-1',
            });
            provider.create.mockResolvedValue(record);

            await store.init('room-1');
            await store.persistToolResult('room-1', 'tc-1', 'result');

            expect(provider.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    roomId: 'room-1',
                    role: 'tool',
                    content: 'result',
                    toolResultId: 'tc-1',
                }),
            );
            expect(store.buildHistory('room-1')).toHaveLength(1);
        });
    });

    describe('persistRound', () => {
        it('should createMany assistant + tool results and push to memory', async () => {
            const { store, provider } = makeMocks();
            const assistantRecord = makeRecord({
                id: 'a1',
                role: 'assistant',
                content: 'Let me search',
            });
            const toolRecord = makeRecord({
                id: 't1',
                role: 'tool',
                content: '{"result": 42}',
                toolResultId: 'tc-1',
            });
            provider.createMany.mockResolvedValue([assistantRecord, toolRecord]);

            await store.init('room-1');
            await store.persistRound(
                'room-1',
                'Let me search',
                [{ id: 'tc-1', name: 'search', arguments: { q: 'test' }, timestamp: new Date() }],
                { 'tc-1': { result: 42 } },
            );

            expect(provider.createMany).toHaveBeenCalledWith(
                expect.arrayContaining([
                    expect.objectContaining({ roomId: 'room-1', role: 'assistant' }),
                    expect.objectContaining({
                        roomId: 'room-1',
                        role: 'tool',
                        toolResultId: 'tc-1',
                    }),
                ]),
            );
            expect(store.buildHistory('room-1')).toHaveLength(2);
        });
    });

    describe('persistFinal', () => {
        it('should create final assistant message and push to memory', async () => {
            const { store, provider } = makeMocks();
            const record = makeRecord({ id: 'final', role: 'assistant', content: 'Done' });
            provider.create.mockResolvedValue(record);

            await store.init('room-1');
            await store.persistFinal('room-1', 'Done');

            expect(provider.create).toHaveBeenCalledWith(
                expect.objectContaining({ roomId: 'room-1', role: 'assistant', content: 'Done' }),
            );
            expect(store.buildHistory('room-1')).toHaveLength(1);
        });
    });

    describe('buildHistory', () => {
        it('should convert tool messages to tool_result format', async () => {
            const { store, provider } = makeMocks();
            provider.findByRoom.mockResolvedValue([
                makeRecord({ id: '1', role: 'tool', content: 'result', toolResultId: 'tc-1' }),
            ]);
            provider.aggregateTokens.mockResolvedValue(0);

            await store.init('room-1');
            const history = store.buildHistory('room-1');

            expect(history[0]).toEqual({
                role: 'tool',
                content: [
                    {
                        type: 'tool_result',
                        tool_use_id: 'tc-1',
                        content: 'result',
                    },
                ],
            });
        });

        it('should convert user/assistant messages to simple text', async () => {
            const { store, provider } = makeMocks();
            provider.findByRoom.mockResolvedValue([
                makeRecord({ id: '1', role: 'user', content: 'Hello' }),
                makeRecord({ id: '2', role: 'assistant', content: 'Hi' }),
            ]);
            provider.aggregateTokens.mockResolvedValue(0);

            await store.init('room-1');
            const history = store.buildHistory('room-1');

            expect(history[0]).toEqual({ role: 'user', content: 'Hello' });
            expect(history[1]).toEqual({ role: 'assistant', content: 'Hi' });
        });

        it('should handle null content', async () => {
            const { store, provider } = makeMocks();
            provider.findByRoom.mockResolvedValue([
                makeRecord({ id: '1', role: 'assistant', content: null }),
            ]);
            provider.aggregateTokens.mockResolvedValue(0);

            await store.init('room-1');
            const history = store.buildHistory('room-1');

            expect(history[0].content).toBe('');
        });
    });
});
