import type { DocumentStore } from '@/platform/document-store/service';
import type { EditorContainer } from '@/platform/editor/container/editor-container';
import type { FileSystemService } from '@/platform/file-system/service';
import { kmFileToPlainText } from '../km-text';
import type { FrontendToolHandler, ToolResult } from '../types';

export class GetDocumentContentHandler implements FrontendToolHandler {
    readonly name = 'get_document_content';
    readonly type = 'read';

    constructor(
        private readonly documentStore: DocumentStore,
        private readonly editorContainer: EditorContainer,
        private readonly fileSystemService: FileSystemService,
    ) {}

    describe(args: Record<string, unknown>): string {
        return `读取文档 ${String(args.documentId ?? '')}`;
    }

    async execute(args: Record<string, unknown>): Promise<ToolResult> {
        const documentId = String(args.documentId ?? '');
        if (!documentId) {
            return { success: false, error: 'documentId is required' };
        }

        const meta = this.documentStore.get(documentId);
        if (!meta) {
            return { success: false, error: `Document not found: ${documentId}` };
        }

        let fullText: string;
        try {
            const editor = this.editorContainer.getService(documentId);
            if (editor) {
                fullText = editor.getFullContent();
            } else {
                const raw = await this.fileSystemService.readFile(meta.path);
                const rawString = typeof raw === 'string' ? raw : new TextDecoder().decode(raw);
                fullText = kmFileToPlainText(rawString);
            }
        } catch (err) {
            return {
                success: false,
                error: `Failed to read document: ${(err as Error).message}`,
            };
        }

        const lines = fullText.split('\n');
        const totalLines = lines.length;

        const startLine = typeof args.startLine === 'number' ? args.startLine : undefined;
        const endLine = typeof args.endLine === 'number' ? args.endLine : undefined;

        if (startLine !== undefined && (startLine < 1 || startLine > totalLines)) {
            return {
                success: false,
                error: `Line range out of bounds: startLine=${startLine}, totalLines=${totalLines}`,
            };
        }

        const effectiveStart = startLine ?? 1;
        const effectiveEnd = endLine ?? totalLines;
        const sliced = lines.slice(effectiveStart - 1, effectiveEnd);

        return {
            success: true,
            content: sliced.join('\n'),
            totalLines,
            startLine: effectiveStart,
            endLine: Math.min(effectiveEnd, totalLines),
            documentId,
            title: meta.title,
        };
    }
}
