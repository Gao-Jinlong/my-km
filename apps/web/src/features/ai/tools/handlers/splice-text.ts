import {
    deserializeFromKmFile,
    serializeToKmFile,
} from '@/features/editor/converter/km-serializer';
import type { DocumentStore } from '@/platform/document-store/service';
import type { EditorContainer } from '@/platform/editor/container/editor-container';
import type { FileSystemService } from '@/platform/file-system/service';
import { kmFileToPlainText } from '../km-text';
import type { FrontendToolHandler, ToolResult } from '../types';

/**
 * splice_text — 对文档执行 splice 操作（类似 JavaScript String.splice）
 *
 * - 已打开文档：委托给 EditorService.spliceText
 * - 未打开文档：读 .km → 提取纯文本 → 执行 splice → 写回（单段落 block）
 */
export class SpliceTextHandler implements FrontendToolHandler {
    readonly name = 'splice_text';
    readonly type = 'write';

    constructor(
        private readonly documentStore: DocumentStore,
        private readonly editorContainer: EditorContainer,
        private readonly fileSystemService: FileSystemService,
    ) {}

    describe(args: Record<string, unknown>): string {
        const docId = String(args.documentId ?? '');
        const start = Number(args.start ?? 0);
        const deleteCount = Number(args.deleteCount ?? 0);
        const insert = typeof args.insert === 'string' ? args.insert : '';
        const insertPreview = insert.slice(0, 30);
        return `在文档 ${docId} 位置 ${start} 删除 ${deleteCount} 字符并插入 "${insertPreview}${insertPreview.length >= 30 ? '...' : ''}"`;
    }

    async execute(args: Record<string, unknown>): Promise<ToolResult> {
        const documentId = typeof args.documentId === 'string' ? args.documentId : undefined;
        const start = typeof args.start === 'number' ? args.start : undefined;
        const deleteCount = typeof args.deleteCount === 'number' ? args.deleteCount : undefined;
        const insert = typeof args.insert === 'string' ? args.insert : undefined;

        if (!documentId) return { success: false, error: 'documentId is required' };
        if (start === undefined) return { success: false, error: 'start is required' };
        if (deleteCount === undefined) return { success: false, error: 'deleteCount is required' };

        const meta = this.documentStore.get(documentId);
        if (!meta) return { success: false, error: `Document not found: ${documentId}` };

        const editor = this.editorContainer.getService(documentId);

        try {
            if (editor) {
                const result = editor.spliceText(start, deleteCount, insert);
                if (!result.success) {
                    return { success: false, error: result.error };
                }
                return {
                    success: true,
                    documentId,
                    charsDeleted: result.charsDeleted,
                    charsInserted: result.charsInserted,
                };
            }

            // 未打开文档：读 .km → splice → 写回
            const raw = await this.fileSystemService.readFile(meta.path);
            const rawString = typeof raw === 'string' ? raw : new TextDecoder().decode(raw);
            const { metadata } = deserializeFromKmFile(rawString);
            const fullText = kmFileToPlainText(rawString);

            if (start < 0 || start > fullText.length) {
                return {
                    success: false,
                    error: `Start position ${start} out of bounds (content length: ${fullText.length})`,
                };
            }

            const actualDeleteCount = Math.max(0, Math.min(deleteCount, fullText.length - start));
            const insertText = insert ?? '';
            const newText =
                fullText.slice(0, start) + insertText + fullText.slice(start + actualDeleteCount);

            // 把 newText 按 \n 拆分为段落 blocks 写回
            const lines = newText.length === 0 ? [''] : newText.split('\n');
            const newBlocks = lines.map(line => ({
                type: 'paragraph' as const,
                // biome-ignore lint/suspicious/noExplicitAny: Block.content union, paragraph requires inline
                content: { inline: line ? [{ text: line }] : [] } as any,
            }));
            const newContent = serializeToKmFile(newBlocks as never, {
                title: metadata.title,
                createdAt: metadata.createdAt,
                updatedAt: new Date().toISOString(),
                custom: metadata.custom,
            });
            await this.fileSystemService.writeFile(meta.path, newContent);

            return {
                success: true,
                documentId,
                charsDeleted: actualDeleteCount,
                charsInserted: insertText.length,
            };
        } catch (err) {
            return {
                success: false,
                error: `Failed to splice text: ${(err as Error).message}`,
            };
        }
    }
}
