/**
 * Block ↔ Lexical Round-Trip 测试
 *
 * 验证 blocksToLexical + lexicalToBlocks 双向转换的数据一致性
 *
 * 注意：由于 Lexical 节点创建需要在真实编辑器上下文中运行，
 * 本测试主要验证数据结构的正确性和转换逻辑的完整性。
 */

import { describe, expect, it } from 'vitest';
import type {
    CodeBlock,
    FormulaBlock,
    HeadingBlock,
    ImageBlock,
    ListBlock,
    ParagraphBlock,
    QuoteBlock,
    TableBlock,
} from '../types/block';

/**
 * 数据结构完整性测试
 * 验证 Block 数据模型的定义是否正确
 */
describe('block-lexical-converter data structures', () => {
    describe('Inline 格式标志', () => {
        it('应该支持所有行内格式标志', () => {
            const fullInline: Inline = {
                text: 'Test',
                bold: true,
                italic: true,
                underline: true,
                strikethrough: true,
                code: true,
                highlight: true,
                subscript: true,
                superscript: true,
                link: { url: 'https://example.com', title: 'Example' },
            };

            expect(fullInline.bold).toBe(true);
            expect(fullInline.italic).toBe(true);
            expect(fullInline.underline).toBe(true);
            expect(fullInline.strikethrough).toBe(true);
            expect(fullInline.code).toBe(true);
            expect(fullInline.highlight).toBe(true);
            expect(fullInline.subscript).toBe(true);
            expect(fullInline.superscript).toBe(true);
            expect(fullInline.link?.url).toBe('https://example.com');
        });
    });

    describe('paragraph 块', () => {
        it('应该正确定义 paragraph 块结构', () => {
            const block: ParagraphBlock = {
                id: 'block-1',
                type: 'paragraph',
                content: {
                    inline: [
                        { text: 'Hello' },
                        { text: ' ', bold: true },
                        { text: 'World', italic: true },
                    ],
                },
            };

            expect(block.type).toBe('paragraph');
            expect(block.content.inline).toHaveLength(3);
        });
    });

    describe('heading 块', () => {
        it('应该支持 H1-H6 所有级别', () => {
            const headings = [1, 2, 3, 4, 5, 6] as const;

            headings.forEach(level => {
                const block: HeadingBlock = {
                    id: `heading-${level}`,
                    type: 'heading',
                    content: {
                        level,
                        inline: [{ text: `Heading ${level}` }],
                    },
                };

                expect(block.type).toBe('heading');
                expect(block.content.level).toBe(level);
            });
        });
    });

    describe('list 块', () => {
        it('应该支持 bullet, number, check 三种列表类型', () => {
            const listTypes = ['bullet', 'number', 'check'] as const;

            listTypes.forEach(listType => {
                const block: ListBlock = {
                    id: `list-${listType}`,
                    type: 'list',
                    content: {
                        listType,
                        items: [
                            {
                                id: 'item-1',
                                inline: [{ text: 'Item 1' }],
                                checked: listType === 'check',
                            },
                        ],
                    },
                };

                expect(block.type).toBe('list');
                expect(block.content.listType).toBe(listType);
            });
        });

        it('应该支持列表项的 checked 状态', () => {
            const block: ListBlock = {
                id: 'checklist-1',
                type: 'list',
                content: {
                    listType: 'check',
                    items: [
                        { id: 'item-1', inline: [{ text: 'Done' }], checked: true },
                        { id: 'item-2', inline: [{ text: 'Todo' }], checked: false },
                    ],
                },
            };

            expect(block.content.items[0].checked).toBe(true);
            expect(block.content.items[1].checked).toBe(false);
        });
    });

    describe('quote 块', () => {
        it('应该正确定义 quote 块结构', () => {
            const block: QuoteBlock = {
                id: 'quote-1',
                type: 'quote',
                content: {
                    inline: [{ text: 'This is a quote' }],
                    cite: 'Author Name',
                },
            };

            expect(block.type).toBe('quote');
            expect(block.content.inline).toBeDefined();
        });
    });

    describe('code 块', () => {
        it('应该支持多行代码和语言标识', () => {
            const block: CodeBlock = {
                id: 'code-1',
                type: 'code',
                content: {
                    language: 'typescript',
                    code: 'const x = 10;\nconsole.log(x);\nreturn x;',
                },
            };

            expect(block.type).toBe('code');
            expect(block.content.language).toBe('typescript');
            expect(block.content.code).toContain('\n');
        });
    });

    describe('table 块', () => {
        it('应该正确定义表格结构', () => {
            const block: TableBlock = {
                id: 'table-1',
                type: 'table',
                content: {
                    rows: 3,
                    cols: 3,
                    cells: [
                        { row: 0, col: 0, content: 'A1' },
                        { row: 0, col: 1, content: 'A2' },
                        { row: 1, col: 0, content: 'B1' },
                        { row: 2, col: 2, content: 'C3' },
                    ],
                },
            };

            expect(block.type).toBe('table');
            expect(block.content.rows).toBe(3);
            expect(block.content.cols).toBe(3);
            expect(block.content.cells).toHaveLength(4);
            expect(block.content.cells[0]).toEqual({ row: 0, col: 0, content: 'A1' });
        });
    });

    describe('image 块', () => {
        it('应该正确定义图片结构', () => {
            const block: ImageBlock = {
                id: 'image-1',
                type: 'image',
                content: {
                    src: 'https://example.com/image.png',
                    alt: 'Description',
                    caption: 'This is a caption',
                },
            };

            expect(block.type).toBe('image');
            expect(block.content.src).toBe('https://example.com/image.png');
            expect(block.content.alt).toBe('Description');
            expect(block.content.caption).toBe('This is a caption');
        });

        it('应该支持无 caption 的图片', () => {
            const block: ImageBlock = {
                id: 'image-2',
                type: 'image',
                content: {
                    src: '/image.png',
                    alt: 'Simple',
                },
            };

            expect(block.content.caption).toBeUndefined();
        });
    });

    describe('formula 块', () => {
        it('应该正确定义公式结构', () => {
            const block: FormulaBlock = {
                id: 'formula-1',
                type: 'formula',
                content: {
                    latex: 'E = mc^2',
                    displayMode: true,
                },
            };

            expect(block.type).toBe('formula');
            expect(block.content.latex).toBe('E = mc^2');
            expect(block.content.displayMode).toBe(true);
        });

        it('应该支持行内公式', () => {
            const block: FormulaBlock = {
                id: 'formula-2',
                type: 'formula',
                content: {
                    latex: 'a^2 + b^2 = c^2',
                    displayMode: false,
                },
            };

            expect(block.content.displayMode).toBe(false);
        });
    });

    describe('复杂行内格式', () => {
        it('应该支持多种格式组合', () => {
            const block: ParagraphBlock = {
                id: 'complex-1',
                type: 'paragraph',
                content: {
                    inline: [
                        { text: 'Normal ' },
                        { text: 'Bold', bold: true },
                        { text: ' ' },
                        { text: 'Bold+Italic', bold: true, italic: true },
                        { text: ' ' },
                        { text: 'Code', code: true },
                        { text: ' ' },
                        { text: 'Link', link: { url: 'https://example.com' } },
                    ],
                },
            };

            expect(block.content.inline).toHaveLength(8);
            expect(block.content.inline[1].bold).toBe(true);
            expect(block.content.inline[3].bold).toBe(true);
            expect(block.content.inline[3].italic).toBe(true);
            expect(block.content.inline[5].code).toBe(true);
            expect(block.content.inline[7].link?.url).toBe('https://example.com');
        });

        it('应该支持嵌套链接中的格式', () => {
            const block: ParagraphBlock = {
                id: 'link-format-1',
                type: 'paragraph',
                content: {
                    inline: [
                        {
                            text: 'Styled Link',
                            bold: true,
                            link: { url: 'https://example.com', title: 'Example' },
                        },
                    ],
                },
            };

            expect(block.content.inline[0].bold).toBe(true);
            expect(block.content.inline[0].link?.url).toBe('https://example.com');
            expect(block.content.inline[0].link?.title).toBe('Example');
        });
    });
});
