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

        it('should expose requestContext when provided', () => {
            const ctx = new RunContext({
                checkpointer: mockCheckpointer,
                eventStore: mockEventStore,
                llmConfig: baseLlmConfig,
                requestContext: { userId: 'u1' },
            });

            expect(ctx.requestContext).toEqual({ userId: 'u1' });
        });

        it('should leave requestContext undefined when not provided', () => {
            const ctx = new RunContext({
                checkpointer: mockCheckpointer,
                eventStore: mockEventStore,
                llmConfig: baseLlmConfig,
            });

            expect(ctx.requestContext).toBeUndefined();
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

        it('should deep clone + freeze requestContext', () => {
            const reqCtx = { userId: 'u1', meta: { role: 'admin' } };
            const ctx = new RunContext({
                checkpointer: mockCheckpointer,
                eventStore: mockEventStore,
                llmConfig: baseLlmConfig,
                requestContext: reqCtx,
            });

            // Mutating original should not affect snapshot
            (reqCtx as any).userId = 'u2';
            reqCtx.meta.role = 'user';

            expect(ctx.requestContext!.userId).toBe('u1');
            expect((ctx.requestContext!.meta as any).role).toBe('admin');
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

        it('should freeze nested objects in requestContext', () => {
            const ctx = new RunContext({
                checkpointer: mockCheckpointer,
                eventStore: mockEventStore,
                llmConfig: baseLlmConfig,
                requestContext: { nested: { key: 'value' } },
            });

            expect(() => {
                (ctx.requestContext!.nested as any).key = 'hacked';
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
