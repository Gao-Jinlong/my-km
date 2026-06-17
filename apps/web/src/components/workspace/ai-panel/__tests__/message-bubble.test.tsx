/**
 * MessageBubble 单元测试（外观层）
 *
 * 重点测试路由逻辑：不同 role 的消息是否分发到正确的子组件。
 * 子组件的详细渲染逻辑在各自的测试文件中测试。
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { LangGraphChatMessage } from '@/features/ai/langgraph/types';
import { MessageBubble } from '../message-bubble';

describe('MessageBubble (Facade)', () => {
    it('renders human message via TextMessage', () => {
        const message: LangGraphChatMessage = {
            id: 'h-1',
            role: 'human',
            content: 'Hello',
        };
        render(<MessageBubble message={message} />);
        expect(screen.getByText('Hello')).toBeTruthy();
    });

    it('renders ai message via TextMessage', () => {
        const message: LangGraphChatMessage = {
            id: 'ai-1',
            role: 'ai',
            content: 'Hi there',
        };
        render(<MessageBubble message={message} />);
        expect(screen.getByText('Hi there')).toBeTruthy();
    });

    it('renders tool message via ToolMessage', () => {
        const message: LangGraphChatMessage = {
            id: 'tool-1',
            role: 'tool',
            toolCallId: 'tc-1',
            toolName: 'file_ops',
            content: 'File created',
        };
        render(<MessageBubble message={message} />);
        expect(screen.getByText('File created')).toBeTruthy();
        expect(screen.getByText('file_ops')).toBeTruthy();
    });

    it('passes isStreaming prop to TextMessage', () => {
        const message: LangGraphChatMessage = {
            id: 'ai-1',
            role: 'ai',
            content: 'Thinking',
        };
        const { container } = render(<MessageBubble message={message} isStreaming />);
        expect(container.querySelector('.animate-pulse')).toBeTruthy();
    });
});
