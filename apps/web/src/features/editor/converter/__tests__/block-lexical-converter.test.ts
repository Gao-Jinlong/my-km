/**
 * Block ↔ Lexical Round-Trip 测试
 *
 * 验证 blocksToLexical + lexicalToBlocks 双向转换的数据一致性。
 * 使用 createHeadlessEditor 在无 DOM 环境下运行。
 */

import { CodeNode } from '@lexical/code';
import { createHeadlessEditor } from '@lexical/headless';
import { LinkNode } from '@lexical/link';
import { ListItemNode, ListNode } from '@lexical/list';
import { HeadingNode, QuoteNode } from '@lexical/rich-text';
import { TableCellNode, TableNode, TableRowNode } from '@lexical/table';
import type { LexicalEditor } from 'lexical';
import { describe, expect, it } from 'vitest';
import type {
    Block,
    CodeBlock,
    HeadingBlock,
    ListBlock,
    ParagraphBlock,
    QuoteBlock,
    TableBlock,
} from '../../types';
import { blocksToLexical, lexicalToBlocks } from '../block-lexical-converter';

/**
 * 创建用于测试的 headless 编辑器
 */
function createTestEditor(): LexicalEditor {
    return createHeadlessEditor({
        nodes: [
            ListNode,
            ListItemNode,
            HeadingNode,
            QuoteNode,
            CodeNode,
            LinkNode,
            TableNode,
            TableRowNode,
            TableCellNode,
        ],
        onError: error => {
            throw error;
        },
    });
}

/**
 * Round-trip 测试：blocksToLexical → lexicalToBlocks
 *
 * blocksToLexical 内部通过 editor.update() 写入节点，
 * update 完成后需要等一个微任务让 Lexical 提交状态，
 * 然后 lexicalToBlocks 才能读到正确的节点树。
 */
async function roundTrip(blocks: Block[]): Promise<Block[]> {
    const editor = createTestEditor();
    blocksToLexical(blocks, editor);
    // 等待 Lexical 的 update listener 执行完毕并提交新状态
    await new Promise(resolve => setTimeout(resolve, 0));
    return lexicalToBlocks(editor);
}

