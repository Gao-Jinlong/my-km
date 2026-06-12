import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DocReadHandler } from '../handlers/doc-read';

function createMocks() {
    const documentStore = {
        get: vi.fn(),
        getByPath: vi.fn(),
    };
    const editorContainer = {
        getService: vi.fn(),
    };
    const fileSystemService = {
        readFile: vi.fn(),
    };
    return { documentStore, editorContainer, fileSystemService };
}

function makeKmFile(blocks: any[], metadata?: Record<string, any>): string {
    return JSON.stringify({
        metadata: {
            version: '1.0.0',
            createdAt: '',
            updatedAt: '',
            ...metadata,
        },
        content: blocks,
    });
}

describe('DocReadHandler', () => {
    let documentStore: ReturnType<typeof createMocks>['documentStore'];
    let editorContainer: ReturnType<typeof createMocks>['editorContainer'];
    let fileSystemService: ReturnType<typeof createMocks>['fileSystemService'];
    let handler: DocReadHandler;

    beforeEach(() => {
        const mocks = createMocks();
        documentStore = mocks.documentStore;
        editorContainer = mocks.editorContainer;
        fileSystemService = mocks.fileSystemService;
        handler = new DocReadHandler(
            documentStore as never,
            editorContainer as never,
            fileSystemService as never,
        );
    });

    it('name 和 type 正确', () => {
        expect(handler.name).toBe('doc_read');
        expect(handler.type).toBe('read');
    });

    describe('text 格式 — 已打开文档', () => {
        it('读取完整内容', async () => {
            documentStore.get.mockReturnValue({
                id: 'doc1',
                path: 'memory://test/doc.km',
                title: 'Test',
            });
            editorContainer.getService.mockReturnValue({
                getFullContent: () => 'line1\nline2\nline3',
            });
            fileSystemService.readFile.mockResolvedValue(
                makeKmFile([{ type: 'paragraph', content: { inline: [{ text: 'line1\nline2\nline3' }] } }]),
            );

            const result = await handler.execute({ documentId: 'doc1', format: 'text' });

            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.content).toBe('line1\nline2\nline3');
                expect(result.totalLines).toBe(3);
            }
        });

        it('按行范围读取', async () => {
            documentStore.get.mockReturnValue({
                id: 'doc1',
                path: 'memory://test/doc.km',
                title: 'Test',
            });
            editorContainer.getService.mockReturnValue({
                getFullContent: () => 'line1\nline2\nline3\nline4',
            });
            fileSystemService.readFile.mockResolvedValue(
                makeKmFile([{ type: 'paragraph', content: { inline: [{ text: 'line1\nline2\nline3\nline4' }] } }]),
            );

            const result = await handler.execute({
                documentId: 'doc1',
                format: 'text',
                rangeType: 'text-range',
                startLine: 2,
                endLine: 3,
            });

            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.content).toBe('line2\nline3');
            }
        });
    });

    describe('text 格式 — 未打开文档', () => {
        it('通过 path 读取', async () => {
            documentStore.getByPath.mockReturnValue(undefined);
            fileSystemService.readFile.mockResolvedValue(
                makeKmFile([
                    { type: 'paragraph', content: { inline: [{ text: 'Hello world' }] } },
                ]),
            );

            const result = await handler.execute({
                path: 'memory://test/doc.km',
                format: 'text',
            });

            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.content).toContain('Hello world');
            }
        });
    });

    describe('blocks 格式', () => {
        it('返回结构化 block 数据', async () => {
            documentStore.get.mockReturnValue({
                id: 'doc1',
                path: 'memory://test/doc.km',
                title: 'Test',
            });
            editorContainer.getService.mockReturnValue(null);
            fileSystemService.readFile.mockResolvedValue(
                makeKmFile([
                    { type: 'paragraph', content: { inline: [{ text: 'Hello' }] } },
                    { type: 'heading', content: { inline: [{ text: 'Title' }], level: 1 } },
                ]),
            );

            const result = await handler.execute({
                documentId: 'doc1',
                format: 'blocks',
            });

            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.blocks).toHaveLength(2);
                expect((result.blocks as any[])[0].type).toBe('paragraph');
                expect((result.blocks as any[])[1].type).toBe('heading');
            }
        });

        it('按 block 索引范围读取', async () => {
            documentStore.get.mockReturnValue({
                id: 'doc1',
                path: 'memory://test/doc.km',
                title: 'Test',
            });
            editorContainer.getService.mockReturnValue(null);
            fileSystemService.readFile.mockResolvedValue(
                makeKmFile([
                    { type: 'paragraph', content: { inline: [{ text: 'A' }] } },
                    { type: 'paragraph', content: { inline: [{ text: 'B' }] } },
                    { type: 'paragraph', content: { inline: [{ text: 'C' }] } },
                ]),
            );

            const result = await handler.execute({
                documentId: 'doc1',
                format: 'blocks',
                rangeType: 'blocks',
                blockStart: 1,
                blockEnd: 3,
            });

            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.blocks).toHaveLength(2);
            }
        });
    });

    describe('raw 格式', () => {
        it('返回原始 .km JSON 字符串', async () => {
            documentStore.get.mockReturnValue({
                id: 'doc1',
                path: 'memory://test/doc.km',
                title: 'Test',
            });
            editorContainer.getService.mockReturnValue(null);
            const rawContent = makeKmFile([
                { type: 'paragraph', content: { inline: [{ text: 'Hello' }] } },
            ]);
            fileSystemService.readFile.mockResolvedValue(rawContent);

            const result = await handler.execute({
                documentId: 'doc1',
                format: 'raw',
            });

            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.content).toBe(rawContent);
                expect(result.format).toBe('raw');
            }
        });
    });

    describe('error cases', () => {
        it('缺少 documentId 和 path 时返回错误', async () => {
            const result = await handler.execute({ format: 'text' });
            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error).toMatch(/Either documentId or path is required/);
            }
        });

        it('documentId 不存在时返回错误', async () => {
            documentStore.get.mockReturnValue(undefined);
            const result = await handler.execute({ documentId: 'nonexistent', format: 'text' });
            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error).toMatch(/Document not found: nonexistent/);
            }
        });
    });

    describe('describe()', () => {
        it('返回可读描述', () => {
            const desc = handler.describe({ documentId: 'doc1', format: 'text' });
            expect(desc).toContain('doc1');
            expect(desc).toContain('text');
        });

        it('描述 path 参数', () => {
            const desc = handler.describe({ path: '/test/doc.km', format: 'blocks' });
            expect(desc).toContain('/test/doc.km');
            expect(desc).toContain('blocks');
        });
    });
});
