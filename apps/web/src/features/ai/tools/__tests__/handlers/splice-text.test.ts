import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SpliceTextHandler } from '../../handlers/splice-text';

describe('SpliceTextHandler', () => {
    let documentStore: { get: ReturnType<typeof vi.fn> };
    let editorContainer: { getService: ReturnType<typeof vi.fn> };
    let fileSystemService: {
        readFile: ReturnType<typeof vi.fn>;
        writeFile: ReturnType<typeof vi.fn>;
    };
    let handler: SpliceTextHandler;

    beforeEach(() => {
        documentStore = { get: vi.fn() };
        editorContainer = { getService: vi.fn() };
        fileSystemService = { readFile: vi.fn(), writeFile: vi.fn() };
        handler = new SpliceTextHandler(
            documentStore as never,
            editorContainer as never,
            fileSystemService as never,
        );
    });

    it('name 应为 splice_text', () => {
        expect(handler.name).toBe('splice_text');
    });

    it('type 应为 write', () => {
        expect(handler.type).toBe('write');
    });

    it('缺少 documentId 应返回错误', async () => {
        const result = await handler.execute({ start: 0, deleteCount: 0 });
        expect(result.success).toBe(false);
        expect(result.error).toMatch(/documentId is required/);
    });

    it('文档不存在应返回错误', async () => {
        documentStore.get.mockReturnValue(undefined);
        const result = await handler.execute({
            documentId: 'x',
            start: 0,
            deleteCount: 0,
        });
        expect(result.success).toBe(false);
        expect(result.error).toMatch(/Document not found/);
    });

    it('已打开文档应通过 EditorService.spliceText', async () => {
        documentStore.get.mockReturnValue({
            id: 'doc-1',
            path: '/a.km',
            title: 'A',
            type: 'km',
        });
        const spliceSpy = vi.fn().mockReturnValue({
            success: true,
            charsDeleted: 5,
            charsInserted: 11,
        });
        editorContainer.getService.mockReturnValue({ spliceText: spliceSpy });

        const result = await handler.execute({
            documentId: 'doc-1',
            start: 3,
            deleteCount: 5,
            insert: 'hello world',
        });

        expect(result.success).toBe(true);
        expect(result.charsDeleted).toBe(5);
        expect(result.charsInserted).toBe(11);
        expect(spliceSpy).toHaveBeenCalledWith(3, 5, 'hello world');
    });

    it('已打开文档 EditorService 返回失败时应透传错误', async () => {
        documentStore.get.mockReturnValue({
            id: 'doc-1',
            path: '/a.km',
            title: 'A',
            type: 'km',
        });
        editorContainer.getService.mockReturnValue({
            spliceText: () => ({
                success: false,
                error: 'Start position 999 out of bounds (content length: 10)',
                charsDeleted: 0,
                charsInserted: 0,
            }),
        });

        const result = await handler.execute({
            documentId: 'doc-1',
            start: 999,
            deleteCount: 0,
        });

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/out of bounds/);
    });

    it('未打开文档应读取 .km、执行 splice 并写回', async () => {
        documentStore.get.mockReturnValue({
            id: 'doc-2',
            path: '/b.km',
            title: 'B',
            type: 'km',
        });
        editorContainer.getService.mockReturnValue(null);
        fileSystemService.readFile.mockResolvedValue(
            JSON.stringify({
                metadata: {
                    version: '1.0.0',
                    createdAt: 'x',
                    updatedAt: 'y',
                    title: 'B',
                },
                content: [{ type: 'paragraph', content: { inline: [{ text: 'helloworld' }] } }],
            }),
        );

        // 'helloworld' → splice(5, 5, ' there') → 'hello there'
        const result = await handler.execute({
            documentId: 'doc-2',
            start: 5,
            deleteCount: 5,
            insert: ' there',
        });

        expect(result.success).toBe(true);
        expect(result.charsDeleted).toBe(5);
        expect(result.charsInserted).toBe(6);
        const [, content] = fileSystemService.writeFile.mock.calls[0];
        const parsed = JSON.parse(content);
        const text = parsed.content[0].content.inline[0].text;
        expect(text).toBe('hello there');
    });

    it('未打开文档 start 越界应返回错误', async () => {
        documentStore.get.mockReturnValue({
            id: 'doc-3',
            path: '/c.km',
            title: 'C',
            type: 'km',
        });
        editorContainer.getService.mockReturnValue(null);
        fileSystemService.readFile.mockResolvedValue(
            JSON.stringify({
                metadata: { version: '1.0.0', createdAt: '', updatedAt: '' },
                content: [{ type: 'paragraph', content: { inline: [{ text: 'short' }] } }],
            }),
        );

        const result = await handler.execute({
            documentId: 'doc-3',
            start: 100,
            deleteCount: 0,
        });

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/out of bounds/);
    });
});
