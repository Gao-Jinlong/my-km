import {
    deserializeFromKmFile,
    serializeToKmFile,
} from '@/features/editor/converter/km-serializer';
import type { DocumentStore } from '@/platform/document-store/service';
import type { EditorContainer } from '@/platform/editor/container/editor-container';
import type { FileSystemService } from '@/platform/file-system/service';
import { kmFileToPlainText } from '../km-text';
import type { FrontendToolHandler, ToolResult } from '../types';

export class DocEditHandler implements FrontendToolHandler {
    readonly name = 'doc_edit';
    readonly type = 'write';

    constructor(
        private readonly documentStore: DocumentStore,
        private readonly editorContainer: EditorContainer,
        private readonly fileSystemService: FileSystemService,
    ) {}

    describe(args: Record<string, unknown>): string {
        const opType = String(args.operationType ?? '');
        const target = args.documentId
            ? `文档 ${String(args.documentId)}`
            : `文件 ${String(args.path ?? '')}`;

        switch (opType) {
            case 'splice-text': {
                const pos = Number(args.position ?? 0);
                const del = Number(args.deleteCount ?? 0);
                const preview = String(args.text ?? '').slice(0, 30);
                return `在 ${target} 位置 ${pos} 删除 ${del} 字符并插入 "${preview}"`;
            }
            case 'insert-text': {
                const preview = String(args.text ?? '').slice(0, 40);
                return `在 ${target} 插入文本：${preview}`;
            }
            default:
                return `在 ${target} 执行 ${opType} 操作`;
        }
    }

    async execute(args: Record<string, unknown>): Promise<ToolResult> {
        const opType = args.operationType as string;
        if (!opType) return { success: false, error: 'operationType is required' };

        const target = this.resolveTarget(args);
        if ('success' in target) return target;

        switch (opType) {
            case 'splice-text':
                return this.handleSpliceText(target, args);
            case 'insert-text':
                return this.handleInsertText(target, args);
            default:
                return { success: false, error: `Unsupported operation: ${opType}` };
        }
    }

    private resolveTarget(
        args: Record<string, unknown>,
    ): { documentId: string; path: string; hasEditor: boolean } | ToolResult {
        const documentId = args.documentId as string | undefined;
        const path = args.path as string | undefined;

        if (documentId) {
            const meta = this.documentStore.get(documentId);
            if (!meta) return { success: false, error: `Document not found: ${documentId}` };
            const editor = this.editorContainer.getService(documentId);
            return { documentId, path: meta.path, hasEditor: !!editor };
        }

        if (path) {
            const meta = this.documentStore.getByPath(path);
            if (meta) {
                const editor = this.editorContainer.getService(meta.id);
                return { documentId: meta.id, path: meta.path, hasEditor: !!editor };
            }
            return { documentId: '', path, hasEditor: false };
        }

        return { success: false, error: 'Either documentId or path is required' };
    }

    private async handleSpliceText(
        target: { documentId: string; path: string; hasEditor: boolean },
        args: Record<string, unknown>,
    ): Promise<ToolResult> {
        const position = typeof args.position === 'number' ? args.position : undefined;
        const deleteCount = typeof args.deleteCount === 'number' ? args.deleteCount : undefined;
        const text = typeof args.text === 'string' ? args.text : undefined;

        if (position === undefined)
            return { success: false, error: 'position is required for splice-text' };
        if (deleteCount === undefined)
            return { success: false, error: 'deleteCount is required for splice-text' };

        if (target.hasEditor) {
            const editor = this.editorContainer.getService(target.documentId)!;
            const result = editor.spliceText(position, deleteCount, text);
            if (!result.success) return { success: false, error: result.error };
            return {
                success: true,
                documentId: target.documentId,
                charsDeleted: result.charsDeleted,
                charsInserted: result.charsInserted,
            };
        }

        return this.spliceOnFile(target, position, deleteCount, text);
    }

    private async handleInsertText(
        target: { documentId: string; path: string; hasEditor: boolean },
        args: Record<string, unknown>,
    ): Promise<ToolResult> {
        const text = typeof args.text === 'string' ? args.text : undefined;
        if (text === undefined) return { success: false, error: 'text is required for insert-text' };

        if (target.hasEditor) {
            const editor = this.editorContainer.getService(target.documentId)!;
            const fullText = editor.getFullContent();
            const result = editor.spliceText(fullText.length, 0, text);
            if (!result.success) return { success: false, error: result.error };
            return { success: true, documentId: target.documentId };
        }

        return this.spliceOnFile(target, -1, 0, text);
    }

    private async spliceOnFile(
        target: { documentId: string; path: string },
        start: number,
        deleteCount: number,
        insert?: string,
    ): Promise<ToolResult> {
        const raw = await this.fileSystemService.readFile(target.path);
        const rawString = typeof raw === 'string' ? raw : new TextDecoder().decode(raw);
        const { metadata, blocks } = deserializeFromKmFile(rawString);
        const fullText = kmFileToPlainText(rawString);

        const actualStart = start === -1 ? fullText.length : start;

        if (actualStart < 0 || actualStart > fullText.length) {
            return {
                success: false,
                error: `Position ${actualStart} out of bounds (length: ${fullText.length})`,
            };
        }

        const actualDeleteCount = Math.max(0, Math.min(deleteCount, fullText.length - actualStart));
        const insertText = insert ?? '';
        const newText =
            fullText.slice(0, actualStart) + insertText + fullText.slice(actualStart + actualDeleteCount);

        const lines = newText.length === 0 ? [''] : newText.split('\n');
        const newBlocks = lines.map(line => ({
            type: 'paragraph' as const,
            // biome-ignore lint/suspicious/noExplicitAny: Block.content union
            content: { inline: line ? [{ text: line }] : [] } as any,
        }));
        const newContent = serializeToKmFile(newBlocks as never, {
            title: metadata.title,
            createdAt: metadata.createdAt,
            updatedAt: new Date().toISOString(),
            custom: metadata.custom,
        });
        await this.fileSystemService.writeFile(target.path, newContent);

        return {
            success: true,
            documentId: target.documentId,
            charsDeleted: actualDeleteCount,
            charsInserted: insertText.length,
        };
    }
}
