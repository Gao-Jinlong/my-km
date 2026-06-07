/**
 * Alibaba Cloud DashScope (阿里云百炼) LLM Provider
 *
 * DashScope 兼容 OpenAI 接口格式,通过 `ChatOpenAI` + 自定义 `baseURL`
 * 直接复用 LangChain 实现,无需独立适配器。
 *
 * `reasoning_content`(思考过程)由 ChatOpenAI 通过 `additional_kwargs.reasoning_content`
 * 透传,前端如需展示可从 AIMessageChunk.additional_kwargs 读取。
 * 这里通过 modelKwargs 透传 `enable_thinking: true`。
 */

import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { ChatOpenAI } from '@langchain/openai';
import type { LLMConfig, LLMProvider } from './provider.types';

export class DashscopeProvider implements LLMProvider {
    readonly name = 'dashscope';
    readonly model: string;
    private chatModel: ChatOpenAI;

    constructor(config: LLMConfig) {
        const apiKey = config.apiKey ?? process.env.DASHSCOPE_API_KEY;
        if (!apiKey) throw new Error('DashScope API key is required');

        this.model = config.model ?? 'qwen-plus';

        this.chatModel = new ChatOpenAI({
            apiKey,
            model: this.model,
            temperature: (config.temperature as number) ?? 0.7,
            maxTokens: (config.maxTokens as number) ?? 4096,
            streaming: true,
            configuration: {
                baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
            },
            // DashScope 扩展参数,通过 modelKwargs 透传给底层 API
            modelKwargs: {
                enable_thinking: true,
            },
        });
    }

    getChatModel(): BaseChatModel {
        return this.chatModel;
    }
}
