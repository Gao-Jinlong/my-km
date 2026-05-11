/**
 * Alibaba Cloud DashScope (阿里云百炼) LLM Provider
 *
 * DashScope 兼容 OpenAI 接口格式，直接使用 OpenAI SDK。
 * 支持 reasoning_content（思考过程）输出。
 */

import OpenAI from 'openai';
import type { LLMMessage, LLMOutput, ToolDefinition } from '../ai.types';
import type { LLMConfig, LLMProvider } from './provider.types';

export class DashscopeProvider implements LLMProvider {
    readonly name = 'dashscope';
    private client: OpenAI;
    readonly model: string;
    private maxTokens: number;
    private temperature: number;

    constructor(config: LLMConfig) {
        const apiKey = config.apiKey ?? process.env.DASHSCOPE_API_KEY;
        if (!apiKey) throw new Error('DashScope API key is required');

        this.client = new OpenAI({
            apiKey,
            baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        });
        this.model = config.model ?? 'qwen-plus';
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
                // DashScope 扩展参数，支持思考过程
                enable_thinking: true,
            } as OpenAI.ChatCompletionCreateParamsStreaming,
            {
                signal: abortSignal,
            },
        );

        let currentToolUse: { id?: string; name?: string; input: string } | null = null;

        for await (const chunk of stream) {
            const delta = chunk.choices[0]?.delta;
            if (!delta) continue;

            // DashScope reasoning_content（思考过程）
            if ((delta as any).reasoning_content) {
                yield { type: 'text_chunk', content: (delta as any).reasoning_content };
            }

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
