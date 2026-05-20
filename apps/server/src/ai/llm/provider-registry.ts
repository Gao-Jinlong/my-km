/**
 * ProviderRegistry — LLM Provider 注册表
 *
 * 负责：
 * - 维护 providerName -> ProviderFactory 映射
 * - 支持运行时注册新 provider
 * - 启动时从 env 读取配置自动注册
 */

import { Injectable, Logger } from '@nestjs/common';
import type { LLMConfig, LLMProvider, LLMProviderFactory } from './provider.types';

@Injectable()
export class ProviderRegistry {
    private readonly logger = new Logger(ProviderRegistry.name);
    private factories = new Map<string, LLMProviderFactory>();

    /**
     * 注册 provider 工厂
     */
    register(name: string, factory: LLMProviderFactory): void {
        this.factories.set(name, factory);
        this.logger.log(`Provider registered: ${name}`);
    }

    /**
     * 根据名称和配置创建 provider 实例
     */
    create(config: LLMConfig): LLMProvider {
        const factory = this.factories.get(config.provider);
        if (!factory) {
            const available = Array.from(this.factories.keys());
            throw new Error(
                `Unknown provider "${config.provider}". Available: ${available.join(', ') || 'none'}`,
            );
        }
        return factory(config);
    }

    /**
     * 获取所有已注册的 provider 名称
     */
    get registeredProviders(): string[] {
        return Array.from(this.factories.keys());
    }

    /**
     * 检查 provider 是否已注册
     */
    isRegistered(name: string): boolean {
        return this.factories.has(name);
    }

    private _defaultConfig: LLMConfig | undefined;

    /**
     * 设置系统默认 LLM 配置（启动时调用一次）
     */
    setDefaultConfig(config: LLMConfig): void {
        this._defaultConfig = config;
        this.logger.log(`Default LLM config set: ${config.provider}/${config.model}`);
    }

    /**
     * 获取系统默认 LLM 配置
     */
    get defaultConfig(): LLMConfig | undefined {
        return this._defaultConfig;
    }
}
