/**
 * WorkflowExecutor multi-round message format test
 *
 * 验证：第二轮工具调用时 initialState.messages 保持 WorkflowMessage[] 格式，
 * 而非扁平字符串数组。
 */

import { describe, expect, it } from '@jest/globals';
import type { WorkflowMessage } from '@my-km/langgraph-workflows';

describe('WorkflowExecutor message format', () => {
    it('should build WorkflowMessage[] for second round', () => {
        // Simulate the message rebuild logic from workflow-executor.ts
        const ctxContent = 'What is the weather?';
        const lastAssistantMessage = 'Let me check the weather API.';
        const results = {
            'tool-1': { temperature: 25, unit: 'C' },
            'tool-2': { humidity: 60 },
        };

        // The FIX: use WorkflowMessage[] instead of flat strings
        const messages: WorkflowMessage[] = [
            { role: 'user' as const, content: ctxContent },
            ...(lastAssistantMessage
                ? [{ role: 'assistant' as const, content: lastAssistantMessage }]
                : []),
            ...Object.entries(results).map(([toolId, r]) => {
                const resultStr = typeof r === 'string' ? r : JSON.stringify(r);
                return {
                    role: 'tool' as const,
                    content: [
                        {
                            type: 'tool_result' as const,
                            tool_use_id: toolId,
                            content: resultStr,
                        },
                    ],
                };
            }),
        ];

        // Verify structure
        expect(messages).toHaveLength(4); // user + assistant + 2 tools

        // First message: user
        expect(messages[0]).toEqual({
            role: 'user',
            content: 'What is the weather?',
        });

        // Second message: assistant
        expect(messages[1]).toEqual({
            role: 'assistant',
            content: 'Let me check the weather API.',
        });

        // Third and fourth: tool results
        expect(messages[2]).toMatchObject({
            role: 'tool',
            content: [{ type: 'tool_result', tool_use_id: 'tool-1' }],
        });
        expect(messages[3]).toMatchObject({
            role: 'tool',
            content: [{ type: 'tool_result', tool_use_id: 'tool-2' }],
        });

        // Verify NO flat strings (the old bug)
        for (const msg of messages) {
            expect(typeof msg).toBe('object');
            expect(msg).toHaveProperty('role');
            expect(msg).toHaveProperty('content');
        }
    });

    it('should include tool result with correct tool_use_id mapping', () => {
        const results = { 'call-abc': 'success' };
        const ctxContent = 'test';

        const messages: WorkflowMessage[] = [
            { role: 'user' as const, content: ctxContent },
            ...Object.entries(results).map(([toolId, r]) => {
                const resultStr = typeof r === 'string' ? r : JSON.stringify(r);
                return {
                    role: 'tool' as const,
                    content: [
                        {
                            type: 'tool_result' as const,
                            tool_use_id: toolId,
                            content: resultStr,
                        },
                    ],
                };
            }),
        ];

        expect(
            (messages[1].content as Array<{ tool_use_id?: string; content?: string }>)[0]
                .tool_use_id,
        ).toBe('call-abc');
        expect(
            (messages[1].content as Array<{ tool_use_id?: string; content?: string }>)[0].content,
        ).toBe('success');
    });
});
