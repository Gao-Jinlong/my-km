import type { LLMConfig } from './provider.types';

/**
 * 从环境变量构建系统默认 LLMConfig。
 *
 * 优先级: ANTHROPIC > OPENAI > ZHIPU > DASHSCOPE
 * 可通过 DEFAULT_LLM_PROVIDER 覆盖首选 provider，
 * 可通过 DEFAULT_LLM_MODEL 覆盖默认模型名称。
 */
export function buildDefaultLlmConfig(): LLMConfig | undefined {
    const providerOrder = ['anthropic', 'openai', 'zhipu', 'dashscope'] as const;
    const apiKeyEnvMap: Record<string, string> = {
        anthropic: 'ANTHROPIC_API_KEY',
        openai: 'OPENAI_API_KEY',
        zhipu: 'ZHIPUAI_API_KEY',
        dashscope: 'DASHSCOPE_API_KEY',
    };
    const defaultModels: Record<string, string> = {
        anthropic: 'claude-sonnet-4-6-20250514',
        openai: 'gpt-4o',
        zhipu: 'glm-4',
        dashscope: 'qwen-max',
    };

    const overrideProvider = process.env.DEFAULT_LLM_PROVIDER?.toLowerCase();
    const overrideModel = process.env.DEFAULT_LLM_MODEL;

    // If override provider specified, use it (if API key exists)
    if (overrideProvider && apiKeyEnvMap[overrideProvider]) {
        const apiKey = process.env[apiKeyEnvMap[overrideProvider]];
        if (apiKey) {
            return {
                provider: overrideProvider,
                model: overrideModel ?? defaultModels[overrideProvider],
            };
        }
    }

    // Otherwise, find first provider with API key
    for (const provider of providerOrder) {
        const apiKey = process.env[apiKeyEnvMap[provider]];
        if (apiKey) {
            return {
                provider,
                model: overrideModel ?? defaultModels[provider],
            };
        }
    }

    return undefined;
}
