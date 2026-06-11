/**
 * 从 .km 文件原始 JSON 字符串提取纯文本
 *
 * .km 文件结构通过 deserializeFromKmFile 反序列化为 Block[]，
 * 然后按行连接各个 block 的文本内容。
 *
 * 此工具与 DocumentExportService.blocksToPlainText 行为一致，
 * 但提取为独立函数以便 LLM 工具 handler 直接调用，避免循环依赖。
 */

import { deserializeFromKmFile } from '@/features/editor/converter/km-serializer';

// biome-ignore lint/suspicious/noExplicitAny: Block 的 content 字段为联合类型，转换函数中按 type 分发
type AnyBlock = { type: string; content: any };

function inlineToPlainText(inline: Array<{ text: string }>): string {
    return inline.map(item => item.text).join('');
}

function blockToLines(block: AnyBlock): string[] {
    switch (block.type) {
        case 'heading':
        case 'paragraph':
        case 'quote':
            return [inlineToPlainText(block.content.inline)];
        case 'list':
            return (block.content.items as Array<{ inline: Array<{ text: string }> }>).map(item =>
                inlineToPlainText(item.inline),
            );
        case 'code':
            return [block.content.code as string];
        case 'image':
            return [`[图片：${block.content.alt}]`];
        case 'formula':
            return [`[公式：${block.content.latex}]`];
        case 'table': {
            const lines: string[] = [];
            const { rows, cols, cells } = block.content as {
                rows: number;
                cols: number;
                cells: Array<{ row: number; col: number; content: string }>;
            };
            for (let r = 0; r < rows; r++) {
                const rowCells: string[] = [];
                for (let c = 0; c < cols; c++) {
                    const cell = cells.find(x => x.row === r && x.col === c);
                    rowCells.push(cell?.content ?? '');
                }
                lines.push(rowCells.join('\t'));
            }
            return lines;
        }
        default:
            return [];
    }
}

/**
 * 把 .km 文件原始 JSON 字符串转换为多行纯文本
 *
 * @param raw .km 文件原始内容（JSON 字符串）
 * @returns 多行纯文本（行间用 \n 连接）
 * @throws Error 当 JSON 解析失败时
 */
export function kmFileToPlainText(raw: string): string {
    if (!raw || raw.trim() === '') return '';
    const { blocks } = deserializeFromKmFile(raw);
    const lines: string[] = [];
    for (const block of blocks as AnyBlock[]) {
        lines.push(...blockToLines(block));
    }
    return lines.join('\n');
}
