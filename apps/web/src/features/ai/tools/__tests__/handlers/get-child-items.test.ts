import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GetChildItemsHandler } from '../../handlers/get-child-items';

describe('GetChildItemsHandler', () => {
    let fileSystemService: { listFiles: ReturnType<typeof vi.fn> };
    let getProjectRoot: ReturnType<typeof vi.fn>;
    let handler: GetChildItemsHandler;

    beforeEach(() => {
        fileSystemService = { listFiles: vi.fn() };
        getProjectRoot = vi.fn().mockReturnValue('memory://project');
        handler = new GetChildItemsHandler(fileSystemService as never, getProjectRoot);
    });

    it('name 应为 get_child_items', () => {
        expect(handler.name).toBe('get_child_items');
    });

    it('type 应为 read', () => {
        expect(handler.type).toBe('read');
    });

    it('未提供 root 时应使用项目根目录', async () => {
        fileSystemService.listFiles.mockResolvedValue([]);
        await handler.execute({});
        expect(getProjectRoot).toHaveBeenCalled();
        expect(fileSystemService.listFiles).toHaveBeenCalledWith('memory://project');
    });

    it('depth=1 应只列出一级子项', async () => {
        fileSystemService.listFiles.mockResolvedValueOnce([
            { type: 'file', name: 'a.km', path: 'memory://project/a.km' },
            { type: 'directory', name: 'sub', path: 'memory://project/sub' },
        ]);

        const result = await handler.execute({ depth: 1 });

        expect(result.success).toBe(true);
        expect(result.items).toEqual([
            { name: 'a.km', type: 'file', path: 'memory://project/a.km' },
            { name: 'sub', type: 'directory', path: 'memory://project/sub' },
        ]);
        expect(fileSystemService.listFiles).toHaveBeenCalledTimes(1);
    });

    it('depth=2 应递归一级子目录', async () => {
        fileSystemService.listFiles
            .mockResolvedValueOnce([
                { type: 'directory', name: 'sub', path: 'memory://project/sub' },
            ])
            .mockResolvedValueOnce([
                { type: 'file', name: 'inner.km', path: 'memory://project/sub/inner.km' },
            ]);

        const result = await handler.execute({ depth: 2 });

        expect(result.success).toBe(true);
        expect(result.items).toEqual([
            {
                name: 'sub',
                type: 'directory',
                path: 'memory://project/sub',
                children: [
                    { name: 'inner.km', type: 'file', path: 'memory://project/sub/inner.km' },
                ],
            },
        ]);
    });

    it('listFiles 抛出错误时应返回错误结果', async () => {
        fileSystemService.listFiles.mockRejectedValue(new Error('not found'));

        const result = await handler.execute({ root: 'memory://nowhere' });

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/not found/);
    });

    it('无项目根目录且未提供 root 时应返回错误', async () => {
        getProjectRoot.mockReturnValue(null);

        const result = await handler.execute({});

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/no project root/i);
    });
});
