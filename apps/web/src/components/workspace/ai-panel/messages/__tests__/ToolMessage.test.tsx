/**
 * ToolMessage 单元测试
 * 测试 tool 角色消息的渲染
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ToolMessage } from '../ToolMessage';
import type { LangGraphChatMessage } from '../types';

describe('ToolMessage', () => {
    it('renders tool message content', () => {
        const message: LangGraphChatMessage = {
            id: 'tool-1',
            role: 'tool',
            toolCallId: 'tc-1',
            toolName: 'file_ops',
            content: 'File created successfully',
        };
        render(<ToolMessage message={message} />);
        expect(screen.getByText('File created successfully')).toBeTruthy();
    });

    it('displays tool name label', () => {
        const message: LangGraphChatMessage = {
            id: 'tool-1',
            role: 'tool',
            toolCallId: 'tc-1',
            toolName: 'doc_read',
            content: 'Document content...',
        };
        render(<ToolMessage message={message} />);
        expect(screen.getByText('doc_read')).toBeTruthy();
    });

    it('uses left alignment for tool messages', () => {
        const message: LangGraphChatMessage = {
            id: 'tool-1',
            role: 'tool',
            toolCallId: 'tc-1',
            toolName: 'file_ops',
            content: 'result',
        };
        const { container } = render(<ToolMessage message={message} />);
        expect(container.firstChild).toHaveClass('justify-start');
    });
});
