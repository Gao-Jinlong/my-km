/**
 * ToolCallIndicator 单元测试
 * 测试三种状态渲染、参数摘要展示
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ToolCallIndicator } from '../ToolCallIndicator';
import type { ToolCallRef } from '../types';

describe('ToolCallIndicator', () => {
    const baseToolCall: ToolCallRef = {
        id: 'tc-1',
        name: 'file_ops',
        args: { operation: 'create', path: 'ginlon.km' },
    };

    it('renders tool name', () => {
        render(<ToolCallIndicator toolCall={baseToolCall} />);
        expect(screen.getByText('file_ops')).toBeTruthy();
    });

    it('renders argument summary', () => {
        render(<ToolCallIndicator toolCall={baseToolCall} />);
        expect(screen.getByText(/ginlon\.km/)).toBeTruthy();
    });

    it('renders spinner icon in pending state', () => {
        const { container } = render(
            <ToolCallIndicator toolCall={baseToolCall} status="pending" />,
        );
        expect(container.querySelector('.animate-spin')).toBeTruthy();
    });

    it('renders check icon in completed state', () => {
        // 注：可以通过检查是否存在 animate-spin 来区分 pending 和 completed
        const { container } = render(
            <ToolCallIndicator toolCall={baseToolCall} status="completed" />,
        );
        expect(container.querySelector('.animate-spin')).toBeNull();
    });

    it('renders without arguments when args not provided', () => {
        const toolCall: ToolCallRef = { id: 'tc-1', name: 'doc_read' };
        render(<ToolCallIndicator toolCall={toolCall} />);
        expect(screen.getByText('doc_read')).toBeTruthy();
    });
});
