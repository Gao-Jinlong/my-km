/**
 * Zhipu AI (智谱) LLM Provider
 *
 * Zhipu API 兼容 OpenAI 接口格式，直接使用 OpenAI SDK。
 */

import OpenAI from 'openai';
import type { LLMMessage, LLMOutput, ToolDefinition } from '../ai.types';
import type { LLMConfig, LLMProvider } from './provider.types';

export class ZhipuProvider implements LLMProvider {
    readonly name = 'zhipu';
    private client: OpenAI;
    readonly model: string;
    private maxTokens: number;
    private temperature: number;

    constructor(config: LLMConfig) {
        const apiKey = config.apiKey ?? process.env.ZHIPUAI_API_KEY;
        if (!apiKey) throw new Error('Zhipu API key is required');

        this.client = new OpenAI({
            apiKey,
            baseURL: 'https://open.bigmodel.cn/api/paas/v4',
        });
        this.model = config.model ?? 'glm-4-flash';
        this.maxTokens = (config.maxTokens as number) ?? 4096;
        this.temperature = (config.temperature as number) ?? 0.7;
    }

    async *chat(
        messages: LLMMessage[],
        tools?: ToolDefinition[],
        abortSignal?: AbortSignal,
    ): AsyncIterable<LLMOutput> {
        const openaiMessages: OpenAI.ChatCompletionMessageParam[] = messages.map(msg => {
            if (typeof msg.content === 'string') {
                return {
                    role: msg.role as 'user' | 'assistant' | 'system',
                    content: msg.content,
                } as OpenAI.ChatCompletionMessageParam;
            }
            return {
                role: msg.role as 'user' | 'assistant' | 'tool',
                content: msg.content as OpenAI.ChatCompletionContentPart[],
            } as OpenAI.ChatCompletionMessageParam;
        });

        const openaiTools: OpenAI.ChatCompletionTool[] | undefined = tools?.map(t => ({
            type: 'function' as const,
            function: {
                name: t.name,
                description: t.description,
                parameters: t.input_schema as Record<string, unknown>,
            },
        }));

        const stream = await this.client.chat.completions.create(
            {
                model: this.model,
                max_tokens: this.maxTokens,
                temperature: this.temperature,
                messages: openaiMessages,
                tools: openaiTools,
                stream: true,
            },
            {
                signal: abortSignal,
            },
        );

        let currentToolUse: { id?: string; name?: string; input: string } | null = null;

        for await (const chunk of stream) {
            const delta = chunk.choices[0]?.delta;
            if (!delta) continue;

            if (delta.content) {
                yield { type: 'text_chunk', content: delta.content };
            }

            if (delta.tool_calls && delta.tool_calls.length > 0) {
                const tc = delta.tool_calls[0];
                if (tc.id) {
                    if (currentToolUse?.id && currentToolUse.name) {
                        let parsedArgs: object = {};
                        try {
                            parsedArgs = currentToolUse.input
                                ? JSON.parse(currentToolUse.input)
                                : {};
                        } catch {
                            parsedArgs = { raw: currentToolUse.input };
                        }
                        yield {
                            type: 'tool_call',
                            toolCall: {
                                id: currentToolUse.id,
                                name: currentToolUse.name,
                                arguments: parsedArgs,
                            },
                        };
                    }
                    currentToolUse = {
                        id: tc.id,
                        name: tc.function?.name ?? '',
                        input: tc.function?.arguments ?? '',
                    };
                } else if (currentToolUse) {
                    currentToolUse.input += tc.function?.arguments ?? '';
                }
            }
        }

        if (currentToolUse?.id && currentToolUse.name) {
            let parsedArgs: object = {};
            try {
                parsedArgs = currentToolUse.input ? JSON.parse(currentToolUse.input) : {};
            } catch {
                parsedArgs = { raw: currentToolUse.input };
            }
            yield {
                type: 'tool_call',
                toolCall: {
                    id: currentToolUse.id,
                    name: currentToolUse.name,
                    arguments: parsedArgs,
                },
            };
        }

        yield { type: 'done' };
    }
}
