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
            'tool.status': 'pending',
        },
    });
    span.addEvent('interrupt_sent', { 'tool.status': 'pending' });
    return span;
}

export function endToolSpan(
    span: import('@opentelemetry/api').Span,
    error?: string,
    status = error ? 'error' : 'resumed',
): void {
    span.setAttribute('tool.status', status);
    if (error) {
        span.addEvent('interrupt_error', { 'tool.status': status });
        span.setStatus({ code: SpanStatusCode.ERROR, message: error });
    } else {
        span.addEvent('interrupt_resumed', { 'tool.status': status });
        span.setStatus({ code: SpanStatusCode.OK });
    }
    span.end();
}
