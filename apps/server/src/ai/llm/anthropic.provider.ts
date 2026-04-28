/**
 * Anthropic Claude LLM Provider
 *
 * 使用 @anthropic-ai/sdk 实现流式输出和 tool call。
 */

import Anthropic from '@anthropic-ai/sdk';
import type { LLMMessage, LLMOutput, ToolDefinition } from '../ai.types';
import type { LLMProvider } from './llm-provider.interface';

export class AnthropicProvider implements LLMProvider {
    readonly name = 'anthropic';
    private client: Anthropic;
    private model: string;

    constructor(apiKey: string, model?: string) {
        this.client = new Anthropic({ apiKey });
        this.model = model ?? 'claude-sonnet-4-20250514';
    }

    async *chat(
        messages: LLMMessage[],
        tools?: ToolDefinition[],
        abortSignal?: AbortSignal,
    ): AsyncIterable<LLMOutput> {
        // 转换消息格式为 Anthropic API 格式
        const anthropicMessages = messages.map(msg => {
            if (typeof msg.content === 'string') {
                return { role: msg.role, content: msg.content };
            }
            return { role: msg.role, content: msg.content };
        });

        const stream = await this.client.messages.create(
            {
                model: this.model,
                max_tokens: 4096,
                messages: anthropicMessages as Array<{ role: string; content: unknown }>,
                tools: tools as Array<{ name: string; description: string; input_schema: object }>,
                stream: true,
            },
            {
                signal: abortSignal,
            },
        );

        // 处理流式输出
        let currentToolUse: { id?: string; name?: string; input: string } | null = null;

        for await (const chunk of stream) {
            if (chunk.type === 'content_block_delta') {
                if (chunk.delta?.type === 'text_delta') {
                    yield { type: 'text_chunk', content: chunk.delta.text };
                } else if (chunk.delta?.type === 'input_json_delta') {
                    // 累积 tool_use 的参数
                    if (currentToolUse) {
                        currentToolUse.input += chunk.delta.partial_json;
                    }
                }
            } else if (chunk.type === 'content_block_start') {
                if (chunk.content_block?.type === 'tool_use') {
                    currentToolUse = {
                        id: chunk.content_block.id,
                        name: chunk.content_block.name,
                        input: '',
                    };
                }
            } else if (chunk.type === 'content_block_stop') {
                // tool_use 结束，发射完整的 tool_call
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
                    currentToolUse = null;
                }
            }
        }

        yield { type: 'done' };
    }
}
