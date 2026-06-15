import { describe, expect, it } from 'vitest';
import { extractTaskInterrupts, projectMessages } from '../message-projection';

describe('LangGraph message projection', () => {
    it('projects LangGraph checkpoint messages without translating to the old wire protocol', () => {
        const messages = projectMessages([
            { id: 'h-1', type: 'human', content: 'Hello' },
            {
                id: 'ai-1',
                type: 'ai',
                content: 'Reading...',
                tool_calls: [{ id: 'tc-1', name: 'doc_read' }],
            },
            { id: 'tool-1', type: 'tool', content: 'ok', tool_call_id: 'tc-1' },
            {
                id: 'sys-1',
                type: 'system',
                content: 'hidden',
                additional_kwargs: { hide_from_ui: true },
            },
        ]);

        expect(messages).toEqual([
            {
                id: 'h-1',
                role: 'human',
                content: 'Hello',
                toolCalls: undefined,
                toolCallId: undefined,
            },
            {
                id: 'ai-1',
                role: 'ai',
                content: 'Reading...',
                toolCalls: [{ id: 'tc-1', name: 'doc_read' }],
                toolCallId: undefined,
            },
            {
                id: 'tool-1',
                role: 'tool',
                content: 'ok',
                toolCalls: undefined,
                toolCallId: 'tc-1',
            },
        ]);
    });

    it('extracts frontend tool interrupts from LangGraph tasks events', () => {
        const interrupts = extractTaskInterrupts({
            id: 'task-1',
            name: 'tools',
            interrupts: [
                {
                    id: 'interrupt-1',
                    value: {
                        tool_call_id: 'tc-1',
                        tool_name: 'file_ops',
                        args: { path: 'notes/a.km' },
                    },
                },
            ],
        });

        expect(interrupts).toEqual([
            {
                toolCallId: 'tc-1',
                toolName: 'file_ops',
                input: { path: 'notes/a.km' },
            },
        ]);
    });
});
