import type { BaseCheckpointSaver } from '@langchain/langgraph-checkpoint';
import type { RunEventStore } from '../../store/run-event-store';

// Mock langgraph checkpoint ESM to prevent uuid ESM error in Jest
jest.mock('@langchain/langgraph-checkpoint', () => ({
    MemorySaver: jest.fn().mockImplementation(() => ({ type: 'MemorySaver' })),
}));

// Mock CheckpointerProvider to avoid ESM import chain
jest.mock('../../checkpointer/checkpointer.provider', () => ({
    CheckpointerProvider: jest.fn().mockImplementation(() => ({
        getCheckpointer: jest.fn(),
    })),
}));

import { CheckpointerProvider } from '../../checkpointer/checkpointer.provider';
import { RunContextFactory } from '../run-context-factory';

describe('RunContextFactory', () => {
    let factory: RunContextFactory;
    let mockCheckpointer: BaseCheckpointSaver;
    let mockCheckpointerProvider: CheckpointerProvider;
    let mockEventStore: RunEventStore;

    beforeEach(() => {
        mockCheckpointer = { type: 'memory-saver' } as unknown as BaseCheckpointSaver;
        mockEventStore = { append: jest.fn() } as unknown as RunEventStore;

        mockCheckpointerProvider = {
            getCheckpointer: jest.fn().mockResolvedValue(mockCheckpointer),
        } as unknown as CheckpointerProvider;

        factory = new RunContextFactory(mockCheckpointerProvider, mockEventStore);
    });

    describe('create', () => {
        it('should call CheckpointerProvider.getCheckpointer()', async () => {
            await factory.create({ llmConfig: { provider: 'zhipu', model: 'glm-5' } });
            expect(mockCheckpointerProvider.getCheckpointer).toHaveBeenCalled();
        });

        it('should return a RunContext with the singleton checkpointer', async () => {
            const ctx = await factory.create({ llmConfig: { provider: 'zhipu', model: 'glm-5' } });
            expect(ctx.checkpointer).toBe(mockCheckpointer);
        });

        it('should return a RunContext with the singleton eventStore', async () => {
            const ctx = await factory.create({ llmConfig: { provider: 'zhipu', model: 'glm-5' } });
            expect(ctx.eventStore).toBe(mockEventStore);
        });

        it('should return distinct RunContext instances per call', async () => {
            const ctx1 = await factory.create({ llmConfig: { provider: 'zhipu', model: 'glm-5' } });
            const ctx2 = await factory.create({
                llmConfig: { provider: 'openai', model: 'gpt-4' },
            });

            expect(ctx1).not.toBe(ctx2);
        });

        it('should share checkpointer reference across contexts', async () => {
            const ctx1 = await factory.create({ llmConfig: { provider: 'zhipu', model: 'glm-5' } });
            const ctx2 = await factory.create({
                llmConfig: { provider: 'openai', model: 'gpt-4' },
            });

            expect(ctx1.checkpointer).toBe(ctx2.checkpointer);
        });

        it('should share eventStore reference across contexts', async () => {
            const ctx1 = await factory.create({ llmConfig: { provider: 'zhipu', model: 'glm-5' } });
            const ctx2 = await factory.create({
                llmConfig: { provider: 'openai', model: 'gpt-4' },
            });

            expect(ctx1.eventStore).toBe(ctx2.eventStore);
        });

        it('should deep clone + freeze llmConfig', async () => {
            const config = { provider: 'zhipu', model: 'glm-5', temperature: 0.7 };
            const ctx = await factory.create({ llmConfig: config });

            // Mutating original should not affect context
            config.provider = 'anthropic';

            expect(ctx.llmConfig.provider).toBe('zhipu');
            expect(ctx.llmConfig.temperature).toBe(0.7);

            // Context should be frozen
            expect(() => {
                (ctx.llmConfig as Record<string, unknown>).provider = 'hacked';
            }).toThrow();
        });

        it('should fail clearly when llmConfig contains non-clonable value', async () => {
            const badConfig = { provider: 'zhipu', model: 'glm-5', fn: () => {} };

            await expect(factory.create({ llmConfig: badConfig as any })).rejects.toThrow();
        });
    });
});
