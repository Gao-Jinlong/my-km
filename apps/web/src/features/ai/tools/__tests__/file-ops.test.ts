import { describe, expect, it, vi } from 'vitest';
import type { FileSystemService } from '@/platform/file-system/service';
import { FileOpsHandler } from '../handlers/file-ops';

function createMockFileSystemService() {
    return {
        listFiles: vi.fn(),
        readFile: vi.fn(),
        writeFile: vi.fn(),
        createDirectory: vi.fn(),
        deleteFile: vi.fn(),
        deleteDirectory: vi.fn(),
        renameFile: vi.fn(),
        renameDirectory: vi.fn(),
        stat: vi.fn(),
    };
}

describe('FileOpsHandler', () => {
    const mockFs = createMockFileSystemService();
    const getProjectRoot = vi.fn().mockReturnValue('file://');
    const handler = new FileOpsHandler(mockFs as unknown as FileSystemService, getProjectRoot);

    it('name 和 type 正确', () => {
        expect(handler.name).toBe('file_ops');
        expect(handler.type).toBe('write');
    });

    describe('list 操作', () => {
        it('列出根目录内容', async () => {
            mockFs.listFiles.mockResolvedValue([
                { name: 'doc1.km', type: 'file', path: 'file://doc1.km' },
                { name: 'notes', type: 'directory', path: 'file://notes' },
            ]);

            const result = await handler.execute({
                operation: 'list',
                path: 'file://',
            });

            expect(result.success).toBe(true);
            expect(result.items).toHaveLength(2);
            expect((result.items as Array<{ name: string }>)[0].name).toBe('doc1.km');
        });

        it('递归列出子目录', async () => {
            mockFs.listFiles
                .mockResolvedValueOnce([{ name: 'notes', type: 'directory', path: 'file://notes' }])
                .mockResolvedValueOnce([
                    { name: 'note1.km', type: 'file', path: 'file://notes/note1.km' },
                ]);

            const result = await handler.execute({
                operation: 'list',
                path: 'file://',
                recursive: true,
                depth: 2,
            });

            expect(result.success).toBe(true);
            expect((result.items as Array<{ children?: unknown[] }>)[0].children).toHaveLength(1);
        });
    });

    describe('create 操作', () => {
        it('创建文件', async () => {
            mockFs.writeFile.mockResolvedValue(undefined);

            const result = await handler.execute({
                operation: 'create',
                path: 'file://new.km',
                type: 'file',
            });

            expect(result.success).toBe(true);
        });

        it('将相对路径创建到当前 file:// 项目根', async () => {
            const fs = createMockFileSystemService();
            fs.writeFile.mockResolvedValue(undefined);
            const fileHandler = new FileOpsHandler(
                fs as unknown as FileSystemService,
                () => 'file://',
            );

            const result = await fileHandler.execute({
                operation: 'create',
                path: 'notes/new.km',
                type: 'file',
            });

            expect(result.success).toBe(true);
            expect(fs.writeFile).toHaveBeenCalledWith('file://notes/new.km', expect.any(String));
        });

        it('拒绝旧的 memory:// 路径并提示使用当前项目 file:// 路径', async () => {
            const fs = createMockFileSystemService();
            const fileHandler = new FileOpsHandler(
                fs as unknown as FileSystemService,
                () => 'file://',
            );

            const result = await fileHandler.execute({
                operation: 'create',
                path: 'memory://my-km/notes/new.km',
                type: 'file',
            });

            expect(result.success).toBe(false);
            expect(result.error).toContain('file://');
            expect(fs.writeFile).not.toHaveBeenCalled();
        });

        it('创建文件夹', async () => {
            mockFs.createDirectory.mockResolvedValue(undefined);

            const result = await handler.execute({
                operation: 'create',
                path: 'file://new-folder',
                type: 'folder',
            });

            expect(result.success).toBe(true);
        });
    });

    describe('delete 操作', () => {
        it('删除文件', async () => {
            mockFs.stat.mockResolvedValue({ type: 'file' });
            mockFs.deleteFile.mockResolvedValue(undefined);

            const result = await handler.execute({
                operation: 'delete',
                path: 'file://doc.km',
            });

            expect(result.success).toBe(true);
        });
    });

    describe('copy 操作', () => {
        it('将相对 destination 归一化到当前 file:// 项目根', async () => {
            const fs = createMockFileSystemService();
            fs.readFile.mockResolvedValue('content');
            fs.writeFile.mockResolvedValue(undefined);
            const fileHandler = new FileOpsHandler(
                fs as unknown as FileSystemService,
                () => 'file://',
            );

            const result = await fileHandler.execute({
                operation: 'copy',
                path: 'file://source.km',
                destination: 'copies/source.km',
            });

            expect(result.success).toBe(true);
            expect(fs.writeFile).toHaveBeenCalledWith('file://copies/source.km', 'content');
        });
    });

    describe('describe()', () => {
        it('返回可读描述', () => {
            const desc = handler.describe({ operation: 'list', path: 'file://test' });
            expect(desc).toContain('列出');
            expect(desc).toContain('file://test');
        });
    });
});
