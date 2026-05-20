/**
 * LLMResolver — 三层回退 (configMap → defaultConfig → throw) 单元测试
 */

import { Test, type TestingModule } from '@nestjs/testing';
import type { LLMMessage, LLMOutput, ToolDefinition } from '../../ai.types';
import { LLMFactory } from '../../llm/llm-factory';
import type { LLMConfig, LLMProvider, NodeLLMConfigMap } from '../../llm/provider.types';
import { ProviderRegistry } from '../../llm/provider-registry';
import { LLMResolver } from '../llm-resolver';

// Mock LLMProvider
function mockProvider(name: string, model: string): LLMProvider {
    return {
        name,
        model,
        chat: async function* (_msgs: LLMMessage[], _tools?: ToolDefinition[], _sig?: AbortSignal) {
            yield { content: 'mock', done: true } as LLMOutput;
        },
    };
}

describe('LLMResolver', () => {
    let resolver: LLMResolver;
    let registry: ProviderRegistry;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [ProviderRegistry, LLMFactory, LLMResolver],
        }).compile();

        resolver = module.get(LLMResolver);
        registry = module.get(ProviderRegistry);

        // Register a mock provider factory keyed by config.provider
        registry.register('test-provider', (config: LLMConfig) =>
            mockProvider(config.provider, config.model),
        );
    });

    const defaultConfig: LLMConfig = { provider: 'test-provider', model: 'default-model' };
    const nodeConfig: LLMConfig = { provider: 'test-provider', model: 'node-specific' };

    it('throws when both configMap and defaultConfig are undefined', () => {
        expect(() => resolver.resolve('llm_call')).toThrow(
            'No LLM config for node "llm_call" and no default',
        );
    });

    it('uses configMap[nodeId] when available', () => {
        const configMap: NodeLLMConfigMap = { llm_call: nodeConfig };
        const provider = resolver.resolve('llm_call', configMap, defaultConfig);
        expect(provider.model).toBe('node-specific');
    });

    it('falls back to defaultConfig when configMap[nodeId] is missing', () => {
        const configMap: NodeLLMConfigMap = { other_node: nodeConfig };
        const provider = resolver.resolve('llm_call', configMap, defaultConfig);
        expect(provider.model).toBe('default-model');
    });

    it('uses defaultConfig when configMap is undefined', () => {
        const provider = resolver.resolve('llm_call', undefined, defaultConfig);
        expect(provider.model).toBe('default-model');
    });

    it('returns the same provider instance for repeated calls with same config', () => {
        const configMap: NodeLLMConfigMap = { llm_call: nodeConfig };
        const p1 = resolver.resolve('llm_call', configMap);
        const p2 = resolver.resolve('llm_call', configMap);
        expect(p1).toBe(p2); // Same object reference (cached)
    });

    it('resolveAll returns providers for all node IDs', () => {
        const configMap: NodeLLMConfigMap = {
            llm_call: nodeConfig,
            other_node: defaultConfig,
        };
        const resolved = resolver.resolveAll(['llm_call', 'other_node'], configMap);
        expect(resolved.size).toBe(2);
        const llmCall = resolved.get('llm_call');
        const otherNode = resolved.get('other_node');
        expect(llmCall).toBeDefined();
        expect(otherNode).toBeDefined();
        expect(llmCall?.model).toBe('node-specific');
        expect(otherNode?.model).toBe('default-model');
    });
});
