/**
 * Tool Node Span 创建辅助
 */

import { SpanKind, SpanStatusCode, trace } from '@opentelemetry/api';

export interface ToolSpanOptions {
    toolName: string;
    toolCallId: string;
}

export function startToolSpan(options: ToolSpanOptions) {
    const tracer = trace.getTracer('my-km-server');
    const span = tracer.startSpan('tool_node.interrupt', {
        kind: SpanKind.INTERNAL,
        attributes: {
            'tool.name': options.toolName,
            'tool.call_id': options.toolCallId,
        },
    });
    span.addEvent('interrupt_sent');
    return span;
}

export function endToolSpan(span: import('@opentelemetry/api').Span, error?: string): void {
    if (error) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: error });
    } else {
        span.addEvent('interrupt_resumed');
        span.setStatus({ code: SpanStatusCode.OK });
    }
    span.end();
}