describe('block-lexical-converter round-trip', () => {
    describe('paragraph', () => {
        it('应该 round-trip 简单段落', async () => {
            const blocks: Block[] = [
                {
                    id: 'p1',
                    type: 'paragraph',
                    content: { inline: [{ text: 'Hello World' }] },
                } as ParagraphBlock,
            ];

            const result = await roundTrip(blocks);
            expect(result).toHaveLength(1);
            expect(result[0].type).toBe('paragraph');
            expect(result[0].content.inline[0].text).toBe('Hello World');
        });

        it('应该 round-trip 带格式的段落', async () => {
            const blocks: Block[] = [
                {
                    id: 'p1',
                    type: 'paragraph',
                    content: {
                        inline: [
                            { text: 'Normal ' },
                            { text: 'Bold', bold: true },
                            { text: ' Italic', italic: true },
                            { text: ' Code', code: true },
                        ],
                    },
                } as ParagraphBlock,
            ];

            const result = await roundTrip(blocks);
            expect(result).toHaveLength(1);
            expect(result[0].content.inline).toHaveLength(4);
            expect(result[0].content.inline[0].text).toBe('Normal ');
            expect(result[0].content.inline[1].bold).toBe(true);
            expect(result[0].content.inline[2].italic).toBe(true);
            expect(result[0].content.inline[3].code).toBe(true);
        });

        it('应该 round-trip 空段落', async () => {
            const blocks: Block[] = [
                {
                    id: 'p1',
                    type: 'paragraph',
                    content: { inline: [] },
                } as ParagraphBlock,
            ];

            const result = await roundTrip(blocks);
            expect(result).toHaveLength(1);
            expect(result[0].type).toBe('paragraph');
        });
    });

    describe('heading', () => {
        it('应该 round-trip H1-H6', async () => {
            const levels = [1, 2, 3, 4, 5, 6] as const;

            for (const level of levels) {
                const blocks: Block[] = [
                    {
                        id: `h-${level}`,
                        type: 'heading',
                        content: { level, inline: [{ text: `Heading ${level}` }] },
                    } as HeadingBlock,
                ];

                const result = await roundTrip(blocks);
                expect(result).toHaveLength(1);
                expect(result[0].type).toBe('heading');
                expect((result[0].content as HeadingBlock['content']).level).toBe(level);
            }
        });
    });

    describe('list', () => {
        it('应该 round-trip 有序列表', async () => {
            const blocks: Block[] = [
                {
                    id: 'list-1',
                    type: 'list',
                    content: {
                        listType: 'number',
                        items: [
                            { id: 'i1', inline: [{ text: 'First' }] },
                            { id: 'i2', inline: [{ text: 'Second' }] },
                        ],
                    },
                } as ListBlock,
            ];

            const result = await roundTrip(blocks);
            expect(result).toHaveLength(1);
            expect(result[0].type).toBe('list');
            expect((result[0].content as ListBlock['content']).listType).toBe('number');
            expect((result[0].content as ListBlock['content']).items).toHaveLength(2);
        });

        it('应该 round-trip 无序列表', async () => {
            const blocks: Block[] = [
                {
                    id: 'list-1',
                    type: 'list',
                    content: {
                        listType: 'bullet',
                        items: [
                            { id: 'i1', inline: [{ text: 'Item A' }] },
                            { id: 'i2', inline: [{ text: 'Item B' }] },
                        ],
                    },
                } as ListBlock,
            ];

            const result = await roundTrip(blocks);
            expect(result).toHaveLength(1);
            expect((result[0].content as ListBlock['content']).listType).toBe('bullet');
        });
    });

    describe('quote', () => {
        it('应该 round-trip 引用块', async () => {
            const blocks: Block[] = [
                {
                    id: 'q1',
                    type: 'quote',
                    content: { inline: [{ text: 'This is a quote' }] },
                } as QuoteBlock,
            ];

            const result = await roundTrip(blocks);
            expect(result).toHaveLength(1);
            expect(result[0].type).toBe('quote');
            expect(result[0].content.inline[0].text).toBe('This is a quote');
        });
    });

    describe('code', () => {
        it('应该 round-trip 代码块', async () => {
            const blocks: Block[] = [
                {
                    id: 'code-1',
                    type: 'code',
                    content: {
                        language: 'typescript',
                        code: 'const x = 10;\nconsole.log(x);',
                    },
                } as CodeBlock,
            ];

            const result = await roundTrip(blocks);
            expect(result).toHaveLength(1);
            expect(result[0].type).toBe('code');
            expect((result[0].content as CodeBlock['content']).language).toBe('typescript');
            expect((result[0].content as CodeBlock['content']).code).toBe(
                'const x = 10;\nconsole.log(x);',
            );
        });
    });

    describe('table', () => {
        it('应该 round-trip 表格', async () => {
            const blocks: Block[] = [
                {
                    id: 'table-1',
                    type: 'table',
                    content: {
                        rows: 2,
                        cols: 2,
                        cells: [
                            { row: 0, col: 0, content: 'A' },
                            { row: 0, col: 1, content: 'B' },
                            { row: 1, col: 0, content: 'C' },
                            { row: 1, col: 1, content: 'D' },
                        ],
                    },
                } as TableBlock,
            ];

            const result = await roundTrip(blocks);
            expect(result).toHaveLength(1);
            expect(result[0].type).toBe('table');
            const tableContent = result[0].content as TableBlock['content'];
            expect(tableContent.rows).toBe(2);
            expect(tableContent.cols).toBe(2);
            expect(tableContent.cells).toHaveLength(4);
        });
    });

    describe('mixed content', () => {
        it('应该 round-trip 混合内容文档', async () => {
            const blocks: Block[] = [
                {
                    id: 'h1',
                    type: 'heading',
                    content: { level: 1, inline: [{ text: 'Title' }] },
                } as HeadingBlock,
                {
                    id: 'p1',
                    type: 'paragraph',
                    content: { inline: [{ text: 'Intro paragraph' }] },
                } as ParagraphBlock,
                {
                    id: 'list1',
                    type: 'list',
                    content: {
                        listType: 'bullet',
                        items: [
                            { id: 'i1', inline: [{ text: 'Item 1' }] },
                            { id: 'i2', inline: [{ text: 'Item 2' }] },
                        ],
                    },
                } as ListBlock,
                {
                    id: 'q1',
                    type: 'quote',
                    content: { inline: [{ text: 'A quote' }] },
                } as QuoteBlock,
                {
                    id: 'p2',
                    type: 'paragraph',
                    content: { inline: [{ text: 'End' }] },
                } as ParagraphBlock,
            ];

            const result = await roundTrip(blocks);
            expect(result).toHaveLength(5);
            expect(result[0].type).toBe('heading');
            expect(result[1].type).toBe('paragraph');
            expect(result[2].type).toBe('list');
            expect(result[3].type).toBe('quote');
            expect(result[4].type).toBe('paragraph');
        });
    });

    describe('link round-trip', () => {
        it('应该 round-trip 包含链接的段落', async () => {
            const blocks: Block[] = [
                {
                    id: 'p1',
                    type: 'paragraph',
                    content: {
                        inline: [
                            { text: 'Visit ' },
                            { text: 'example.com', link: { url: 'https://example.com' } },
                        ],
                    },
                } as ParagraphBlock,
            ];

            const result = await roundTrip(blocks);
            expect(result).toHaveLength(1);
            expect(result[0].content.inline[0].text).toBe('Visit ');
            expect(result[0].content.inline[1].text).toBe('example.com');
            expect(result[0].content.inline[1].link?.url).toBe('https://example.com');
        });
    });
});
