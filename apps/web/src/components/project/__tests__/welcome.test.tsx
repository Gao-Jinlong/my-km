import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Welcome } from '../welcome';

describe('Welcome', () => {
    it('应该渲染欢迎标题', () => {
        render(<Welcome onOpenProject={() => {}} />);

        expect(screen.getByText('My Knowledge Manager')).toBeInTheDocument();
    });

    it('应该渲染说明文字', () => {
        render(<Welcome onOpenProject={() => {}} />);

        expect(screen.getByText('开始管理您的知识库')).toBeInTheDocument();
    });

    it('应该渲染打开项目按钮', () => {
        render(<Welcome onOpenProject={() => {}} />);

        const button = screen.getByRole('button', { name: '打开项目' });
        expect(button).toBeInTheDocument();
    });

    it('应该调用 onOpenProject 当点击按钮', () => {
        const handleClick = vi.fn();
        render(<Welcome onOpenProject={handleClick} />);

        const button = screen.getByRole('button', { name: '打开项目' });
        fireEvent.click(button);

        expect(handleClick).toHaveBeenCalledTimes(1);
    });
});
