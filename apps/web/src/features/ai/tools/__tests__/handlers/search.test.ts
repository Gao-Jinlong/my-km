import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SearchHandler } from '../../handlers/search';
import type { ToolResult } from '../../types';

interface MatchResult {
    line: number;
    column: number;
    snippet?: string;
}

interface SearchResult extends ToolResult {
    matches?: MatchResult[];
    totalMatches?: number;
    truncated?: boolean;
}

describe('SearchHandler', () => {
    let documentStore: { get: ReturnType<typeof vi.fn>; getByPath: ReturnType<typeof vi.fn>; getAll: ReturnType<typeof vi.fn> };
    let editorContainer: { getService: ReturnType<typeof vi.fn> };
    let fileSystemService: { readFile: ReturnType<typeof vi.fn>; listFiles: ReturnType<typeof vi.fn> };
    let getProjectRoot: ReturnType<typeof vi.fn>;
    let handler: SearchHandler;

    beforeEach(() => {
        documentStore = { get: vi.fn(), getByPath: vi.fn(), getAll: vi.fn() };
        editorContainer = { getService: vi.fn() };
        fileSystemService = { readFile: vi.fn(), listFiles: vi.fn() };
        getProjectRoot = vi.fn().mockReturnValue('memory://test-project');
        handler = new SearchHandler(
            documentStore as never,
            editorContainer as never,
            fileSystemService as never,
            getProjectRoot,
        );
    });

    it('name should be search', () => {
        expect(handler.name).toBe('search');
    });

    it('type should be read', () => {
        expect(handler.type).toBe('read');
    });

    describe('text mode', () => {
        it('should search within a single document via editor', async () => {
            editorContainer.getService.mockReturnValue({
                getFullContent: () => 'Hello world\nHello again\nGoodbye',
            });

            const result = (await handler.execute({
                type: 'text',
                query: 'Hello',
                documentId: 'doc1',
            })) as SearchResult;

            expect(result.success).toBe(true);
            expect(result.matches!.length).toBe(2);
            expect(result.totalMatches).toBe(2);
        });

        it('should find no matches when query is absent', async () => {
            editorContainer.getService.mockReturnValue({
                getFullContent: () => 'Hello world',
            });

            const result = (await handler.execute({
                type: 'text',
                query: 'xyz',
                documentId: 'doc1',
            })) as SearchResult;

            expect(result.success).toBe(true);
            expect(result.matches).toHaveLength(0);
            expect(result.totalMatches).toBe(0);
        });

        it('should fall back to file system when editor is not available', async () => {
            editorContainer.getService.mockReturnValue(null);
            documentStore.get.mockReturnValue({ id: 'doc1', path: '/notes/test.km', title: 'Test' });
            fileSystemService.readFile.mockResolvedValue(
                JSON.stringify({
                    metadata: { version: '1.0.0', createdAt: '', updatedAt: '' },
                    content: [{ type: 'paragraph', content: { inline: [{ text: 'Find me here' }] } }],
                }),
            );

            const result = (await handler.execute({
                type: 'text',
                query: 'Find',
                documentId: 'doc1',
            })) as SearchResult;

            expect(result.success).toBe(true);
            expect(result.matches!.length).toBe(1);
            expect(fileSystemService.readFile).toHaveBeenCalledWith('/notes/test.km');
        });

        it('should return error when document is not found', async () => {
            editorContainer.getService.mockReturnValue(null);
            documentStore.get.mockReturnValue(undefined);

            const result = await handler.execute({
                type: 'text',
                query: 'test',
                documentId: 'missing',
            });

            expect(result.success).toBe(false);
            expect(result.error).toMatch(/Document not found: missing/);
        });

        it('should search by path when no documentId is provided', async () => {
            fileSystemService.readFile.mockResolvedValue('line one\nline two with match\nline three');

            const result = (await handler.execute({
                type: 'text',
                query: 'match',
                path: '/some/file.txt',
            })) as SearchResult;

            expect(result.success).toBe(true);
            expect(result.matches!.length).toBe(1);
            expect(result.matches![0].line).toBe(2);
        });

        it('should require documentId or path', async () => {
            const result = await handler.execute({
                type: 'text',
                query: 'test',
            });

            expect(result.success).toBe(false);
            expect(result.error).toMatch(/documentId or path is required/);
        });

        it('should be case-insensitive by default', async () => {
            editorContainer.getService.mockReturnValue({
                getFullContent: () => 'Hello World',
            });

            const result = (await handler.execute({
                type: 'text',
                query: 'hello',
                documentId: 'doc1',
            })) as SearchResult;

            expect(result.success).toBe(true);
            expect(result.matches!.length).toBe(1);
        });

        it('should support case-sensitive search', async () => {
            editorContainer.getService.mockReturnValue({
                getFullContent: () => 'Hello hello',
            });

            const result = (await handler.execute({
                type: 'text',
                query: 'Hello',
                documentId: 'doc1',
                caseSensitive: true,
            })) as SearchResult;

            expect(result.success).toBe(true);
            expect(result.matches!.length).toBe(1);
            expect(result.matches![0].column).toBe(1);
        });

        it('should respect maxResults', async () => {
            editorContainer.getService.mockReturnValue({
                getFullContent: () => 'a\na\na\na\na',
            });

            const result = (await handler.execute({
                type: 'text',
                query: 'a',
                documentId: 'doc1',
                maxResults: 3,
            })) as SearchResult;

            expect(result.success).toBe(true);
            expect(result.matches!.length).toBe(3);
            expect(result.truncated).toBe(true);
        });

        it('should omit snippets when includeContent is false', async () => {
            editorContainer.getService.mockReturnValue({
                getFullContent: () => 'Hello world',
            });

            const result = (await handler.execute({
                type: 'text',
                query: 'Hello',
                documentId: 'doc1',
                includeContent: false,
            })) as SearchResult;

            expect(result.success).toBe(true);
            expect(result.matches![0].snippet).toBeUndefined();
        });

        it('should include snippets by default', async () => {
            editorContainer.getService.mockReturnValue({
                getFullContent: () => 'Hello world',
            });

            const result = (await handler.execute({
                type: 'text',
                query: 'Hello',
                documentId: 'doc1',
            })) as SearchResult;

            expect(result.success).toBe(true);
            expect(result.matches![0].snippet).toBe('Hello world');
        });

        it('should find multiple matches on the same line', async () => {
            editorContainer.getService.mockReturnValue({
                getFullContent: () => 'aaa',
            });

            const result = (await handler.execute({
                type: 'text',
                query: 'a',
                documentId: 'doc1',
            })) as SearchResult;

            expect(result.success).toBe(true);
            expect(result.matches!.length).toBe(3);
            expect(result.matches![0].column).toBe(1);
            expect(result.matches![1].column).toBe(2);
            expect(result.matches![2].column).toBe(3);
        });
    });

    describe('grep mode', () => {
        it('should return not-yet-implemented error', async () => {
            const result = await handler.execute({
                type: 'grep',
                query: 'TODO',
            });

            expect(result.success).toBe(false);
            expect(result.error).toContain('grep');
        });
    });

    describe('metadata mode', () => {
        it('should return not-yet-implemented error', async () => {
            const result = await handler.execute({
                type: 'metadata',
                query: 'tag:important',
            });

            expect(result.success).toBe(false);
            expect(result.error).toContain('metadata');
        });
    });

    describe('semantic mode', () => {
        it('should return not-yet-implemented error', async () => {
            const result = await handler.execute({
                type: 'semantic',
                query: 'concept of recursion',
            });

            expect(result.success).toBe(false);
            expect(result.error).toContain('semantic');
        });
    });

    describe('unknown type', () => {
        it('should return error for unknown search type', async () => {
            const result = await handler.execute({
                type: 'unknown',
                query: 'test',
            });

            expect(result.success).toBe(false);
            expect(result.error).toContain('Unknown search type');
        });
    });

    describe('query validation', () => {
        it('should require query parameter', async () => {
            const result = await handler.execute({
                type: 'text',
            });

            expect(result.success).toBe(false);
            expect(result.error).toMatch(/query is required/);
        });
    });

    describe('describe()', () => {
        it('should return readable description', () => {
            const desc = handler.describe({ type: 'text', query: 'Hello' });
            expect(desc).toContain('text');
            expect(desc).toContain('Hello');
        });

        it('should handle missing args gracefully', () => {
            const desc = handler.describe({});
            expect(desc).toContain('搜索');
        });
    });
});
