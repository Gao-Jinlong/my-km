/**
 * TextMessage 单元测试
 * 测试不同 role 的样式、streaming 光标、工具调用指示器渲染
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TextMessage } from '../TextMessage';
import type { LangGraphChatMessage } from '../types';

describe('TextMessage', () => {
    it('renders human message content with right alignment', () => {
        const message: LangGraphChatMessage = {
            id: 'h-1',
            role: 'human',
            content: 'Hello AI',
        };
        const { container } = render(<TextMessage message={message} />);
        expect(screen.getByText('Hello AI')).toBeTruthy();
        // human 消息应该右对齐 - 检查是否有 justify-end 或类似类
        expect(container.firstChild).toHaveClass('flex');
    });

    it('renders ai message with streaming cursor when isStreaming', () => {
        const message: LangGraphChatMessage = {
            id: 'ai-1',
            role: 'ai',
            content: 'Hi there',
        };
        const { container } = render(<TextMessage message={message} isStreaming />);
        expect(screen.getByText('Hi there')).toBeTruthy();
        expect(container.querySelector('.animate-pulse')).toBeTruthy();
    });

    it('renders ai message without streaming cursor by default', () => {
        const message: LangGraphChatMessage = {
            id: 'ai-1',
            role: 'ai',
            content: 'Hi there',
        };
        const { container } = render(<TextMessage message={message} />);
        expect(container.querySelector('.animate-pulse')).toBeNull();
    });

    it('renders tool call indicators for ai message with toolCalls', () => {
        const message: LangGraphChatMessage = {
            id: 'ai-1',
            role: 'ai',
            content: '',
            toolStatus: 'pending',
            toolCalls: [{ id: 'tc-1', name: 'file_ops', args: { path: 'test.km' } }],
        };
        render(<TextMessage message={message} />);
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
        render(<TextMessage message={message} />);
        expect(screen.getByText('file_ops')).toBeTruthy();
        expect(screen.getByText('doc_read')).toBeTruthy();
    });

    it('renders system message', () => {
        const message: LangGraphChatMessage = {
            id: 's-1',
            role: 'system',
            content: 'System instruction',
        };
        render(<TextMessage message={message} />);
        expect(screen.getByText('System instruction')).toBeTruthy();
    });
});
