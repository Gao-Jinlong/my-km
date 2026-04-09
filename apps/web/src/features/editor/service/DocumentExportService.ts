/**
 * DocumentExportService - 文档导出服务
 *
 * 负责将.km 文件导出为 Markdown 或 txt 格式
 */

import 'reflect-metadata';
import { deserializeFromKmFile } from '@/features/editor/converter/km-serializer';
import { serializeToMarkdown } from '@/features/editor/converter/markdown-serializer';
import { ServiceBase } from '@/platform/base/service-base';
import { container } from '@/platform/bootstrap';
import { Service } from '@/platform/di';
import { FileSystemService } from '@/platform/file-system/service';

/**
 * 导出格式
 */
export type ExportFormat = 'markdown' | 'txt';

/**
 * 导出选项
 */
export interface ExportOptions {
    /** 导出格式 */
    format: ExportFormat;
    /** 输出路径 */
    outputPath: string;
    /** 是否覆盖已存在文件 */
    overwrite?: boolean;
}

/**
 * 文档导出服务
 */
@Service({ singleton: true })
export class DocumentExportService extends ServiceBase {
    private fileService: FileSystemService;

    constructor() {
        super();
        this.fileService = container.get(FileSystemService);
    }

    /**
     * 导出文档
     *
     * @param sourcePath .km 文件路径
     * @param options 导出选项
     * @returns 导出结果
     */
    async exportDocument(
        sourcePath: string,
        options: ExportOptions,
    ): Promise<{ success: boolean; error?: string; outputPath?: string }> {
        try {
            // 读取源文件
            const content = await this.fileService.readFile(sourcePath);
            const contentString =
                typeof content === 'string' ? content : new TextDecoder().decode(content);

            // 解析.km 文件
            const { blocks } = deserializeFromKmFile(contentString);

            // 根据格式转换内容
            let exportedContent: string;
            if (options.format === 'markdown') {
                exportedContent = serializeToMarkdown(blocks);
            } else {
                // txt 格式 - 纯文本，移除所有格式
                exportedContent = this.blocksToPlainText(blocks);
            }

            // 写入文件
            await this.fileService.writeFile(options.outputPath, exportedContent);

            return {
                success: true,
                outputPath: options.outputPath,
            };
        } catch (error) {
            const errorMessage =
                error instanceof Error ? error.message : 'Failed to export document';
            return {
                success: false,
                error: errorMessage,
            };
        }
    }

    /**
     * 将 Block[] 转换为纯文本
     */
    private blocksToPlainText(blocks: any[]): string {
        const lines: string[] = [];

        for (const block of blocks) {
            switch (block.type) {
                case 'heading': {
                    const text = this.inlineToPlainText(block.content.inline);
                    lines.push(text);
                    break;
                }

                case 'paragraph': {
                    const text = this.inlineToPlainText(block.content.inline);
                    lines.push(text);
                    break;
                }

                case 'quote': {
                    const text = this.inlineToPlainText(block.content.inline);
                    lines.push(text);
                    break;
                }

                case 'list': {
                    for (const item of block.content.items) {
                        lines.push(this.inlineToPlainText(item.inline));
                    }
                    break;
                }

                case 'code': {
                    lines.push(block.content.code);
                    break;
                }

                case 'image': {
                    lines.push(`[图片：${block.content.alt}]`);
                    if (block.content.caption) {
                        lines.push(block.content.caption);
                    }
                    break;
                }

                case 'formula': {
                    lines.push(`[公式：${block.content.latex}]`);
                    break;
                }

                case 'table': {
                    // 表格转换为简单的文本格式
                    for (let r = 0; r < block.content.rows; r++) {
                        const rowCells: string[] = [];
                        for (let c = 0; c < block.content.cols; c++) {
                            const cell = block.content.cells.find(
                                (cell: any) => cell.row === r && cell.col === c,
                            );
                            rowCells.push(cell?.content || '');
                        }
                        lines.push(rowCells.join('\t'));
                    }
                    break;
                }
            }
        }

        return lines.join('\n');
    }

    /**
     * 将 Inline[] 转换为纯文本
     */
    private inlineToPlainText(inline: any[]): string {
        return inline.map(item => item.text).join('');
    }

    /**
     * 批量导出文档
     *
     * @param files 源文件路径数组
     * @param outputDir 输出目录
     * @param format 导出格式
     */
    async exportMultipleDocuments(
        files: string[],
        outputDir: string,
        format: ExportFormat = 'markdown',
    ): Promise<{
        success: number;
        failed: number;
        errors: Array<{ path: string; error: string }>;
    }> {
        let successCount = 0;
        let failedCount = 0;
        const errors: Array<{ path: string; error: string }> = [];

        for (const sourcePath of files) {
            // 生成输出路径
            const fileName = sourcePath.split('/').pop() || 'document';
            const baseName = fileName.replace(/\.km$/, '');
            const extension = format === 'markdown' ? '.md' : '.txt';
            const outputPath = `${outputDir}/${baseName}${extension}`;

            const result = await this.exportDocument(sourcePath, {
                format,
                outputPath,
                overwrite: true,
            });

            if (result.success) {
                successCount++;
            } else {
                failedCount++;
                errors.push({ path: sourcePath, error: result.error || 'Unknown error' });
            }
        }

        return {
            success: successCount,
            failed: failedCount,
            errors,
        };
    }
}
