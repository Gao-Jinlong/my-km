/**
 * HumanMessage 单元测试
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HumanMessage } from '../HumanMessage';
import type { LangGraphChatMessage } from '../types';

describe('HumanMessage', () => {
    it('renders human message content', () => {
        const message: LangGraphChatMessage = {
            id: 'h-1',
            role: 'human',
            content: 'Hello AI',
        };
        render(<HumanMessage message={message} />);
        expect(screen.getByText('Hello AI')).toBeTruthy();
    });

    it('uses right alignment for human messages', () => {
        const message: LangGraphChatMessage = {
            id: 'h-1',
            role: 'human',
            content: 'Hi',
        };
        const { container } = render(<HumanMessage message={message} />);
        expect(container.firstChild).toHaveClass('justify-end');
    });

    it('uses accent background for human messages', () => {
        const message: LangGraphChatMessage = {
            id: 'h-1',
            role: 'human',
            content: 'Hi',
        };
        const { container } = render(<HumanMessage message={message} />);
        expect(container.querySelector('.bg-ws-accent')).toBeTruthy();
    });
});
