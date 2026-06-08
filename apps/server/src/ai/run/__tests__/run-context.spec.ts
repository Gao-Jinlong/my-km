import type { BaseCheckpointSaver } from '@langchain/langgraph-checkpoint';
import type { LLMConfig } from '../../llm/provider.types';
import type { RunEventStore } from '../../store/run-event-store';
import { RunContext } from '../run-context';

describe('RunContext', () => {
    const mockCheckpointer = { type: 'memory-saver' } as unknown as BaseCheckpointSaver;
    const mockEventStore = { append: jest.fn() } as unknown as RunEventStore;
    const baseLlmConfig: LLMConfig = { provider: 'zhipu', model: 'glm-5' };

    describe('constructor', () => {
        it('should expose checkpointer and eventStore', () => {
            const ctx = new RunContext({
                checkpointer: mockCheckpointer,
                eventStore: mockEventStore,
                llmConfig: baseLlmConfig,
            });

            expect(ctx.checkpointer).toBe(mockCheckpointer);
            expect(ctx.eventStore).toBe(mockEventStore);
        });

        it('should expose llmConfig', () => {
            const ctx = new RunContext({
                checkpointer: mockCheckpointer,
                eventStore: mockEventStore,
                llmConfig: baseLlmConfig,
            });

            expect(ctx.llmConfig).toEqual(baseLlmConfig);
        });
    });

    describe('snapshot immutability', () => {
        it('should deep clone + freeze llmConfig', () => {
            const config: LLMConfig = { provider: 'openai', model: 'gpt-4', temperature: 0.7 };
            const ctx = new RunContext({
                checkpointer: mockCheckpointer,
                eventStore: mockEventStore,
                llmConfig: config,
            });

            // Mutating original should not affect snapshot
            config.provider = 'anthropic';
            config.temperature = 1.0;

            expect(ctx.llmConfig.provider).toBe('openai');
            expect(ctx.llmConfig.temperature).toBe(0.7);
        });

        it('should freeze llmConfig against runtime mutation', () => {
            const ctx = new RunContext({
                checkpointer: mockCheckpointer,
                eventStore: mockEventStore,
                llmConfig: { provider: 'zhipu', model: 'glm-5' },
            });

            expect(() => {
                (ctx.llmConfig as any).provider = 'hacked';
            }).toThrow();
        });
    });

    describe('no graph cache', () => {
        it('should not have getCompiledGraph method', () => {
            const ctx = new RunContext({
                checkpointer: mockCheckpointer,
                eventStore: mockEventStore,
                llmConfig: baseLlmConfig,
            });

            expect((ctx as any).getCompiledGraph).toBeUndefined();
        });
    });
});
