import { describe, expect, it, vi } from 'vitest';
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
    const mockFs = createMockFileSystemService() as any;
    const getProjectRoot = vi.fn().mockReturnValue('memory://test-project');
    const handler = new FileOpsHandler(mockFs, getProjectRoot);

    it('name 和 type 正确', () => {
        expect(handler.name).toBe('file_ops');
        expect(handler.type).toBe('read');
    });

    describe('list 操作', () => {
        it('列出根目录内容', async () => {
            mockFs.listFiles.mockResolvedValue([
                { name: 'doc1.km', type: 'file', path: 'memory://test-project/doc1.km' },
                { name: 'notes', type: 'directory', path: 'memory://test-project/notes' },
            ]);

            const result = await handler.execute({
                operation: 'list',
                path: 'memory://test-project',
            });

            expect(result.success).toBe(true);
            expect(result.items).toHaveLength(2);
            expect((result.items as any[])[0].name).toBe('doc1.km');
        });

        it('递归列出子目录', async () => {
            mockFs.listFiles
                .mockResolvedValueOnce([
                    { name: 'notes', type: 'directory', path: 'memory://test-project/notes' },
                ])
                .mockResolvedValueOnce([
                    { name: 'note1.km', type: 'file', path: 'memory://test-project/notes/note1.km' },
                ]);

            const result = await handler.execute({
                operation: 'list',
                path: 'memory://test-project',
                recursive: true,
                depth: 2,
            });

            expect(result.success).toBe(true);
            expect((result.items as any[])[0].children).toHaveLength(1);
        });
    });

    describe('create 操作', () => {
        it('创建文件', async () => {
            mockFs.writeFile.mockResolvedValue(undefined);

            const result = await handler.execute({
                operation: 'create',
                path: 'memory://test-project/new.km',
                type: 'file',
            });

            expect(result.success).toBe(true);
        });

        it('创建文件夹', async () => {
            mockFs.createDirectory.mockResolvedValue(undefined);

            const result = await handler.execute({
                operation: 'create',
                path: 'memory://test-project/new-folder',
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
                path: 'memory://test-project/doc.km',
            });

            expect(result.success).toBe(true);
        });
    });

    describe('describe()', () => {
        it('返回可读描述', () => {
            const desc = handler.describe({ operation: 'list', path: 'memory://test' });
            expect(desc).toContain('列出');
            expect(desc).toContain('memory://test');
        });
    });
});
