import { describe, expect, it, vi } from 'vitest';
import {
    recordToolCallEvents,
    recordToolInterruptEvent,
    toChatMessageForTest,
} from './use-langgraph-stream';

describe('useLangGraphStream trace logging', () => {
    it('records received tool calls from AI messages into the active trace span', () => {
        const span = { addEvent: vi.fn() };
        const message = toChatMessageForTest({
            id: 'ai-1',
            type: 'ai',
            content: '',
            tool_calls: [{ id: 'tc-1', name: 'doc_read', args: {} }],
        });

        recordToolCallEvents(span, [message], new Set());

        expect(span.addEvent).toHaveBeenCalledWith('tool_call_received', {
            'tool.call_id': 'tc-1',
            'tool.name': 'doc_read',
            messageId: 'ai-1',
        });
    });

    it('does not record the same tool call twice', () => {
        const span = { addEvent: vi.fn() };
        const seen = new Set<string>();
        const message = toChatMessageForTest({
            id: 'ai-1',
            type: 'ai',
            content: '',
            tool_calls: [{ id: 'tc-1', name: 'doc_read', args: {} }],
        });

        recordToolCallEvents(span, [message], seen);
        recordToolCallEvents(span, [message], seen);

        expect(span.addEvent).toHaveBeenCalledTimes(1);
    });

    it('records frontend interrupt tool calls when they are received', () => {
        const span = { addEvent: vi.fn() };
        const seen = new Set<string>();

        recordToolInterruptEvent(
            span,
            { toolCallId: 'tc-2', toolName: 'doc_edit', input: { path: 'a.km' } },
            seen,
        );

        expect(span.addEvent).toHaveBeenCalledWith('tool_call_interrupt_received', {
            'tool.call_id': 'tc-2',
            'tool.name': 'doc_edit',
        });
    });
});
