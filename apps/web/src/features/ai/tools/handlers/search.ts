import type { DocumentStore } from '@/platform/document-store/service';
import type { EditorContainer } from '@/platform/editor/container/editor-container';
import type { FileSystemService } from '@/platform/file-system/service';
import { kmFileToPlainText } from '../km-text';
import type { FrontendToolHandler, ToolResult } from '../types';

export class SearchHandler implements FrontendToolHandler {
    readonly name = 'search';
    readonly type = 'read';

    constructor(
        private readonly documentStore: DocumentStore,
        private readonly editorContainer: EditorContainer,
        private readonly fileSystemService: FileSystemService,
        private readonly getProjectRoot: () => string | null,
    ) {}

    describe(args: Record<string, unknown>): string {
        const type = String(args.type ?? '');
        const query = String(args.query ?? '');
        return `搜索（${type}模式）："${query}"`;
    }

    async execute(args: Record<string, unknown>): Promise<ToolResult> {
        const type = args.type as string;
        const query = args.query as string;

        if (!query) return { success: false, error: 'query is required' };

        switch (type) {
            case 'text':
                return this.handleTextSearch(query, args);
            case 'grep':
            case 'metadata':
            case 'semantic':
                return {
                    success: false,
                    error: `"${type}" search mode is not yet implemented. Currently only "text" mode is available.`,
                };
            default:
                return { success: false, error: `Unknown search type: ${type}` };
        }
    }

    private async handleTextSearch(query: string, args: Record<string, unknown>): Promise<ToolResult> {
        const documentId = args.documentId as string | undefined;
        const path = args.path as string | undefined;

        let content: string;

        if (documentId) {
            const editor = this.editorContainer.getService(documentId);
            if (editor) {
                content = editor.getFullContent();
            } else {
                const meta = this.documentStore.get(documentId);
                if (!meta) return { success: false, error: `Document not found: ${documentId}` };
                content = await this.readFileContent(meta.path);
            }
        } else if (path) {
            content = await this.readFileContent(path);
        } else {
            return { success: false, error: 'documentId or path is required for text search' };
        }

        const caseSensitive = args.caseSensitive === true;
        const maxResults = typeof args.maxResults === 'number' ? args.maxResults : 20;
        const includeContent = args.includeContent !== false;

        const matches = this.findMatches(content, query, caseSensitive, maxResults, includeContent);

        return {
            success: true,
            matches,
            totalMatches: matches.length,
            truncated: matches.length >= maxResults,
        };
    }

    private findMatches(
        content: string,
        query: string,
        caseSensitive: boolean,
        maxResults: number,
        includeContent: boolean,
    ): Array<{ line: number; column: number; snippet?: string }> {
        const lines = content.split('\n');
        const matches: Array<{ line: number; column: number; snippet?: string }> = [];
        const searchQuery = caseSensitive ? query : query.toLowerCase();

        for (let i = 0; i < lines.length && matches.length < maxResults; i++) {
            const line = caseSensitive ? lines[i] : lines[i].toLowerCase();
            let searchFrom = 0;

            while (searchFrom < line.length) {
                const idx = line.indexOf(searchQuery, searchFrom);
                if (idx === -1) break;

                matches.push({
                    line: i + 1,
                    column: idx + 1,
                    snippet: includeContent ? lines[i] : undefined,
                });

                if (matches.length >= maxResults) break;
                searchFrom = idx + 1;
            }
        }

        return matches;
    }

    private async readFileContent(path: string): Promise<string> {
        const raw = await this.fileSystemService.readFile(path);
        const rawString = typeof raw === 'string' ? raw : new TextDecoder().decode(raw);
        try {
            return kmFileToPlainText(rawString);
        } catch {
            // Not a .km file or invalid JSON, return raw text
            return rawString;
        }
    }
}
