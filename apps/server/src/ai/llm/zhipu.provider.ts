/**
 * Zhipu AI (智谱) LLM Provider
 *
 * Zhipu API 兼容 OpenAI 接口格式,通过 `ChatOpenAI` + 自定义 `baseURL` 复用。
 */

import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { ChatOpenAI } from '@langchain/openai';
import type { LLMConfig, LLMProvider } from './provider.types';

export class ZhipuProvider implements LLMProvider {
    readonly name = 'zhipu';
    readonly model: string;
    private chatModel: ChatOpenAI;

    constructor(config: LLMConfig) {
        const apiKey = config.apiKey ?? process.env.ZHIPUAI_API_KEY;
        if (!apiKey) throw new Error('Zhipu API key is required');

        this.model = config.model ?? 'glm-4-flash';

        this.chatModel = new ChatOpenAI({
            apiKey,
            model: this.model,
            temperature: (config.temperature as number) ?? 0.7,
            maxTokens: (config.maxTokens as number) ?? 4096,
            streaming: true,
            configuration: {
                baseURL: 'https://open.bigmodel.cn/api/paas/v4',
            },
        });
    }

    getChatModel(): BaseChatModel {
        return this.chatModel;
    }
}
