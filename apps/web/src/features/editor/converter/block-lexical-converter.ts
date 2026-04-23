/**
 * Block[] ↔ Lexical 双向转换器
 *
 * 负责在 Block[] 内容模型和 Lexical 节点树之间进行转换
 */

import { $createCodeNode, $isCodeNode, type CodeNode } from '@lexical/code';
import { $createLinkNode, $isLinkNode, type LinkNode } from '@lexical/link';
import {
    $createListItemNode,
    $createListNode,
    $isListItemNode,
    $isListNode,
    type ListItemNode,
    type ListNode,
} from '@lexical/list';
import {
    $createHeadingNode,
    $createQuoteNode,
    $isHeadingNode,
    $isQuoteNode,
    type HeadingNode,
    type QuoteNode,
} from '@lexical/rich-text';
import {
    $createTableCellNode,
    $createTableNode,
    $createTableRowNode,
    $isTableCellNode,
    $isTableNode,
    $isTableRowNode,
    type TableCellNode,
    type TableNode,
} from '@lexical/table';
import type { LexicalEditor } from 'lexical';
import {
    $createParagraphNode,
    $createTextNode,
    $getRoot,
    $isParagraphNode,
    $isTextNode,
    type TextNode,
} from 'lexical';
import { nanoid } from 'nanoid';
import type {
    Block,
    CodeBlock,
    FormulaBlock,
    HeadingBlock,
    ImageBlock,
    Inline,
    ListBlock,
    ParagraphBlock,
    QuoteBlock,
    TableBlock,
} from '../types/block';

/**
 * 将 Inline[] 转换为带格式的 TextNode，如果有 link 则包裹 LinkNode
 */
function inlineToTextNode(inline: Inline): TextNode | LinkNode {
    const textNode = $createTextNode(inline.text);

    if (inline.bold) textNode.toggleFormat('bold');
    if (inline.italic) textNode.toggleFormat('italic');
    if (inline.underline) textNode.toggleFormat('underline');
    if (inline.strikethrough) textNode.toggleFormat('strikethrough');
    if (inline.code) textNode.toggleFormat('code');
    if (inline.highlight) textNode.toggleFormat('highlight');
    if (inline.subscript) textNode.toggleFormat('subscript');
    if (inline.superscript) textNode.toggleFormat('superscript');

    // 如果有链接，包裹 LinkNode
    if (inline.link) {
        const linkNode = $createLinkNode(inline.link.url);
        if (inline.link.title) {
            linkNode.setTitle(inline.link.title);
        }
        linkNode.append(textNode);
        return linkNode;
    }

    return textNode;
}

/**
 * 将 TextNode 转换为 Inline，如果父节点是 LinkNode 则提取链接信息
 */
function textNodeToInline(textNode: TextNode): Inline {
    const inline: Inline = { text: textNode.getTextContent() };

    const format = textNode.getFormat();
    if (format & 1) inline.bold = true; // IS_BOLD
    if (format & 2) inline.italic = true; // IS_ITALIC
    if (format & 4) inline.strikethrough = true; // IS_STRIKETHROUGH
    if (format & 8) inline.underline = true; // IS_UNDERLINE
    if (format & 16) inline.code = true; // IS_CODE
    if (format & 32) inline.subscript = true; // IS_SUBSCRIPT
    if (format & 64) inline.superscript = true; // IS_SUPERSCRIPT
    if (format & 128) inline.highlight = true; // IS_HIGHLIGHT

    // 提取链接信息
    const linkNode = textNode.getParent();
    if (linkNode && $isLinkNode(linkNode)) {
        inline.link = {
            url: linkNode.getURL(),
            title: linkNode.getTitle() || undefined,
        };
    }

    return inline;
}

/**
 * 将单个 Block 转换为 Lexical 节点
 */
