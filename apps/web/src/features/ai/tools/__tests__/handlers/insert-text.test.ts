import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InsertTextHandler } from '../../handlers/insert-text';

describe('InsertTextHandler', () => {
    let documentStore: { get: ReturnType<typeof vi.fn> };
    let editorContainer: { getService: ReturnType<typeof vi.fn> };
    let fileSystemService: {
        readFile: ReturnType<typeof vi.fn>;
        writeFile: ReturnType<typeof vi.fn>;
    };
    let handler: InsertTextHandler;

    beforeEach(() => {
        documentStore = { get: vi.fn() };
        editorContainer = { getService: vi.fn() };
        fileSystemService = { readFile: vi.fn(), writeFile: vi.fn() };
        handler = new InsertTextHandler(
            documentStore as never,
            editorContainer as never,
            fileSystemService as never,
        );
    });

    it('name 应为 insert_text', () => {
        expect(handler.name).toBe('insert_text');
    });

    it('type 应为 write', () => {
        expect(handler.type).toBe('write');
    });

    it('缺少 text 应返回错误', async () => {
        const result = await handler.execute({ documentId: 'doc-1' });
        expect(result.success).toBe(false);
        expect(result.error).toMatch(/text is required/);
    });

    it('缺少 documentId 应返回错误', async () => {
        const result = await handler.execute({ text: 'hi' });
        expect(result.success).toBe(false);
        expect(result.error).toMatch(/documentId is required/);
    });

    it('文档不存在应返回错误', async () => {
        documentStore.get.mockReturnValue(undefined);
        const result = await handler.execute({ text: 'hi', documentId: 'x' });
        expect(result.success).toBe(false);
        expect(result.error).toMatch(/Document not found: x/);
    });

    it('已打开文档 position=cursor 应调用 insertTextAtCursor', async () => {
        documentStore.get.mockReturnValue({
            id: 'doc-1',
            path: '/a.km',
            title: 'A',
            type: 'km',
        });
        const insertSpy = vi.fn();
        editorContainer.getService.mockReturnValue({
            insertTextAtCursor: insertSpy,
            spliceText: vi.fn(),
            getFullContent: () => '',
        });

        const result = await handler.execute({
            text: 'hello',
            documentId: 'doc-1',
            position: 'cursor',
        });

        expect(result.success).toBe(true);
        expect(insertSpy).toHaveBeenCalledWith('hello');
    });

    it('已打开文档 position=end 应通过 spliceText 追加到末尾', async () => {
        documentStore.get.mockReturnValue({
            id: 'doc-1',
            path: '/a.km',
            title: 'A',
            type: 'km',
        });
        const spliceSpy = vi.fn().mockReturnValue({
            success: true,
            charsDeleted: 0,
            charsInserted: 5,
        });
        editorContainer.getService.mockReturnValue({
            insertTextAtCursor: vi.fn(),
            spliceText: spliceSpy,
            getFullContent: () => 'abc',
        });

        const result = await handler.execute({
            text: 'hello',
            documentId: 'doc-1',
            position: 'end',
        });

        expect(result.success).toBe(true);
        expect(spliceSpy).toHaveBeenCalledWith(3, 0, 'hello');
    });

    it('未打开文档应通过 fileSystemService 读写', async () => {
        documentStore.get.mockReturnValue({
            id: 'doc-2',
            path: '/b.km',
            title: 'B',
            type: 'km',
        });
        editorContainer.getService.mockReturnValue(null);
        fileSystemService.readFile.mockResolvedValue(
            JSON.stringify({
                metadata: { version: '1.0.0', createdAt: 'x', updatedAt: 'y', title: 'B' },
                content: [{ type: 'paragraph', content: { inline: [{ text: 'old' }] } }],
            }),
        );

        const result = await handler.execute({
            text: 'new',
            documentId: 'doc-2',
            position: 'end',
        });

        expect(result.success).toBe(true);
        expect(fileSystemService.writeFile).toHaveBeenCalledTimes(1);
        const [path, content] = fileSystemService.writeFile.mock.calls[0];
        expect(path).toBe('/b.km');
        const parsed = JSON.parse(content);
        const lastBlock = parsed.content[parsed.content.length - 1];
        expect(lastBlock.type).toBe('paragraph');
        expect(lastBlock.content.inline[0].text).toBe('new');
    });
});
