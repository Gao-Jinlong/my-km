import { buildDefaultLlmConfig } from '../llm-default-config';

describe('buildDefaultLlmConfig', () => {
    const originalEnv = process.env;

    beforeEach(() => {
        jest.resetModules();
        process.env = { ...originalEnv };
    });

    afterAll(() => {
        process.env = originalEnv;
    });

    it('returns undefined when no API keys are set', () => {
        delete process.env.ANTHROPIC_API_KEY;
        delete process.env.OPENAI_API_KEY;
        delete process.env.ZHIPUAI_API_KEY;
        delete process.env.DASHSCOPE_API_KEY;

        const result = buildDefaultLlmConfig();
        expect(result).toBeUndefined();
    });

    it('prefers ANTHROPIC when multiple keys are set', () => {
        process.env.ANTHROPIC_API_KEY = 'sk-ant-xxx';
        process.env.OPENAI_API_KEY = 'sk-xxx';

        const result = buildDefaultLlmConfig();
        expect(result).toEqual({
            provider: 'anthropic',
            model: 'claude-sonnet-4-6-20250514',
        });
    });

    it('falls back to OPENAI when ANTHROPIC key is missing', () => {
        delete process.env.ANTHROPIC_API_KEY;
        process.env.OPENAI_API_KEY = 'sk-xxx';

        const result = buildDefaultLlmConfig();
        expect(result).toEqual({
            provider: 'openai',
            model: 'gpt-4o',
        });
    });

    it('falls back to ZHIPU when ANTHROPIC and OPENAI keys are missing', () => {
        delete process.env.ANTHROPIC_API_KEY;
        delete process.env.OPENAI_API_KEY;
        process.env.ZHIPUAI_API_KEY = 'xxx';

        const result = buildDefaultLlmConfig();
        expect(result).toEqual({
            provider: 'zhipu',
            model: 'glm-4',
        });
    });

    it('falls back to DASHSCOPE when only its key is set', () => {
        delete process.env.ANTHROPIC_API_KEY;
        delete process.env.OPENAI_API_KEY;
        delete process.env.ZHIPUAI_API_KEY;
        process.env.DASHSCOPE_API_KEY = 'xxx';

        const result = buildDefaultLlmConfig();
        expect(result).toEqual({
            provider: 'dashscope',
            model: 'qwen-max',
        });
    });

    it('respects DEFAULT_LLM_PROVIDER override', () => {
        process.env.ANTHROPIC_API_KEY = 'sk-ant-xxx';
        process.env.OPENAI_API_KEY = 'sk-xxx';
        process.env.DEFAULT_LLM_PROVIDER = 'openai';

        const result = buildDefaultLlmConfig();
        expect(result).toEqual({
            provider: 'openai',
            model: 'gpt-4o',
        });
    });

    it('respects DEFAULT_LLM_MODEL override', () => {
        process.env.ANTHROPIC_API_KEY = 'sk-ant-xxx';
        process.env.DEFAULT_LLM_MODEL = 'claude-opus-4-7';

        const result = buildDefaultLlmConfig();
        expect(result).toEqual({
            provider: 'anthropic',
            model: 'claude-opus-4-7',
        });
    });

    it('falls through to priority scan when override provider has no API key', () => {
        process.env.DEFAULT_LLM_PROVIDER = 'openai';
        process.env.ANTHROPIC_API_KEY = 'sk-ant-xxx';
        // No OPENAI_API_KEY set

        const result = buildDefaultLlmConfig();
        // Should fall back to anthropic since openai has no key
        expect(result).toEqual({
            provider: 'anthropic',
            model: 'claude-sonnet-4-6-20250514',
        });
    });
});
