import {
    deserializeFromKmFile,
    serializeToKmFile,
} from '@/features/editor/converter/km-serializer';
import type { DocumentStore } from '@/platform/document-store/service';
import type { EditorContainer } from '@/platform/editor/container/editor-container';
import type { FileSystemService } from '@/platform/file-system/service';
import type { FrontendToolHandler, ToolResult } from '../types';

export class InsertTextHandler implements FrontendToolHandler {
    readonly name = 'insert_text';
    readonly type = 'write';

    constructor(
        private readonly documentStore: DocumentStore,
        private readonly editorContainer: EditorContainer,
        private readonly fileSystemService: FileSystemService,
    ) {}

    describe(args: Record<string, unknown>): string {
        const docId = String(args.documentId ?? '');
        const position = String(args.position ?? 'end');
        const preview = String(args.text ?? '').slice(0, 40);
        return `在文档 ${docId} 的${position === 'cursor' ? '光标位置' : '末尾'}插入文本：${preview}${preview.length >= 40 ? '...' : ''}`;
    }

    async execute(args: Record<string, unknown>): Promise<ToolResult> {
        const text = typeof args.text === 'string' ? args.text : undefined;
        const documentId = typeof args.documentId === 'string' ? args.documentId : undefined;
        const position = (args.position === 'cursor' ? 'cursor' : 'end') as 'cursor' | 'end';

        if (text === undefined) return { success: false, error: 'text is required' };
        if (!documentId) return { success: false, error: 'documentId is required' };

        const meta = this.documentStore.get(documentId);
        if (!meta) return { success: false, error: `Document not found: ${documentId}` };

        const editor = this.editorContainer.getService(documentId);

        try {
            if (editor) {
                if (position === 'cursor') {
                    editor.insertTextAtCursor(text);
                } else {
                    const fullText = editor.getFullContent();
                    const result = editor.spliceText(fullText.length, 0, text);
                    if (!result.success) {
                        return { success: false, error: result.error };
                    }
                }
                return { success: true, documentId };
            }

            // Unopened doc: read .km → append paragraph → write back
            const raw = await this.fileSystemService.readFile(meta.path);
            const rawString = typeof raw === 'string' ? raw : new TextDecoder().decode(raw);
            const { blocks, metadata } = deserializeFromKmFile(rawString);
            blocks.push({
                type: 'paragraph',
                // biome-ignore lint/suspicious/noExplicitAny: Block.content is a discriminated union
                content: { inline: [{ text }] } as any,
            });
            const newContent = serializeToKmFile(blocks, {
                title: metadata.title,
                createdAt: metadata.createdAt,
                updatedAt: new Date().toISOString(),
                custom: metadata.custom,
            });
            await this.fileSystemService.writeFile(meta.path, newContent);
            return { success: true, documentId };
        } catch (err) {
            return {
                success: false,
                error: `Failed to insert text: ${(err as Error).message}`,
            };
        }
    }
}
