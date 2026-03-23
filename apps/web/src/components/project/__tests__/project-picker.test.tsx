import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectPicker } from '../project-picker';

describe('ProjectPicker', () => {
    const mockHandle = {
        name: 'test-project',
        kind: 'directory',
    } as FileSystemDirectoryHandle;

    const defaultProps = {
        open: true,
        onClose: vi.fn(),
        onProjectSelected: vi.fn().mockResolvedValue(undefined),
    };

    beforeEach(() => {
        vi.clearAllMocks();
        // 默认设置 mock showDirectoryPicker
        vi.stubGlobal('showDirectoryPicker', vi.fn().mockResolvedValue(mockHandle));
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('当 open 为 false 时应该返回 null', () => {
        const { container } = render(<ProjectPicker {...defaultProps} open={false} />);
        expect(container.firstChild).toBeNull();
    });

    it('应该渲染标题', () => {
        render(<ProjectPicker {...defaultProps} />);
        expect(screen.getByText('选择项目目录')).toBeInTheDocument();
    });

    it('应该渲染说明文字', () => {
        render(<ProjectPicker {...defaultProps} />);
        expect(screen.getByText('选择一个文件夹作为您的项目目录')).toBeInTheDocument();
    });

    it('应该渲染取消按钮', () => {
        render(<ProjectPicker {...defaultProps} />);
        expect(screen.getByRole('button', { name: '取消' })).toBeInTheDocument();
    });

    it('应该渲染选择目录按钮', () => {
        render(<ProjectPicker {...defaultProps} />);
        expect(screen.getByRole('button', { name: '选择目录' })).toBeInTheDocument();
    });

    it('点击取消按钮应该调用 onClose', () => {
        const onClose = vi.fn();
        render(<ProjectPicker {...defaultProps} onClose={onClose} />);

        fireEvent.click(screen.getByRole('button', { name: '取消' }));
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('在不支持 File System Access API 时显示警告', () => {
        // 模拟不支持的环境
        vi.unstubAllGlobals();

        render(<ProjectPicker {...defaultProps} />);

        // 文本被 <br/> 分隔，使用函数匹配
        expect(
            screen.getByText(content => content.includes('您的浏览器不支持')),
        ).toBeInTheDocument();
    });

    it('点击选择目录按钮应该调用 showDirectoryPicker', async () => {
        render(<ProjectPicker {...defaultProps} />);

        fireEvent.click(screen.getByRole('button', { name: '选择目录' }));

        await waitFor(() => {
            expect(window.showDirectoryPicker).toHaveBeenCalledWith({
                mode: 'readwrite',
            });
        });
    });

    it('当用户取消时静默关闭对话框', async () => {
        const onClose = vi.fn();
        const mockAbortError = new DOMException('Aborted', 'AbortError');
        vi.stubGlobal('showDirectoryPicker', vi.fn().mockRejectedValue(mockAbortError));

        render(<ProjectPicker {...defaultProps} onClose={onClose} />);

        fireEvent.click(screen.getByRole('button', { name: '选择目录' }));

        await waitFor(() => {
            expect(onClose).toHaveBeenCalledTimes(1);
        });
    });

    it('当选择失败时显示错误信息', async () => {
        const mockError = new Error('Permission denied');
        vi.stubGlobal('showDirectoryPicker', vi.fn().mockRejectedValue(mockError));

        render(<ProjectPicker {...defaultProps} />);

        fireEvent.click(screen.getByRole('button', { name: '选择目录' }));

        // 等待错误消息出现（显示原始错误消息）
        await waitFor(() => {
            expect(screen.getByText('Permission denied')).toBeInTheDocument();
        });
    });

    it('在加载状态下禁用按钮', async () => {
        vi.stubGlobal(
            'showDirectoryPicker',
            vi
                .fn()
                .mockImplementation(() => new Promise(() => {})), // 永不 resolved，保持加载状态
        );

        render(<ProjectPicker {...defaultProps} />);

        fireEvent.click(screen.getByRole('button', { name: '选择目录' }));

        await waitFor(() => {
            expect(screen.getByRole('button', { name: '正在打开...' })).toBeDisabled();
        });
    });
});
