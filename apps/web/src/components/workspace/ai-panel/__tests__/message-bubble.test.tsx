/**
 * MessageBubble 单元测试（外观层）
 *
 * 重点测试路由逻辑：不同 role 的消息是否分发到正确的子组件。
 * 子组件的详细渲染逻辑在各自的测试文件中测试。
 *
 * 注意：ToolMessage 和 SystemMessage 在 message-projection.ts 中
 * 已被过滤为 null，不会到达 MessageBubble。此处仅测试实际会
 * 渲染的消息类型。
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { LangGraphChatMessage } from '@/features/ai/langgraph/types';
import { MessageBubble } from '../message-bubble';

describe('MessageBubble (Facade)', () => {
    it('renders human message via HumanMessage', () => {
        const message: LangGraphChatMessage = {
            id: 'h-1',
            role: 'human',
            content: 'Hello',
        };
        render(<MessageBubble message={message} />);
        expect(screen.getByText('Hello')).toBeTruthy();
    });

    it('renders ai message via AIMessage', () => {
        const message: LangGraphChatMessage = {
            id: 'ai-1',
            role: 'ai',
            content: 'Hi there',
        };
        render(<MessageBubble message={message} />);
        expect(screen.getByText('Hi there')).toBeTruthy();
    });

    it('passes isStreaming prop to AIMessage', () => {
        const message: LangGraphChatMessage = {
            id: 'ai-1',
            role: 'ai',
            content: 'Thinking',
        };
        const { container } = render(<MessageBubble message={message} isStreaming />);
        expect(container.querySelector('.animate-pulse')).toBeTruthy();
    });

    it('renders ai message with tool calls via AIMessage', () => {
        const message: LangGraphChatMessage = {
            id: 'ai-1',
            role: 'ai',
            content: 'Let me check that',
            toolStatus: 'pending',
            toolCalls: [{ id: 'tc-1', name: 'doc_read' }],
        };
        render(<MessageBubble message={message} />);
        expect(screen.getByText('Let me check that')).toBeTruthy();
        expect(screen.getByText('doc_read')).toBeTruthy();
    });
});
