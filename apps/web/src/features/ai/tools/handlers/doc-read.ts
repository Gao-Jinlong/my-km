import { deserializeFromKmFile } from '@/features/editor/converter/km-serializer';
import type { DocumentStore } from '@/platform/document-store/service';
import type { EditorContainer } from '@/platform/editor/container/editor-container';
import type { FileSystemService } from '@/platform/file-system/service';
import { kmFileToPlainText } from '../km-text';
import type { FrontendToolHandler, ToolResult } from '../types';

type ResolvedTarget = {
    documentId: string;
    path: string;
    openEditor: boolean;
};

export class DocReadHandler implements FrontendToolHandler {
    readonly name = 'doc_read';
    readonly type = 'read';

    constructor(
        private readonly documentStore: DocumentStore,
        private readonly editorContainer: EditorContainer,
        private readonly fileSystemService: FileSystemService,
    ) {}

    describe(args: Record<string, unknown>): string {
        const target = args.documentId
            ? `文档 ${String(args.documentId)}`
            : `文件 ${String(args.path ?? '')}`;
        const format = String(args.format ?? 'text');
        return `读取 ${target}（格式: ${format}）`;
    }

    async execute(args: Record<string, unknown>): Promise<ToolResult> {
        const format = (args.format as string) || 'text';
        const rangeType = (args.rangeType as string) || 'full';

        const target = this.resolveTarget(args);
        if ('success' in target) return target;

        try {
            const { rawString, meta, blocks } = await this.loadDocument(target);

            switch (format) {
                case 'raw':
                    return { success: true, content: rawString, format: 'raw' };
                case 'blocks':
                    return this.formatBlocks(blocks, meta, rangeType, args);
                case 'text':
                default:
                    return this.formatText(rawString, meta, rangeType, args, target);
            }
        } catch (err) {
            return {
                success: false,
                error: `Failed to read document: ${(err as Error).message}`,
            };
        }
    }

    private resolveTarget(
        args: Record<string, unknown>,
    ): ResolvedTarget | ToolResult {
        const documentId = args.documentId as string | undefined;
        const path = args.path as string | undefined;

        if (documentId) {
            const meta = this.documentStore.get(documentId);
            if (!meta) return { success: false, error: `Document not found: ${documentId}` };
            const editor = this.editorContainer.getService(documentId);
            return { documentId, path: meta.path, openEditor: !!editor };
        }

        if (path) {
            const meta = this.documentStore.getByPath(path);
            if (meta) {
                const editor = this.editorContainer.getService(meta.id);
                return { documentId: meta.id, path: meta.path, openEditor: !!editor };
            }
            return { documentId: '', path, openEditor: false };
        }

        return { success: false, error: 'Either documentId or path is required' };
    }

    private async loadDocument(target: ResolvedTarget) {
        const meta = target.documentId ? this.documentStore.get(target.documentId) : undefined;
        const raw = await this.fileSystemService.readFile(target.path);
        const rawString = typeof raw === 'string' ? raw : new TextDecoder().decode(raw);
        const parsed = deserializeFromKmFile(rawString);

        return {
            rawString,
            meta: meta ?? {
                title: parsed.metadata?.title ?? '',
                id: '',
                path: target.path,
                type: 'km' as const,
            },
            blocks: parsed.blocks,
        };
    }

    private formatText(
        rawString: string,
        meta: { title: string; id: string; path: string },
        rangeType: string,
        args: Record<string, unknown>,
        target: ResolvedTarget,
    ): ToolResult {
        const editor = target.documentId
            ? this.editorContainer.getService(target.documentId)
            : null;
        let fullText: string;

        if (editor) {
            fullText = editor.getFullContent();
        } else {
            fullText = kmFileToPlainText(rawString);
        }

        const lines = fullText.split('\n');
        const totalLines = lines.length;

        if (rangeType === 'text-range') {
            const startLine = typeof args.startLine === 'number' ? args.startLine : 1;
            const endLine = typeof args.endLine === 'number' ? args.endLine : totalLines;
            const sliced = lines.slice(startLine - 1, endLine);
            return {
                success: true,
                content: sliced.join('\n'),
                totalLines,
                startLine,
                endLine: Math.min(endLine, totalLines),
                documentId: target.documentId,
                title: meta.title,
                format: 'text',
            };
        }

        return {
            success: true,
            content: fullText,
            totalLines,
            startLine: 1,
            endLine: totalLines,
            documentId: target.documentId,
            title: meta.title,
            format: 'text',
        };
    }

    private formatBlocks(
        blocks: any[],
        meta: { title: string; id: string; path: string },
        rangeType: string,
        args: Record<string, unknown>,
    ): ToolResult {
        let resultBlocks = blocks;

        if (rangeType === 'blocks') {
            const blockIds = args.blockIds as string[] | undefined;
            if (blockIds) {
                resultBlocks = blocks.filter((b: any) => blockIds.includes(b.id));
            } else {
                const blockStart = typeof args.blockStart === 'number' ? args.blockStart : 0;
                const blockEnd = typeof args.blockEnd === 'number' ? args.blockEnd : blocks.length;
                resultBlocks = blocks.slice(blockStart, blockEnd);
            }
        }

        return {
            success: true,
            blocks: resultBlocks,
            totalBlocks: blocks.length,
            documentId: meta.id,
            title: meta.title,
            format: 'blocks',
        };
    }
}
