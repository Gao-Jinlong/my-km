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

        // tool 消息（ToolMessage）是 LLM 上下文反馈，不在聊天流展示；
        // 但其 tool_call_id 仍参与预扫描，使 ai-1 的 toolStatus 派生为 completed。
        expect(messages).toEqual([
            {
                id: 'h-1',
                role: 'human',
                content: 'Hello',
                toolCalls: undefined,
                toolCallId: undefined,
                toolStatus: undefined,
                toolName: undefined,
            },
            {
                id: 'ai-1',
                role: 'ai',
                content: 'Reading...',
                toolCalls: [{ id: 'tc-1', name: 'doc_read', args: undefined }],
                toolCallId: undefined,
                // 后续存在 tool_call_id=tc-1 的回执 → completed（即使 tool 消息被隐藏，预扫描仍收集）
                toolStatus: 'completed',
                toolName: 'doc_read',
            },
        ]);
    });

    it('derives toolStatus=pending for ai message whose tool_call has no matching tool reply (interrupt in flight)', () => {
        const messages = projectMessages([
            { id: 'h-1', type: 'human', content: 'create file' },
            {
                id: 'ai-1',
                type: 'ai',
                content: '',
                tool_calls: [
                    {
                        id: 'tc-1',
                        name: 'file_ops',
                        args: { operation: 'create', path: 'ginlon.km' },
                    },
                ],
            },
            // 无 tool 回执 → 工具调用仍 pending（interrupt 等待前端执行）
        ]);

        expect(messages).toHaveLength(2);
        const ai = messages[1];
        expect(ai.toolStatus).toBe('pending');
        expect(ai.toolCalls?.[0]).toEqual({
            id: 'tc-1',
            name: 'file_ops',
            args: { operation: 'create', path: 'ginlon.km' },
        });
    });

    it('keeps toolStatus=pending when only some tool_calls have replies', () => {
        const messages = projectMessages([
            {
                id: 'ai-1',
                type: 'ai',
                content: '',
                tool_calls: [
                    { id: 'tc-1', name: 'file_ops' },
                    { id: 'tc-2', name: 'doc_read' },
                ],
            },
            // 只有 tc-1 有回执，tc-2 没有 → 整体仍 pending
            { id: 'tool-1', type: 'tool', content: 'ok', tool_call_id: 'tc-1' },
        ]);

        expect(messages[0].toolStatus).toBe('pending');
    });

    it('respects explicit additional_kwargs.tool_status over derived status', () => {
        const messages = projectMessages([
            {
                id: 'ai-1',
                type: 'ai',
                content: '',
                tool_calls: [{ id: 'tc-1', name: 'file_ops' }],
                additional_kwargs: { tool_status: 'rejected' },
            },
        ]);

        expect(messages[0].toolStatus).toBe('rejected');
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
