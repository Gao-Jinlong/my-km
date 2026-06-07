import type { EnvConfig } from '../../../config/env.config';
import { CheckpointerProvider } from '../checkpointer.provider';

// Mock ESM-only langgraph modules
jest.mock('@langchain/langgraph-checkpoint', () => ({
    MemorySaver: jest.fn().mockImplementation(() => ({ type: 'MemorySaver' })),
}));

jest.mock(
    '@langchain/langgraph-checkpoint-postgres',
    () => ({
        PostgresSaver: {
            fromConnString: jest.fn().mockReturnValue({
                type: 'PostgresSaver',
                setup: jest.fn().mockResolvedValue(undefined),
                end: jest.fn().mockResolvedValue(undefined),
            }),
        },
    }),
    { virtual: true },
);

/**
 * 构造 mock EnvConfig
 */
function createEnvConfig(databaseUrl?: string): EnvConfig {
    return { databaseUrl } as EnvConfig;
}

const ORIGINAL_BACKEND = process.env.CHECKPOINTER_BACKEND;

describe('CheckpointerProvider', () => {
    let provider: CheckpointerProvider;

    afterEach(async () => {
        if (provider) {
            await provider.onModuleDestroy?.();
        }
        if (ORIGINAL_BACKEND === undefined) {
            delete process.env.CHECKPOINTER_BACKEND;
        } else {
            process.env.CHECKPOINTER_BACKEND = ORIGINAL_BACKEND;
        }
    });

    describe('memory mode', () => {
        beforeEach(() => {
            process.env.CHECKPOINTER_BACKEND = 'memory';
            provider = new CheckpointerProvider(createEnvConfig());
        });

        it('should create a MemorySaver instance', async () => {
            const checkpointer = await provider.getCheckpointer();
            expect(checkpointer).toBeDefined();
            expect((checkpointer as unknown as { type: string }).type).toBe('MemorySaver');
        });

        it('should return the same singleton across calls', async () => {
            const c1 = await provider.getCheckpointer();
            const c2 = await provider.getCheckpointer();
            expect(c1).toBe(c2);
        });
    });

    describe('default backend', () => {
        it('should default to memory when no env set', async () => {
            delete process.env.CHECKPOINTER_BACKEND;
            provider = new CheckpointerProvider(createEnvConfig());
            const checkpointer = await provider.getCheckpointer();
            expect((checkpointer as unknown as { type: string }).type).toBe('MemorySaver');
        });
    });

    describe('postgres mode', () => {
        // 跳过：CheckpointerProvider 使用动态 import() 加载 PostgresSaver
        // jest CJS 环境下无法拦截动态 import（需 --experimental-vm-modules）
        // 实际 postgres 模式由 e2e/集成测试覆盖
        it.skip('should create a PostgresSaver when configured', async () => {
            process.env.CHECKPOINTER_BACKEND = 'postgres';
            provider = new CheckpointerProvider(
                createEnvConfig('postgresql://kmuser:kmpass@localhost:5432/km_db'),
            );
            const checkpointer = await provider.getCheckpointer();
            expect((checkpointer as unknown as { type: string }).type).toBe('PostgresSaver');
        });

        it('should throw when postgres selected without DATABASE_URL', async () => {
            process.env.CHECKPOINTER_BACKEND = 'postgres';
            provider = new CheckpointerProvider(createEnvConfig(undefined));
            await expect(provider.ensureInitialized()).rejects.toThrow(/DATABASE_URL/);
        });
    });

    describe('unknown backend', () => {
        it('should throw on unknown backend type', async () => {
            process.env.CHECKPOINTER_BACKEND = 'invalid';
            provider = new CheckpointerProvider(createEnvConfig());
            await expect(provider.ensureInitialized()).rejects.toThrow(/invalid/);
        });
    });
});
