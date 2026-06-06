/**
 * AiModule bootstrap regression test
 *
 * 验证 AiModule.onModuleInit() 正确执行：
 *   1. 注册 4 个 provider 工厂（anthropic / openai / zhipu / dashscope）
 *   2. 当 env 中存在 API key 时，setDefaultConfig 使用对应 provider
 *   3. 当所有 API key 缺失时，fallback 到 {provider:'dashscope', model:'qwen-plus'} 并 logger.warn
 *
 * 此测试是关键回归测试 — 防止 "No LLM provider configured" 错误回归。
 *
 * 设计说明：不通过 NestJS Test.createTestingModule 启动整个 AiModule
 * （会触发 PrismaService.$connect() 等真实依赖）。直接构造 AiModule 实例
 * 并调用 onModuleInit()，更聚焦也更快。
 */

import { Logger } from '@nestjs/common';

// Mock langgraph ESM modules + chat-graph 必须在 import AiModule 之前，
// 因为 AiModule → AiChatService → chat-graph → @langchain/langgraph（ESM uuid）
jest.mock('@langchain/langgraph', () => ({
    StateGraph: jest.fn().mockReturnValue({
        addNode: jest.fn().mockReturnThis(),
        addEdge: jest.fn().mockReturnThis(),
        addConditionalEdges: jest.fn().mockReturnThis(),
        compile: jest.fn().mockReturnValue({ stream: jest.fn() }),
    }),
    START: '__start__',
    END: '__end__',
    Annotation: { Root: jest.fn().mockReturnValue({}) },
}));

jest.mock('@langchain/langgraph-checkpoint', () => ({
    MemorySaver: jest.fn().mockImplementation(() => ({ type: 'MemorySaver' })),
}));

jest.mock('../langgraph/graphs/chat-graph', () => ({
    ChatGraph: jest.fn().mockImplementation(() => ({
        name: 'chat',
        createGraph: jest.fn().mockReturnValue({
            compile: jest.fn().mockReturnValue({ type: 'compiled-graph', stream: jest.fn() }),
        }),
    })),
}));

// Mock 4 个 provider 类的构造函数，避免它们检查 API key
jest.mock('../llm/anthropic.provider', () => ({
    AnthropicProvider: jest.fn().mockImplementation(() => ({ name: 'anthropic' })),
}));
jest.mock('../llm/openai.provider', () => ({
    OpenAIProvider: jest.fn().mockImplementation(() => ({ name: 'openai' })),
}));
jest.mock('../llm/zhipu.provider', () => ({
    ZhipuProvider: jest.fn().mockImplementation(() => ({ name: 'zhipu' })),
}));
jest.mock('../llm/dashscope.provider', () => ({
    DashscopeProvider: jest.fn().mockImplementation(() => ({ name: 'dashscope' })),
}));

import { AiModule } from '../ai.module';
import { ProviderRegistry } from '../llm/provider-registry';

describe('AiModule bootstrap', () => {
    const originalEnv = process.env;
    let registry: ProviderRegistry;
    let aiModule: AiModule;

    beforeEach(() => {
        process.env = { ...originalEnv };
        // 清理所有 API key，让每个测试自行决定
        delete process.env.ANTHROPIC_API_KEY;
        delete process.env.OPENAI_API_KEY;
        delete process.env.ZHIPUAI_API_KEY;
        delete process.env.DASHSCOPE_API_KEY;
        delete process.env.DEFAULT_LLM_PROVIDER;
        delete process.env.DEFAULT_LLM_MODEL;

        registry = new ProviderRegistry();
        aiModule = new AiModule(registry);
    });

    afterAll(() => {
        process.env = originalEnv;
    });

    it('registers all 4 provider factories', () => {
        aiModule.onModuleInit();

        expect(registry.registeredProviders.sort()).toEqual([
            'anthropic',
            'dashscope',
            'openai',
            'zhipu',
        ]);
    });

    it('marks each provider as registered', () => {
        aiModule.onModuleInit();

        for (const name of ['anthropic', 'openai', 'zhipu', 'dashscope']) {
            expect(registry.isRegistered(name)).toBe(true);
        }
    });

    it('uses ANTHROPIC as default when ANTHROPIC_API_KEY is set', () => {
        process.env.ANTHROPIC_API_KEY = 'sk-ant-test';

        aiModule.onModuleInit();

        expect(registry.defaultConfig).toEqual({
            provider: 'anthropic',
            model: 'claude-sonnet-4-6-20250514',
        });
    });

    it('uses DASHSCOPE as default when only DASHSCOPE_API_KEY is set', () => {
        process.env.DASHSCOPE_API_KEY = 'sk-test';

        aiModule.onModuleInit();

        expect(registry.defaultConfig).toEqual({
            provider: 'dashscope',
            model: 'qwen-max',
        });
    });

    it('falls back to dashscope/qwen-plus and warns when no API key is set', () => {
        const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

        aiModule.onModuleInit();

        expect(registry.defaultConfig).toEqual({
            provider: 'dashscope',
            model: 'qwen-plus',
        });
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('No LLM API key found'));
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('DASHSCOPE_API_KEY'));

        warnSpy.mockRestore();
    });

    it('logs default provider info when key exists (no fallback warn)', () => {
        process.env.OPENAI_API_KEY = 'sk-test';
        const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
        const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);

        aiModule.onModuleInit();

        expect(warnSpy).not.toHaveBeenCalled();
        expect(logSpy).toHaveBeenCalledWith(
            expect.stringContaining('Default LLM provider: openai'),
        );

        warnSpy.mockRestore();
        logSpy.mockRestore();
    });
});
