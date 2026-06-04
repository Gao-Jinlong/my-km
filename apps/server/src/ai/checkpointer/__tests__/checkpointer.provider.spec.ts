import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { CheckpointerProvider } from '../checkpointer.provider';

// Mock ESM-only langgraph modules
jest.mock('@langchain/langgraph-checkpoint', () => ({
    MemorySaver: jest.fn().mockImplementation(() => ({ type: 'MemorySaver' })),
}));

jest.mock('@langchain/langgraph-checkpoint-postgres', () => ({
    PostgresSaver: {
        fromConnString: jest.fn().mockReturnValue({
            type: 'PostgresSaver',
            setup: jest.fn().mockResolvedValue(undefined),
            end: jest.fn().mockResolvedValue(undefined),
        }),
    },
}));

describe('CheckpointerProvider', () => {
    let provider: CheckpointerProvider;

    afterEach(async () => {
        if (provider) {
            await provider.onModuleDestroy?.();
        }
    });

    describe('memory mode', () => {
        beforeEach(async () => {
            const module: TestingModule = await Test.createTestingModule({
                providers: [
                    CheckpointerProvider,
                    {
                        provide: ConfigService,
                        useValue: {
                            get: jest.fn((key: string) => {
                                if (key === 'CHECKPOINTER_BACKEND') return 'memory';
                                return undefined;
                            }),
                        },
                    },
                ],
            }).compile();

            provider = module.get<CheckpointerProvider>(CheckpointerProvider);
            await provider.onModuleInit();
        });

        it('should create a MemorySaver instance', () => {
            const checkpointer = provider.getCheckpointer();
            expect(checkpointer).toBeDefined();
            expect(checkpointer.type).toBe('MemorySaver');
        });

        it('should return the same singleton across calls', () => {
            const c1 = provider.getCheckpointer();
            const c2 = provider.getCheckpointer();
            expect(c1).toBe(c2);
        });
    });

    describe('default backend', () => {
        it('should default to memory when no config set', async () => {
            const module: TestingModule = await Test.createTestingModule({
                providers: [
                    CheckpointerProvider,
                    {
                        provide: ConfigService,
                        useValue: {
                            get: jest.fn(() => undefined),
                        },
                    },
                ],
            }).compile();

            provider = module.get<CheckpointerProvider>(CheckpointerProvider);
            await provider.onModuleInit();

            const checkpointer = provider.getCheckpointer();
            expect(checkpointer.type).toBe('MemorySaver');
        });
    });

    describe('postgres mode', () => {
        it('should create a PostgresSaver when configured', async () => {
            const module: TestingModule = await Test.createTestingModule({
                providers: [
                    CheckpointerProvider,
                    {
                        provide: ConfigService,
                        useValue: {
                            get: jest.fn((key: string) => {
                                if (key === 'CHECKPOINTER_BACKEND') return 'postgres';
                                if (key === 'DATABASE_URL')
                                    return 'postgresql://kmuser:kmpass@localhost:5432/km_db';
                                return undefined;
                            }),
                        },
                    },
                ],
            }).compile();

            provider = module.get<CheckpointerProvider>(CheckpointerProvider);
            await provider.onModuleInit();

            const checkpointer = provider.getCheckpointer();
            expect(checkpointer.type).toBe('PostgresSaver');
        });

        it('should throw when postgres selected without DATABASE_URL', async () => {
            const module: TestingModule = await Test.createTestingModule({
                providers: [
                    CheckpointerProvider,
                    {
                        provide: ConfigService,
                        useValue: {
                            get: jest.fn((key: string) => {
                                if (key === 'CHECKPOINTER_BACKEND') return 'postgres';
                                return undefined;
                            }),
                        },
                    },
                ],
            }).compile();

            provider = module.get<CheckpointerProvider>(CheckpointerProvider);
            await expect(provider.onModuleInit()).rejects.toThrow(/DATABASE_URL/);
        });
    });

    describe('unknown backend', () => {
        it('should throw on unknown backend type', async () => {
            const module: TestingModule = await Test.createTestingModule({
                providers: [
                    CheckpointerProvider,
                    {
                        provide: ConfigService,
                        useValue: {
                            get: jest.fn((key: string) => {
                                if (key === 'CHECKPOINTER_BACKEND') return 'invalid';
                                return undefined;
                            }),
                        },
                    },
                ],
            }).compile();

            provider = module.get<CheckpointerProvider>(CheckpointerProvider);
            await expect(provider.onModuleInit()).rejects.toThrow(/invalid/);
        });
    });

    describe('getCheckpointer before init', () => {
        it('should throw when called before onModuleInit', () => {
            const configService = { get: jest.fn(() => undefined) };
            provider = new CheckpointerProvider(configService as any);
            expect(() => provider.getCheckpointer()).toThrow(/not initialized/);
        });
    });
});
