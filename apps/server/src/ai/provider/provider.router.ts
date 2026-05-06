/**
 * ProviderRouter — 多 LLM provider 路由
 *
 * 负责：
 * - 注册多个 LLM provider
 * - 根据 conversation 配置选择 provider
 * - 故障降级（fallback）
 */

import { Injectable, Logger } from '@nestjs/common';
import type { LLMProvider, ProviderSelectOpts } from './provider.types';

@Injectable()
export class ProviderRouter {
    private readonly logger = new Logger(ProviderRouter.name);
    private providers = new Map<string, LLMProvider>();
    private defaultProvider: LLMProvider | null = null;

    /**
     * 注册 provider
     */
    register(name: string, provider: LLMProvider, isDefault = false): void {
        this.providers.set(name, provider);
        if (isDefault || !this.defaultProvider) {
            this.defaultProvider = provider;
        }
        this.logger.log(`Provider registered: ${name}${isDefault ? ' (default)' : ''}`);
    }

    /**
     * 选择 provider
     *
     * 优先级:
     * 1. opts.provider 指定的 provider
     * 2. 默认 provider
     */
    select(opts: ProviderSelectOpts = {}): LLMProvider {
        if (opts.provider) {
            const provider = this.providers.get(opts.provider);
            if (provider) return provider;
            this.logger.warn(`Provider "${opts.provider}" not found, falling back to default`);
        }

        if (!this.defaultProvider) {
            throw new Error('No LLM provider configured');
        }

        return this.defaultProvider;
    }

    /**
     * 获取所有已注册的 provider 名称
     */
    get registeredProviders(): string[] {
        return Array.from(this.providers.keys());
    }

    /**
     * 获取默认 provider 名称
     */
    get defaultProviderName(): string | null {
        return this.defaultProvider?.name ?? null;
    }
}
