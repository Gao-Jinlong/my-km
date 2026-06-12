import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DocEditHandler } from '../../handlers/doc-edit';

describe('DocEditHandler', () => {
    let documentStore: { get: ReturnType<typeof vi.fn>; getByPath: ReturnType<typeof vi.fn> };
    let editorContainer: { getService: ReturnType<typeof vi.fn> };
    let fileSystemService: {
        readFile: ReturnType<typeof vi.fn>;
        writeFile: ReturnType<typeof vi.fn>;
    };
    let handler: DocEditHandler;

    beforeEach(() => {
        documentStore = { get: vi.fn(), getByPath: vi.fn() };
        editorContainer = { getService: vi.fn() };
        fileSystemService = { readFile: vi.fn(), writeFile: vi.fn() };
        handler = new DocEditHandler(
            documentStore as never,
            editorContainer as never,
            fileSystemService as never,
        );
    });

    it('name 应为 doc_edit', () => {
        expect(handler.name).toBe('doc_edit');
    });

    it('type 应为 write', () => {
        expect(handler.type).toBe('write');
    });

    it('缺少 operationType 应返回错误', async () => {
        const result = await handler.execute({ documentId: 'doc1' });
        expect(result.success).toBe(false);
        expect(result.error).toMatch(/operationType is required/);
    });

    it('不支持的操作类型应返回错误', async () => {
        documentStore.get.mockReturnValue({ id: 'doc1', path: '/a.km', title: 'A' });
        editorContainer.getService.mockReturnValue(null);
        const result = await handler.execute({
            operationType: 'unknown-op',
            documentId: 'doc1',
        });
        expect(result.success).toBe(false);
        expect(result.error).toMatch(/Unsupported operation/);
    });

    it('缺少 documentId 和 path 应返回错误', async () => {
        const result = await handler.execute({ operationType: 'splice-text' });
        expect(result.success).toBe(false);
        expect(result.error).toMatch(/Either documentId or path is required/);
    });

    describe('splice-text 操作', () => {
        it('缺少 position 应返回错误', async () => {
            documentStore.get.mockReturnValue({ id: 'doc1', path: '/a.km', title: 'A' });
            const result = await handler.execute({
                documentId: 'doc1',
                operationType: 'splice-text',
                deleteCount: 5,
            });
            expect(result.success).toBe(false);
            expect(result.error).toMatch(/position is required/);
        });

        it('缺少 deleteCount 应返回错误', async () => {
            documentStore.get.mockReturnValue({ id: 'doc1', path: '/a.km', title: 'A' });
            const result = await handler.execute({
                documentId: 'doc1',
                operationType: 'splice-text',
                position: 0,
            });
            expect(result.success).toBe(false);
            expect(result.error).toMatch(/deleteCount is required/);
        });

        it('文档不存在应返回错误', async () => {
            documentStore.get.mockReturnValue(undefined);
            const result = await handler.execute({
                documentId: 'nonexistent',
                operationType: 'splice-text',
                position: 0,
                deleteCount: 5,
            });
            expect(result.success).toBe(false);
            expect(result.error).toMatch(/Document not found/);
        });

        it('已打开文档应通过 EditorService.spliceText', async () => {
            documentStore.get.mockReturnValue({ id: 'doc1', path: '/a.km', title: 'A' });
            const spliceSpy = vi.fn().mockReturnValue({
                success: true,
                charsDeleted: 5,
                charsInserted: 7,
            });
            editorContainer.getService.mockReturnValue({ spliceText: spliceSpy });

            const result = await handler.execute({
                documentId: 'doc1',
                operationType: 'splice-text',
                position: 10,
                deleteCount: 5,
                text: 'new text',
            });

            expect(result.success).toBe(true);
            expect(result.charsDeleted).toBe(5);
            expect(result.charsInserted).toBe(7);
            expect(spliceSpy).toHaveBeenCalledWith(10, 5, 'new text');
        });

        it('已打开文档 EditorService 返回失败时应透传错误', async () => {
            documentStore.get.mockReturnValue({ id: 'doc1', path: '/a.km', title: 'A' });
            editorContainer.getService.mockReturnValue({
                spliceText: () => ({
                    success: false,
                    error: 'Position 999 out of bounds',
                }),
            });

            const result = await handler.execute({
                documentId: 'doc1',
                operationType: 'splice-text',
                position: 999,
                deleteCount: 0,
            });

            expect(result.success).toBe(false);
            expect(result.error).toMatch(/out of bounds/);
        });

        it('未打开文档应读取 .km、执行 splice 并写回', async () => {
            documentStore.get.mockReturnValue({ id: 'doc2', path: '/b.km', title: 'B' });
            editorContainer.getService.mockReturnValue(null);
            fileSystemService.readFile.mockResolvedValue(
                JSON.stringify({
                    metadata: { version: '1.0.0', createdAt: 'x', updatedAt: 'y', title: 'B' },
                    content: [
                        { type: 'paragraph', content: { inline: [{ text: 'helloworld' }] } },
                    ],
                }),
            );

            // 'helloworld' → splice(5, 5, ' there') → 'hello there'
            const result = await handler.execute({
                documentId: 'doc2',
                operationType: 'splice-text',
                position: 5,
                deleteCount: 5,
                text: ' there',
            });

            expect(result.success).toBe(true);
            expect(result.charsDeleted).toBe(5);
            expect(result.charsInserted).toBe(6);
            const [, content] = fileSystemService.writeFile.mock.calls[0];
            const parsed = JSON.parse(content);
            const text = parsed.content[0].content.inline[0].text;
            expect(text).toBe('hello there');
        });

        it('未打开文档 position 越界应返回错误', async () => {
            documentStore.get.mockReturnValue({ id: 'doc3', path: '/c.km', title: 'C' });
            editorContainer.getService.mockReturnValue(null);
            fileSystemService.readFile.mockResolvedValue(
                JSON.stringify({
                    metadata: { version: '1.0.0', createdAt: '', updatedAt: '' },
                    content: [{ type: 'paragraph', content: { inline: [{ text: 'short' }] } }],
                }),
            );

            const result = await handler.execute({
                documentId: 'doc3',
                operationType: 'splice-text',
                position: 100,
                deleteCount: 0,
            });

            expect(result.success).toBe(false);
            expect(result.error).toMatch(/out of bounds/);
        });

        it('通过 path 查找未打开文档应执行文件 splice', async () => {
            documentStore.getByPath.mockReturnValue({ id: 'doc4', path: '/d.km', title: 'D' });
            editorContainer.getService.mockReturnValue(null);
            fileSystemService.readFile.mockResolvedValue(
                JSON.stringify({
                    metadata: { version: '1.0.0', createdAt: 'x', updatedAt: 'y', title: 'D' },
                    content: [{ type: 'paragraph', content: { inline: [{ text: 'abc' }] } }],
                }),
            );

            const result = await handler.execute({
                path: '/d.km',
                operationType: 'splice-text',
                position: 3,
                deleteCount: 0,
                text: 'def',
            });

            expect(result.success).toBe(true);
            expect(result.charsInserted).toBe(3);
            expect(documentStore.getByPath).toHaveBeenCalledWith('/d.km');
        });

        it('通过 path 查找不存在的文档应仍尝试文件操作', async () => {
            documentStore.getByPath.mockReturnValue(undefined);

            // 不在 store 中但 path 存在：hasEditor=false，走 spliceOnFile
            fileSystemService.readFile.mockResolvedValue(
                JSON.stringify({
                    metadata: { version: '1.0.0', createdAt: 'x', updatedAt: 'y', title: 'E' },
                    content: [{ type: 'paragraph', content: { inline: [{ text: 'hello' }] } }],
                }),
            );

            const result = await handler.execute({
                path: '/e.km',
                operationType: 'splice-text',
                position: 5,
                deleteCount: 0,
                text: ' world',
            });

            expect(result.success).toBe(true);
            expect(result.charsInserted).toBe(6);
        });
    });

    describe('insert-text 操作', () => {
        it('缺少 text 应返回错误', async () => {
            documentStore.get.mockReturnValue({ id: 'doc1', path: '/a.km', title: 'A' });
            const result = await handler.execute({
                documentId: 'doc1',
                operationType: 'insert-text',
            });
            expect(result.success).toBe(false);
            expect(result.error).toMatch(/text is required/);
        });

        it('在已打开文档末尾插入文本', async () => {
            documentStore.get.mockReturnValue({ id: 'doc1', path: '/a.km', title: 'A' });
            const spliceSpy = vi.fn().mockReturnValue({
                success: true,
                charsDeleted: 0,
                charsInserted: 11,
            });
            editorContainer.getService.mockReturnValue({
                getFullContent: () => 'existing text',
                spliceText: spliceSpy,
            });

            const result = await handler.execute({
                documentId: 'doc1',
                operationType: 'insert-text',
                text: ' appended!',
            });

            expect(result.success).toBe(true);
            // insert-text appends at fullContent.length
            expect(spliceSpy).toHaveBeenCalledWith(13, 0, ' appended!');
        });

        it('在未打开文档末尾插入文本', async () => {
            documentStore.get.mockReturnValue({ id: 'doc2', path: '/b.km', title: 'B' });
            editorContainer.getService.mockReturnValue(null);
            fileSystemService.readFile.mockResolvedValue(
                JSON.stringify({
                    metadata: { version: '1.0.0', createdAt: 'x', updatedAt: 'y', title: 'B' },
                    content: [{ type: 'paragraph', content: { inline: [{ text: 'old' }] } }],
                }),
            );

            const result = await handler.execute({
                documentId: 'doc2',
                operationType: 'insert-text',
                text: 'new',
            });

            expect(result.success).toBe(true);
            expect(fileSystemService.writeFile).toHaveBeenCalledTimes(1);
            const [, content] = fileSystemService.writeFile.mock.calls[0];
            const parsed = JSON.parse(content);
            // 'old' + 'new' = 'oldnew'
            const combined = parsed.content.map((b: any) => b.content.inline[0]?.text ?? '').join('');
            expect(combined).toBe('oldnew');
        });
    });

    describe('describe()', () => {
        it('返回 splice-text 描述', () => {
            const desc = handler.describe({
                documentId: 'doc1',
                operationType: 'splice-text',
                position: 10,
                deleteCount: 5,
                text: 'new',
            });
            expect(desc).toContain('位置 10');
            expect(desc).toContain('删除 5');
        });

        it('返回 insert-text 描述', () => {
            const desc = handler.describe({
                documentId: 'doc1',
                operationType: 'insert-text',
                text: 'hello',
            });
            expect(desc).toContain('插入文本');
            expect(desc).toContain('hello');
        });

        it('未知操作类型返回通用描述', () => {
            const desc = handler.describe({
                documentId: 'doc1',
                operationType: 'custom-op',
            });
            expect(desc).toContain('custom-op');
        });

        it('使用 path 而非 documentId 时描述包含文件路径', () => {
            const desc = handler.describe({
                path: '/some/file.km',
                operationType: 'splice-text',
                position: 0,
                deleteCount: 3,
                text: 'abc',
            });
            expect(desc).toContain('/some/file.km');
        });
    });
});
