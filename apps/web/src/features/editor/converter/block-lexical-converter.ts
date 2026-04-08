/**
 * Block[] ↔ Lexical 双向转换器
 *
 * 负责在 Block[] 内容模型和 Lexical 节点树之间进行转换
 */

import type { LexicalEditor } from 'lexical';
import {
    $createParagraphNode,
    $createTextNode,
    $getRoot,
    $isParagraphNode,
    $isTextNode,
    type TextNode,
} from 'lexical';
import { $createHeadingNode, $isHeadingNode, type HeadingNode } from '@lexical/rich-text';
import {
    $createListItemNode,
    $createListNode,
    $isListItemNode,
    $isListNode,
    type ListItemNode,
    type ListNode,
} from '@lexical/list';
import { $createQuoteNode, $isQuoteNode, type QuoteNode } from '@lexical/rich-text';
import { $createCodeNode, $isCodeNode, type CodeNode } from '@lexical/code';

import type {
    Block,
    Inline,
    ParagraphBlock,
    HeadingBlock,
    ListBlock,
    QuoteBlock,
    CodeBlock,
} from '../types/block';
import { nanoid } from 'nanoid';

/**
 * 将 Inline[] 转换为带格式的 TextNode
 */
function inlineToTextNode(inline: Inline): TextNode {
    const textNode = $createTextNode(inline.text);

    if (inline.bold) textNode.toggleFormat('bold');
    if (inline.italic) textNode.toggleFormat('italic');
    if (inline.underline) textNode.toggleFormat('underline');
    if (inline.strikethrough) textNode.toggleFormat('strikethrough');
    if (inline.code) textNode.toggleFormat('code');
    if (inline.highlight) textNode.toggleFormat('highlight');
    if (inline.subscript) textNode.toggleFormat('subscript');
    if (inline.superscript) textNode.toggleFormat('superscript');

    return textNode;
}

/**
 * 将 TextNode 转换为 Inline
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

    // TODO: 处理链接
    const linkNode = textNode.getParent();
    if (linkNode && linkNode.getType() === 'link') {
        // TODO: 提取链接信息
    }

    return inline;
}

/**
 * 将单个 Block 转换为 Lexical 节点
 */
function blockToLexical(block: Block, editor: LexicalEditor): any[] {
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
            nodes.forEach(node => root.append(node));
        });
    });
}

/**
 * 将 Lexical 节点转换为 Inline[]
 */
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
        const level = parseInt(headingNode.getTag().slice(1)) as 1 | 2 | 3 | 4 | 5 | 6;
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
