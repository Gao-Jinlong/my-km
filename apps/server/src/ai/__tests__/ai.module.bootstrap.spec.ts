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

import { Test, type TestingModule } from '@nestjs/testing';
import { ConfigModule } from '../../config/config.module';
import { PrismaService } from '../../prisma/prisma.service';
import { AiModule } from '../ai.module';
import { AiChatService } from '../ai.service';
import { ProviderRegistry } from '../llm/provider-registry';
import { REPLICA_ID } from '../run/replica-id';
import { RunManager } from '../run/run-manager';
import { RunStateRepository } from '../run/run-state.repository';

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
        delete process.env.AI_REPLICA_ID;

        registry = new ProviderRegistry();
        aiModule = new AiModule(registry);
    });

    afterAll(() => {
        process.env = originalEnv;
    });

    async function compileAiModuleForDi(): Promise<TestingModule> {
        // EnvConfig 校验需要 DATABASE_URL / JWT_SECRET 存在
        process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/test';
        process.env.JWT_SECRET ??= 'test-secret-test-secret-test-secret';
        return Test.createTestingModule({ imports: [ConfigModule, AiModule] })
            .overrideProvider(PrismaService)
            .useValue({
                run: {},
                runEvent: {},
                thread: {},
                $connect: jest.fn(),
                $disconnect: jest.fn(),
            })
            .compile();
    }

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

    it('provides REPLICA_ID from AI_REPLICA_ID when set', async () => {
        process.env.AI_REPLICA_ID = 'replica-env';
        const module = await compileAiModuleForDi();
        expect(module.get(REPLICA_ID)).toBe('replica-env');
        await module.close();
    });

    it('generates a non-empty REPLICA_ID when env is missing or blank', async () => {
        process.env.AI_REPLICA_ID = '   ';
        const module = await compileAiModuleForDi();
        const replicaId = module.get<string>(REPLICA_ID);
        expect(replicaId).toEqual(expect.any(String));
        expect(replicaId.length).toBeGreaterThan(0);
        expect(replicaId).not.toBe('   ');
        await module.close();
    });

    it('wires RunStateRepository into RunManager and AiChatService through Nest DI', async () => {
        const module = await compileAiModuleForDi();
        expect(module.get(RunStateRepository)).toBeInstanceOf(RunStateRepository);
        expect(module.get(RunManager)).toBeInstanceOf(RunManager);
        expect(module.get(AiChatService)).toBeInstanceOf(AiChatService);
        await module.close();
    });
});
