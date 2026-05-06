/**
 * OpenAI LLM Provider
 *
 * 使用 openai SDK 实现流式输出和 tool call。
 */

import OpenAI from 'openai';
import type { LLMMessage, LLMOutput, ToolDefinition } from '../ai.types';
import type { LLMProvider } from './provider.types';

export class OpenAIProvider implements LLMProvider {
    readonly name = 'openai';
    private client: OpenAI;
    private model: string;

    constructor(apiKey: string, model?: string) {
        this.client = new OpenAI({ apiKey });
        this.model = model ?? 'gpt-4o';
    }

    async *chat(
        messages: LLMMessage[],
        tools?: ToolDefinition[],
        abortSignal?: AbortSignal,
    ): AsyncIterable<LLMOutput> {
        // 转换消息格式为 OpenAI API 格式
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

        // 转换工具定义为 OpenAI 格式
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
                max_tokens: 4096,
                messages: openaiMessages,
                tools: openaiTools,
                stream: true,
            },
            {
                signal: abortSignal,
            },
        );

        // 处理流式输出
        let currentToolUse: { id?: string; name?: string; input: string } | null = null;

        for await (const chunk of stream) {
            const delta = chunk.choices[0]?.delta;
            if (!delta) continue;

            // 文本内容
            if (delta.content) {
                yield { type: 'text_chunk', content: delta.content };
            }

            // Tool call 开始
            if (delta.tool_calls && delta.tool_calls.length > 0) {
                const tc = delta.tool_calls[0];
                if (tc.id) {
                    // 新的 tool call 开始
                    if (currentToolUse?.id && currentToolUse.name) {
                        // 发射上一个 tool call
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
                    // 累积 tool_use 参数
                    currentToolUse.input += tc.function?.arguments ?? '';
                }
            }
        }

        // 发射最后一个 tool call（如果有）
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
