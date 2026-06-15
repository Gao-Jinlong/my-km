import { EnvConfig } from '../env.config';

/**
 * eventBusMode getter —— AI_EVENT_BUS 归一化为 'in-process' | 'redis'。
 * 默认 in-process（本地开发不依赖 Redis，spec 6.3）。
 */
describe('EnvConfig.eventBusMode', () => {
    const originalEnv = process.env;
    const REQUIRED = {
        DATABASE_URL: 'postgresql://kmuser:kmpass@localhost:5432/km_db',
        JWT_SECRET: 'test-secret-test-secret-test-secret',
    };

    beforeEach(() => {
        process.env = { ...REQUIRED };
    });

    afterAll(() => {
        process.env = originalEnv;
    });

    it('defaults to in-process when AI_EVENT_BUS is unset', () => {
        delete process.env.AI_EVENT_BUS;
        expect(new EnvConfig().eventBusMode).toBe('in-process');
    });

    it('returns redis when AI_EVENT_BUS=redis', () => {
        process.env.AI_EVENT_BUS = 'redis';
        expect(new EnvConfig().eventBusMode).toBe('redis');
    });

    it('falls back to in-process for any non-redis value', () => {
        process.env.AI_EVENT_BUS = 'garbage';
        expect(new EnvConfig().eventBusMode).toBe('in-process');
    });
});
