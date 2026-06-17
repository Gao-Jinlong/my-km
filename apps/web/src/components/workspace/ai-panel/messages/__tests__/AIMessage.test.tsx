/**
 * AIMessage 单元测试
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AIMessage } from '../AIMessage';
import type { LangGraphChatMessage } from '../types';

describe('AIMessage', () => {
    it('renders ai message content', () => {
        const message: LangGraphChatMessage = {
            id: 'ai-1',
            role: 'ai',
            content: 'Hello human',
        };
        render(<AIMessage message={message} />);
        expect(screen.getByText('Hello human')).toBeTruthy();
    });

    it('uses left alignment for ai messages', () => {
        const message: LangGraphChatMessage = {
            id: 'ai-1',
            role: 'ai',
            content: 'Hi',
        };
        const { container } = render(<AIMessage message={message} />);
        expect(container.firstChild).toHaveClass('justify-start');
    });

    it('uses secondary background for ai messages', () => {
        const message: LangGraphChatMessage = {
            id: 'ai-1',
            role: 'ai',
            content: 'Hi',
        };
        const { container } = render(<AIMessage message={message} />);
        expect(container.querySelector('.bg-ws-bg-secondary')).toBeTruthy();
    });

    it('shows streaming cursor when isStreaming is true', () => {
        const message: LangGraphChatMessage = {
            id: 'ai-1',
            role: 'ai',
            content: 'Thinking',
        };
        const { container } = render(<AIMessage message={message} isStreaming />);
        expect(container.querySelector('.animate-pulse')).toBeTruthy();
    });

    it('does not show streaming cursor by default', () => {
        const message: LangGraphChatMessage = {
            id: 'ai-1',
            role: 'ai',
            content: 'Thinking',
        };
        const { container } = render(<AIMessage message={message} />);
        expect(container.querySelector('.animate-pulse')).toBeNull();
    });

    it('renders tool call indicators when ai message has toolCalls', () => {
        const message: LangGraphChatMessage = {
            id: 'ai-1',
            role: 'ai',
            content: '',
            toolStatus: 'pending',
            toolCalls: [{ id: 'tc-1', name: 'file_ops', args: { path: 'test.km' } }],
        };
        render(<AIMessage message={message} />);
        expect(screen.getByText('file_ops')).toBeTruthy();
    });

    it('renders multiple tool call indicators', () => {
        const message: LangGraphChatMessage = {
            id: 'ai-1',
            role: 'ai',
            content: '',
            toolStatus: 'completed',
            toolCalls: [
                { id: 'tc-1', name: 'file_ops' },
                { id: 'tc-2', name: 'doc_read' },
            ],
        };
        render(<AIMessage message={message} />);
        expect(screen.getByText('file_ops')).toBeTruthy();
        expect(screen.getByText('doc_read')).toBeTruthy();
    });
});
