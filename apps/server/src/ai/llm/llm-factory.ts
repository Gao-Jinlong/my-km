/**
 * LLMFactory — LLM 实例工厂
 *
 * 负责：
 * - 按需实例化 LLM provider
 * - 缓存相同配置的实例（复用 SDK client）
 * - 不同配置自动创建新实例
 * - 依赖 ProviderRegistry 创建实例
 */

import { Injectable, Logger } from '@nestjs/common';
import type { LLMConfig, LLMProvider } from './provider.types';
import { ProviderRegistry } from './provider-registry';

/**
 * 生成配置的唯一缓存 key
 */
function cacheKey(config: LLMConfig): string {
    const { provider, model, ...rest } = config;
    // 排除 apiKey（不在 key 中体现，但会影响实例安全性）
    const sortedParams = Object.keys(rest)
        .filter(k => k !== 'apiKey')
        .sort()
        .map(k => `${k}=${JSON.stringify(rest[k])}`)
        .join('|');
    return `${provider}:${model}${sortedParams ? `:${sortedParams}` : ''}`;
}

@Injectable()
export class LLMFactory {
    private readonly logger = new Logger(LLMFactory.name);
    private cache = new Map<string, LLMProvider>();

    constructor(private registry: ProviderRegistry) {}

    /**
     * 获取或创建 LLM 实例
     *
     * 相同配置复用实例，不同配置自动创建
     */
    getOrCreate(config: LLMConfig): LLMProvider {
        const key = cacheKey(config);

        if (!this.cache.has(key)) {
            const provider = this.registry.create(config);
            this.cache.set(key, provider);
            this.logger.log(
                `LLM instance created: ${config.provider}/${config.model} [key: ${key}]`,
            );
        } else {
            this.logger.debug(`LLM instance reused: ${config.provider}/${config.model}`);
        }

        const provider = this.cache.get(key);
        if (!provider) {
            throw new Error(`LLM provider not found in cache for key: ${key}`);
        }
        return provider;
    }

    /**
     * 清除缓存（用于测试或清理）
     */
    clear(): void {
        this.cache.clear();
    }

    /**
     * 获取缓存的实例数量
     */
    get cacheSize(): number {
        return this.cache.size;
    }
}