// biome-ignore lint/suspicious/noExplicitAny: Lexical 节点类型不统一
function blockToLexical(block: Block, _editor: LexicalEditor): any[] {
    // biome-ignore lint/suspicious/noExplicitAny: Lexical 节点类型不统一
    const nodes: any[] = [];

    switch (block.type) {
        case 'paragraph': {
            const paragraphNode = $createParagraphNode();
            const content = block.content;
            if (content && Array.isArray(content.inline)) {
                content.inline.forEach(inline => {
                    paragraphNode.append(inlineToTextNode(inline));
                });
            }
            nodes.push(paragraphNode);
            break;
        }

        case 'heading': {
            const { level, inline } = block.content;
            const headingNode = $createHeadingNode(`h${level}`);
            inline.forEach(inlineItem => {
                headingNode.append(inlineToTextNode(inlineItem));
            });
            nodes.push(headingNode);
            break;
        }

        case 'list': {
            const { items, listType } = block.content;
            const listNode = $createListNode(listType === 'number' ? 'number' : 'bullet');

            items.forEach(item => {
                const listItemNode = $createListItemNode();
                item.inline.forEach(inline => {
                    listItemNode.append(inlineToTextNode(inline));
                });
                listNode.append(listItemNode);
            });

            nodes.push(listNode);
            break;
        }

        case 'quote': {
            const quoteNode = $createQuoteNode();
            const { inline } = block.content;
            inline.forEach(inlineItem => {
                const paragraph = $createParagraphNode();
                paragraph.append(inlineToTextNode(inlineItem));
                quoteNode.append(paragraph);
            });
            nodes.push(quoteNode);
            break;
        }

        case 'code': {
            const { code, language } = block.content;
            const codeNode = $createCodeNode(language);
            code.split('\n').forEach((line, index) => {
                if (index > 0) {
                    codeNode.append($createTextNode('\n'));
                }
                codeNode.append($createTextNode(line));
            });
            nodes.push(codeNode);
            break;
        }

        case 'table': {
            const { rows, cols, cells } = block.content;
            const tableNode = $createTableNode();

            for (let rowIndex = 0; rowIndex < rows; rowIndex++) {
                const rowNode = $createTableRowNode();
                for (let colIndex = 0; colIndex < cols; colIndex++) {
                    const cell = cells.find(c => c.row === rowIndex && c.col === colIndex);
                    const cellNode = $createTableCellNode(0); // 0 = data cell, 1 = header cell
                    if (cell?.content) {
                        const paragraph = $createParagraphNode();
                        paragraph.append($createTextNode(cell.content));
                        cellNode.append(paragraph);
                    }
                    rowNode.append(cellNode);
                }
                tableNode.append(rowNode);
            }

            nodes.push(tableNode);
            break;
        }

        case 'image': {
            const { src, alt, caption } = block.content;
            // 使用段落节点包裹图片信息，caption 作为后续文本
            const containerNode = $createParagraphNode();
            // 创建一个特殊标记的文本节点来存储图片信息
            const imageMarker = $createTextNode(`![${alt}](${src})`);
            imageMarker.toggleFormat('code');
            containerNode.append(imageMarker);

            // 如果有 caption，添加到单独的段落
            if (caption) {
                const captionNode = $createParagraphNode();
                captionNode.append($createTextNode(caption));
                nodes.push(captionNode);
            }

            nodes.push(containerNode);
            break;
        }

        case 'formula': {
            const { latex } = block.content;
            // 使用 code 格式标记公式 LaTeX 内容
            const formulaNode = $createParagraphNode();
            const formulaMarker = $createTextNode(`$$${latex}$$`);
            formulaMarker.toggleFormat('code');
            formulaNode.append(formulaMarker);
            nodes.push(formulaNode);
            break;
        }

        default:
            // 未知块类型，创建空段落
            nodes.push($createParagraphNode());
    }

    return nodes;
}

/**
 * 将 Block[] 转换为 Lexical 节点树
 */
export function blocksToLexical(blocks: Block[], editor: LexicalEditor): void {
    editor.update(() => {
        const root = $getRoot();
        root.clear();

        blocks.forEach(block => {
            const nodes = blockToLexical(block, editor);
            for (const node of nodes) {
                root.append(node);
            }
        });
    });
}

/**
 * 将 Lexical 节点转换为 Inline[]
 */
// biome-ignore lint/suspicious/noExplicitAny: Lexical 节点类型不统一，需要灵活处理
function extractInlineFromNodes(nodes: any[]): Inline[] {
    const inline: Inline[] = [];

    nodes.forEach(node => {
        if ($isTextNode(node)) {
            inline.push(textNodeToInline(node));
        } else if (node.getChildren) {
            // 递归处理子节点
            inline.push(...extractInlineFromNodes(node.getChildren()));
        }
    });

    return inline;
}

/**
 * 将单个 Lexical 节点转换为 Block
 */
