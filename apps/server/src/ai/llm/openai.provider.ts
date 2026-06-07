/**
 * OpenAI LLM Provider
 *
 * 通过 LangChain `ChatOpenAI` 暴露 BaseChatModel,
 * 由 LangGraph 节点直接调用 `.bindTools(tools).stream(messages)`,
 * LangGraph 运行时通过内置 callbacks 自动捕获 token chunk
 * 并按 messages-tuple 协议发出 SSE 事件。
 */

import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { ChatOpenAI } from '@langchain/openai';
import type { LLMConfig, LLMProvider } from './provider.types';

export class OpenAIProvider implements LLMProvider {
    readonly name = 'openai';
    readonly model: string;
    private chatModel: ChatOpenAI;

    constructor(config: LLMConfig) {
        const apiKey = config.apiKey ?? process.env.OPENAI_API_KEY;
        if (!apiKey) throw new Error('OpenAI API key is required');

        this.model = config.model ?? 'gpt-4o';

        this.chatModel = new ChatOpenAI({
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
