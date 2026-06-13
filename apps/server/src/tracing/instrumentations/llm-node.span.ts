/**
 * LLM Node Span 创建辅助
 *
 * 在 llm-node.invoke 外层创建 OTel Span，记录：
 * - model, provider
 * - inputTokens, outputTokens
 * - prompt_sent / completion_received events
 */

import type { AIMessage } from '@langchain/core/messages';
import type { Context } from '@opentelemetry/api';
import { context, SpanKind, SpanStatusCode, trace } from '@opentelemetry/api';

export interface LLMSpanOptions {
    model: string;
    provider: string;
    /** 第几轮 LLM 调用（1-based） */
    round: number;
}

export interface LLMSpanResult {
    span: import('@opentelemetry/api').Span;
    ctx: Context;
}

export function startLLMSpan(options: LLMSpanOptions): LLMSpanResult {
    const tracer = trace.getTracer('my-km-server');
    const span = tracer.startSpan('llm_node.invoke', {
        kind: SpanKind.INTERNAL,
        attributes: {
            'llm.model': options.model,
            'llm.provider': options.provider,
            'llm.round': options.round,
        },
    });
    span.addEvent('prompt_sent');

    const ctx = trace.setSpan(context.active(), span);
    return { span, ctx };
}

export function endLLMSpan(
    span: import('@opentelemetry/api').Span,
    result: AIMessage | { error: string },
): void {
    if ('error' in result) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: result.error });
    } else {
        const msg = result as AIMessage;
        const usage = (
            msg as { usage_metadata?: { input_tokens?: number; output_tokens?: number } }
        ).usage_metadata;
        if (usage) {
            span.setAttributes({
                'llm.inputTokens': usage.input_tokens ?? 0,
                'llm.outputTokens': usage.output_tokens ?? 0,
            });
        }
        span.addEvent('completion_received');
        span.setStatus({ code: SpanStatusCode.OK });
    }
    span.end();
}