// biome-ignore lint/suspicious/noExplicitAny: Lexical 节点类型不统一
function lexicalNodeToBlock(node: any): Block | null {
    if ($isParagraphNode(node)) {
        const inline = extractInlineFromNodes(node.getChildren());
        return {
            id: nanoid(),
            type: 'paragraph',
            content: { inline },
        } as ParagraphBlock;
    }

    if ($isHeadingNode(node)) {
        const headingNode = node as HeadingNode;
        const level = parseInt(headingNode.getTag().slice(1), 10) as 1 | 2 | 3 | 4 | 5 | 6;
        const inline = extractInlineFromNodes(node.getChildren());
        return {
            id: nanoid(),
            type: 'heading',
            content: { inline, level },
        } as HeadingBlock;
    }

    if ($isListNode(node)) {
        const listNode = node as ListNode;
        const listType = listNode.getListType() === 'number' ? 'number' : 'bullet';
        const items = node
            .getChildren()
            .filter($isListItemNode)
            .map((itemNode: ListItemNode) => ({
                id: nanoid(),
                inline: extractInlineFromNodes(itemNode.getChildren()),
                checked: itemNode.getChecked(),
            }));

        return {
            id: nanoid(),
            type: 'list',
            content: { items, listType },
        } as ListBlock;
    }

    if ($isQuoteNode(node)) {
        const quoteNode = node as QuoteNode;
        // 提取引用内容（可能是嵌套的段落节点）
        const inline = extractInlineFromNodes(quoteNode.getChildren());
        return {
            id: nanoid(),
            type: 'quote',
            content: { inline },
        } as QuoteBlock;
    }

    if ($isCodeNode(node)) {
        const codeNode = node as CodeNode;
        const code = codeNode.getTextContent();
        const language = codeNode.getLanguage() || 'plaintext';
        return {
            id: nanoid(),
            type: 'code',
            content: { code, language },
        } as CodeBlock;
    }

    if ($isTableNode(node)) {
        const tableNode = node as TableNode;
        const rows = tableNode.getChildren().filter($isTableRowNode);
        const rowCount = rows.length;
        const colCount = rowCount > 0 ? rows[0].getChildren().filter($isTableCellNode).length : 0;
        const cells: { row: number; col: number; content: string }[] = [];

        rows.forEach((rowNode, rowIndex) => {
            rowNode
                .getChildren()
                .filter($isTableCellNode)
                .forEach((cellNode, colIndex) => {
                    const cellNodeTyped = cellNode as TableCellNode;
                    const content = cellNodeTyped.getTextContent();
                    cells.push({
                        row: rowIndex,
                        col: colIndex,
                        content: content,
                    });
                });
        });

        return {
            id: nanoid(),
            type: 'table',
            content: {
                rows: rowCount,
                cols: colCount,
                cells: cells,
            },
        } as TableBlock;
    }

    // 检测图片节点（使用 Markdown 格式的 code 标记文本）
    const imageMatch = node.getTextContent?.().match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (imageMatch && node.getChildren().length === 1) {
        const firstChild = node.getFirstChild();
        if ($isTextNode(firstChild)) {
            const format = firstChild.getFormat();
            // 检查是否有 code 格式标记（我们在 blocksToLexical 中设置的）
            if (format & 16) {
                // IS_CODE
                const alt = imageMatch[1];
                const src = imageMatch[2];
                // 检查下一个兄弟节点是否为 caption
                let caption: string | undefined;
                const nextSibling = node.getNextSibling();
                if (nextSibling && $isParagraphNode(nextSibling)) {
                    const nextContent = nextSibling.getTextContent();
                    // 如果下一个段落只包含简单文本，可能是 caption
                    if (nextContent && !nextContent.startsWith('![')) {
                        caption = nextContent;
                    }
                }
                return {
                    id: nanoid(),
                    type: 'image',
                    content: { src, alt, caption },
                } as ImageBlock;
            }
        }
    }

    // 检测公式节点（$$...$$ 格式）
    const formulaMatch = node.getTextContent?.().match(/^\$\$(.+)\$\$$/);
    if (formulaMatch && node.getChildren().length === 1) {
        const firstChild = node.getFirstChild();
        if ($isTextNode(firstChild)) {
            const format = firstChild.getFormat();
            if (format & 16) {
                // IS_CODE
                const latex = formulaMatch[1];
                return {
                    id: nanoid(),
                    type: 'formula',
                    content: {
                        latex,
                        displayMode: true, // 默认都是 display mode
                    },
                } as FormulaBlock;
            }
        }
    }

    // 未知节点类型
    return null;
}

/**
 * 将 Lexical 编辑器内容转换为 Block[]
 */
export function lexicalToBlocks(editor: LexicalEditor): Block[] {
    const blocks: Block[] = [];

    editor.getEditorState().read(() => {
        const root = $getRoot();
        root.getChildren().forEach(node => {
            const block = lexicalNodeToBlock(node);
            if (block) {
                blocks.push(block);
            }
        });
    });

    return blocks;
}
