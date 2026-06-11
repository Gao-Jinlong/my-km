import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GetDocumentContentHandler } from '../../handlers/get-document-content';

describe('GetDocumentContentHandler', () => {
    let documentStore: { get: ReturnType<typeof vi.fn> };
    let editorContainer: { getService: ReturnType<typeof vi.fn> };
    let fileSystemService: { readFile: ReturnType<typeof vi.fn> };
    let handler: GetDocumentContentHandler;

    beforeEach(() => {
        documentStore = { get: vi.fn() };
        editorContainer = { getService: vi.fn() };
        fileSystemService = { readFile: vi.fn() };
        handler = new GetDocumentContentHandler(
            documentStore as never,
            editorContainer as never,
            fileSystemService as never,
        );
    });

    it('name should be get_document_content', () => {
        expect(handler.name).toBe('get_document_content');
    });

    it('type should be read', () => {
        expect(handler.type).toBe('read');
    });

    it('should return error when document does not exist', async () => {
        documentStore.get.mockReturnValue(undefined);
        const result = await handler.execute({ documentId: 'unknown' });
        expect(result.success).toBe(false);
        expect(result.error).toMatch(/Document not found: unknown/);
    });

    it('should use EditorService.getFullContent for open documents', async () => {
        documentStore.get.mockReturnValue({
            id: 'doc-1',
            path: '/notes/a.km',
            title: 'A',
            type: 'km',
        });
        editorContainer.getService.mockReturnValue({
            getFullContent: () => 'line one\nline two\nline three',
        });

        const result = await handler.execute({ documentId: 'doc-1' });

        expect(result.success).toBe(true);
        expect(result.content).toBe('line one\nline two\nline three');
        expect(result.totalLines).toBe(3);
        expect(result.title).toBe('A');
        expect(fileSystemService.readFile).not.toHaveBeenCalled();
    });

    it('should read from file system and parse .km for unopened documents', async () => {
        documentStore.get.mockReturnValue({
            id: 'doc-2',
            path: '/notes/b.km',
            title: 'B',
            type: 'km',
        });
        editorContainer.getService.mockReturnValue(null);
        fileSystemService.readFile.mockResolvedValue(
            JSON.stringify({
                metadata: { version: '1.0.0', createdAt: '', updatedAt: '' },
                content: [{ type: 'paragraph', content: { inline: [{ text: 'hello' }] } }],
            }),
        );

        const result = await handler.execute({ documentId: 'doc-2' });

        expect(result.success).toBe(true);
        expect(result.content).toBe('hello');
        expect(result.totalLines).toBe(1);
    });

    it('should correctly slice with startLine and endLine', async () => {
        documentStore.get.mockReturnValue({
            id: 'doc-1',
            path: '/x.km',
            title: 'X',
            type: 'km',
        });
        editorContainer.getService.mockReturnValue({
            getFullContent: () => 'a\nb\nc\nd\ne',
        });

        const result = await handler.execute({
            documentId: 'doc-1',
            startLine: 2,
            endLine: 4,
        });

        expect(result.success).toBe(true);
        expect(result.content).toBe('b\nc\nd');
        expect(result.startLine).toBe(2);
        expect(result.endLine).toBe(4);
    });

    it('should return error when startLine is out of bounds', async () => {
        documentStore.get.mockReturnValue({
            id: 'doc-1',
            path: '/x.km',
            title: 'X',
            type: 'km',
        });
        editorContainer.getService.mockReturnValue({
            getFullContent: () => 'a\nb',
        });

        const result = await handler.execute({ documentId: 'doc-1', startLine: 10 });

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/out of bounds/i);
    });
});
