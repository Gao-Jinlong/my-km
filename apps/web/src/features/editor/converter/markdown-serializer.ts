/**
 * Block[] to Markdown 转换器
 *
 * 将 Block[] 序列化为 Markdown 字符串
 */

import type { Block, Inline } from '../types/block';

/**
 * 将 Inline[] 序列化为 Markdown 文本
 */
function serializeInline(inline: Inline[]): string {
    return inline
        .map(item => {
            let text = item.text;

            // 应用行内格式（按 Markdown 语法顺序）
            if (item.bold) {
                text = `**${text}**`;
            }
            if (item.italic) {
                text = `*${text}*`;
            }
            if (item.underline) {
                text = `<u>${text}</u>`;
            }
            if (item.strikethrough) {
                text = `~~${text}~~`;
            }
            if (item.code) {
                text = `\`${text}\``;
            }
            if (item.link) {
                const title = item.link.title ? ` "${item.link.title}"` : '';
                text = `[${text}](${item.link.url}${title})`;
            }

            return text;
        })
        .join('');
}

/**
 * 将 Block[] 序列化为 Markdown 字符串
 */
export function serializeToMarkdown(blocks: Block[]): string {
    const lines: string[] = [];

    for (const block of blocks) {
        switch (block.type) {
            case 'heading': {
                const { level, inline } = block.content;
                const prefix = '#'.repeat(level);
                const text = serializeInline(inline);
                lines.push(`${prefix} ${text}`);
                break;
            }

            case 'paragraph': {
                // 检查是否是分隔线
                if (block.metadata?.horizontalRule) {
                    lines.push('---');
                } else {
                    const text = serializeInline(block.content.inline);
                    lines.push(text);
                }
                break;
            }

            case 'quote': {
                const text = serializeInline(block.content.inline);
                // 将多行文本每行都添加 > 前缀
                text.split('\n').forEach(line => {
                    lines.push(`> ${line}`);
                });
                break;
            }

            case 'list': {
                const { items, listType } = block.content;
                items.forEach((item, index) => {
                    const text = serializeInline(item.inline);
                    if (listType === 'bullet') {
                        lines.push(`- ${text}`);
                    } else if (listType === 'number') {
                        lines.push(`${index + 1}. ${text}`);
                    } else if (listType === 'check') {
                        const checkbox = item.checked ? '[x]' : '[ ]';
                        lines.push(`- ${checkbox} ${text}`);
                    }
                });
                break;
            }

            case 'code': {
                const { language, code } = block.content;
                lines.push(`\`\`\`${language}`);
                lines.push(code);
                lines.push('```');
                break;
            }

            case 'image': {
                const { src, alt, caption } = block.content;
                const markdown = `![${alt}](${src})`;
                if (caption) {
                    lines.push(markdown);
                    lines.push(`*${caption}*`);
                } else {
                    lines.push(markdown);
                }
                break;
            }

            case 'formula': {
                const { latex, displayMode } = block.content;
                if (displayMode) {
                    lines.push(`$$${latex}$$`);
                } else {
                    lines.push(`$${latex}$`);
                }
                break;
            }

            case 'table': {
                const { rows, cols, cells } = block.content;
                if (cells.length > 0) {
                    // 生成 Markdown 表格
                    const tableLines: string[] = [];
                    for (let r = 0; r < rows; r++) {
                        const rowCells: string[] = [];
                        for (let c = 0; c < cols; c++) {
                            const cell = cells.find(cell => cell.row === r && cell.col === c);
                            rowCells.push(cell?.content || '');
                        }
                        tableLines.push(`| ${rowCells.join(' | ')} |`);
                        // 添加表头分隔行
                        if (r === 0) {
                            tableLines.push(`| ${Array(cols).fill('---').join(' | ')} |`);
                        }
                    }
                    lines.push(...tableLines);
                }
                break;
            }
        }
    }

    return lines.join('\n');
}
