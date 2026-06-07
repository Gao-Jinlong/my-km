/**
 * Anthropic Claude LLM Provider
 *
 * 通过 LangChain `ChatAnthropic` 暴露 BaseChatModel。
 */

import { ChatAnthropic } from '@langchain/anthropic';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { LLMConfig, LLMProvider } from './provider.types';

export class AnthropicProvider implements LLMProvider {
    readonly name = 'anthropic';
    readonly model: string;
    private chatModel: ChatAnthropic;

    constructor(config: LLMConfig) {
        const apiKey = config.apiKey ?? process.env.ANTHROPIC_API_KEY;
        if (!apiKey) throw new Error('Anthropic API key is required');

        this.model = config.model ?? 'claude-sonnet-4-6-20250514';

        this.chatModel = new ChatAnthropic({
            apiKey,
            model: this.model,
            temperature: (config.temperature as number) ?? 0.7,
            maxTokens: (config.maxTokens as number) ?? 4096,
            streaming: true,
        });
    }

    getChatModel(): BaseChatModel {
        return this.chatModel;
    }
}
