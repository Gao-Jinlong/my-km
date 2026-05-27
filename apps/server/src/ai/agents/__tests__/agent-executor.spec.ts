import type { BaseGraph } from '../../langgraph';
import type { LLMProvider } from '../../llm/provider.types';
import type { ToolDispatcher } from '../../tools/tool.dispatcher';
import type { ToolRouter } from '../../tools/tool-router';
import type { GraphRegistry } from '../../workflow/graph-registry';
import type { LLMResolver } from '../../workflow/llm-resolver';
import type { AgentCallbacks } from '../agent.types';
import { AgentExecutor, type AgentExecutorCtx } from '../agent-executor';

function makeMocks() {
    const mockCompiledGraph = {
        stream: jest.fn().mockImplementation(async function* () {
            yield {
                lastAssistantMessage: 'Test output from agent',
                hasToolCalls: false,
                pendingToolCalls: [],
            };
        }),
    };

    const mockGraph = {
        name: 'chat',
        description: 'test',
        createGraph: jest.fn().mockReturnValue(mockCompiledGraph),
    } as unknown as BaseGraph;

    const graphRegistry = {
        get: jest.fn().mockReturnValue(mockGraph),
    } as unknown as GraphRegistry;

    const mockProvider: LLMProvider = {
        name: 'test',
        model: 'test-model',
        chat: jest.fn().mockImplementation(async function* () {}),
    };

    const llmResolver = {
        resolve: jest.fn().mockReturnValue(mockProvider),
    } as unknown as LLMResolver;

    const toolDispatcher = {
        getDefinitions: jest.fn().mockReturnValue([]),
    } as unknown as ToolDispatcher;

    const toolRouter = {
        needsConfirmation: jest.fn().mockReturnValue(false),
    } as unknown as ToolRouter;

    const callbacks: AgentCallbacks = {
        onThinking: jest.fn(),
        onOutput: jest.fn(),
        onError: jest.fn(),
        onStatus: jest.fn(),
    };

    return {
        graphRegistry,
        llmResolver,
        toolDispatcher,
        toolRouter,
        callbacks,
        mockGraph,
        mockProvider,
    };
}

describe('AgentExecutor', () => {
    it('should execute and return output', async () => {
        const mocks = makeMocks();
        const ctx: AgentExecutorCtx = {
            sessionId: 'test-session',
            agentId: 'test-session--writer',
            input: 'Write about AI',
            callbacks: mocks.callbacks,
            abortSignal: new AbortController().signal,
        };

        const executor = new AgentExecutor(ctx, {
            graphRegistry: mocks.graphRegistry,
            llmResolver: mocks.llmResolver,
            toolDispatcher: mocks.toolDispatcher,
            toolRouter: mocks.toolRouter,
        });

        const result = await executor.execute();

        expect(result.output).toBe('Test output from agent');
        expect(mocks.callbacks.onOutput).toHaveBeenCalledWith(
            'test-session',
            'test-session--writer',
            'Test output from agent',
        );
    });

    it('should abort when signal is triggered before stream', async () => {
        const mocks = makeMocks();
        const controller = new AbortController();
        controller.abort();

        const ctx: AgentExecutorCtx = {
            sessionId: 'test-session',
            agentId: 'test-session--writer',
            input: 'Write about AI',
            callbacks: mocks.callbacks,
            abortSignal: controller.signal,
        };

        const executor = new AgentExecutor(ctx, {
            graphRegistry: mocks.graphRegistry,
            llmResolver: mocks.llmResolver,
            toolDispatcher: mocks.toolDispatcher,
            toolRouter: mocks.toolRouter,
        });

        const result = await executor.execute();

        expect(result.output).toBe('');
        expect(mocks.callbacks.onStatus).toHaveBeenCalledWith(
            'test-session',
            'test-session--writer',
            'cancelled',
        );
    });

    it('should resolve LLM with agent config as defaultConfig', async () => {
        const mocks = makeMocks();
        const ctx: AgentExecutorCtx = {
            sessionId: 'test-session',
            agentId: 'test-session--editor',
            input: 'Edit this',
            callbacks: mocks.callbacks,
            abortSignal: new AbortController().signal,
            llmConfig: { provider: 'anthropic', model: 'claude-sonnet-4-6' },
        };

        const executor = new AgentExecutor(ctx, {
            graphRegistry: mocks.graphRegistry,
            llmResolver: mocks.llmResolver,
            toolDispatcher: mocks.toolDispatcher,
            toolRouter: mocks.toolRouter,
        });

        // Consume the generator to trigger llmCaller
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const caller = (executor as any).createLLMCaller(ctx.llmConfig);
        const gen = caller([], new AbortController().signal);
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        for await (const _ of gen) {
            // consume generator
        }

        expect(mocks.llmResolver.resolve).toHaveBeenCalledWith('llm_call', undefined, {
            provider: 'anthropic',
            model: 'claude-sonnet-4-6',
        });
    });
});
