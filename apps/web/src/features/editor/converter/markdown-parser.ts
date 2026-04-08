/**
 * Markdown to Block[] 转换器
 *
 * 使用 markdown-it 解析 Markdown 为 token AST，然后转换为 Block[]
 */

import MarkdownIt from 'markdown-it';
import type {
    Block,
    HeadingBlock,
    ParagraphBlock,
    ListBlock,
    QuoteBlock,
    CodeBlock,
    Inline,
} from '../types/block';
import { nanoid } from 'nanoid';

const md = new MarkdownIt({
    html: true,
    linkify: true,
    typographer: false,
});

/**
 * 将 inline tokens 转换为 Inline[] 数组
 */
function parseInlineTokens(tokens: any[]): Inline[] {
    const result: Inline[] = [];
    let currentInline: Partial<Inline> = { text: '' };

    for (const token of tokens) {
        if (token.type === 'text') {
            if (!currentInline.text) {
                currentInline.text = token.content;
            } else {
                currentInline.text += token.content;
            }
        } else if (token.type === 'strong_open' || token.type === 'strong_close') {
            if (token.type === 'strong_open') {
                if (currentInline.text) {
                    result.push({ text: currentInline.text, ...currentInline });
                    currentInline = { text: '' };
                }
                currentInline.bold = true;
            } else {
                if (currentInline.text) {
                    result.push({ text: currentInline.text, ...currentInline });
                    currentInline = { text: '', bold: false };
                }
            }
        } else if (token.type === 'em_open' || token.type === 'em_close') {
            if (token.type === 'em_open') {
                if (currentInline.text) {
                    result.push({ text: currentInline.text, ...currentInline });
                    currentInline = { text: '' };
                }
                currentInline.italic = true;
            } else {
                if (currentInline.text) {
                    result.push({ text: currentInline.text, ...currentInline });
                    currentInline = { text: '', italic: false };
                }
            }
        } else if (token.type === 'u_open' || token.type === 'u_close') {
            if (token.type === 'u_open') {
                if (currentInline.text) {
                    result.push({ text: currentInline.text, ...currentInline });
                    currentInline = { text: '' };
                }
                currentInline.underline = true;
            } else {
                if (currentInline.text) {
                    result.push({ text: currentInline.text, ...currentInline });
                    currentInline = { text: '', underline: false };
                }
            }
        } else if (token.type === 's_open' || token.type === 's_close') {
            if (token.type === 's_open') {
                if (currentInline.text) {
                    result.push({ text: currentInline.text, ...currentInline });
                    currentInline = { text: '' };
                }
                currentInline.strikethrough = true;
            } else {
                if (currentInline.text) {
                    result.push({ text: currentInline.text, ...currentInline });
                    currentInline = { text: '', strikethrough: false };
                }
            }
        } else if (token.type === 'code_inline') {
            if (currentInline.text) {
                result.push({ text: currentInline.text, ...currentInline });
                currentInline = { text: '' };
            }
            result.push({ text: token.content, code: true });
        } else if (token.type === 'link_open') {
            if (currentInline.text) {
                result.push({ text: currentInline.text, ...currentInline });
                currentInline = { text: '' };
            }
            const hrefAttr = token.attrs?.find((attr: string[]) => attr[0] === 'href');
            const titleAttr = token.attrs?.find((attr: string[]) => attr[0] === 'title');
            currentInline.link = {
                url: hrefAttr ? hrefAttr[1] : '',
                title: titleAttr ? titleAttr[1] : undefined,
            };
        } else if (token.type === 'link_close') {
            if (currentInline.text) {
                result.push({ text: currentInline.text, ...currentInline });
                currentInline = { text: '', link: undefined };
            }
        } else if (token.type === 'softbreak' || token.type === 'hardbreak') {
            if (currentInline.text) {
                result.push({ text: currentInline.text, ...currentInline });
                currentInline = { text: '\n' };
            } else {
                currentInline.text = '\n';
            }
        }
    }

    if (currentInline.text) {
        result.push({ text: currentInline.text, ...currentInline });
    }

    return result.filter(inline => inline.text !== '');
}

/**
 * 解析 Markdown 字符串为 Block[]
 */
export function parseMarkdown(markdown: string): Block[] {
    const tokens = md.parse(markdown, {});
    const blocks: Block[] = [];
    let i = 0;

    while (i < tokens.length) {
        const token = tokens[i];

        switch (token.type) {
            case 'heading_open': {
                const level = parseInt(token.tag.slice(1)) as 1 | 2 | 3 | 4 | 5 | 6;
                i++; // 移动到 inline 内容
                const inlineTokens = i < tokens.length && tokens[i].type === 'inline'
                    ? tokens[i].children || []
                    : [];
                blocks.push({
                    id: nanoid(),
                    type: 'heading',
                    content: {
                        inline: parseInlineTokens(inlineTokens),
                        level,
                    },
                });
                i++; // 跳过 heading_close
                break;
            }

            case 'paragraph_open': {
                i++; // 移动到 inline 内容
                const inlineTokens = i < tokens.length && tokens[i].type === 'inline'
                    ? tokens[i].children || []
                    : [];
                blocks.push({
                    id: nanoid(),
                    type: 'paragraph',
                    content: {
                        inline: parseInlineTokens(inlineTokens),
                    },
                });
                i++; // 跳过 paragraph_close
                break;
            }

            case 'blockquote_open': {
                i++; // 移动到 blockquote 内部
                const quoteLines: Inline[] = [];
                while (i < tokens.length && tokens[i].type !== 'blockquote_close') {
                    if (tokens[i].type === 'inline' && tokens[i].children) {
                        quoteLines.push(...parseInlineTokens(tokens[i].children || []));
                    }
                    i++;
                }
                blocks.push({
                    id: nanoid(),
                    type: 'quote',
                    content: {
                        inline: quoteLines,
                    },
                });
                i++; // 跳过 blockquote_close
                break;
            }

            case 'bullet_list_open': {
                const items: { id: string; inline: Inline[]; checked?: boolean }[] = [];
                i++; // 移动到列表内部
                while (i < tokens.length && tokens[i].type !== 'bullet_list_close') {
                    if (tokens[i].type === 'list_item_open') {
                        i++; // 移动到 item 内容
                        let itemText: Inline[] = [];
                        while (i < tokens.length && tokens[i].type !== 'list_item_close') {
                            if (tokens[i].type === 'inline' && tokens[i].children) {
                                itemText = parseInlineTokens(tokens[i].children || []);
                            }
                            i++;
                        }
                        items.push({
                            id: nanoid(),
                            inline: itemText,
                        });
                    } else {
                        i++;
                    }
                }
                blocks.push({
                    id: nanoid(),
                    type: 'list',
                    content: {
                        items,
                        listType: 'bullet',
                    },
                });
                i++; // 跳过 bullet_list_close
                break;
            }

            case 'ordered_list_open': {
                const items: { id: string; inline: Inline[]; checked?: boolean }[] = [];
                i++; // 移动到列表内部
                while (i < tokens.length && tokens[i].type !== 'ordered_list_close') {
                    if (tokens[i].type === 'list_item_open') {
                        i++; // 移动到 item 内容
                        let itemText: Inline[] = [];
                        while (i < tokens.length && tokens[i].type !== 'list_item_close') {
                            if (tokens[i].type === 'inline' && tokens[i].children) {
                                itemText = parseInlineTokens(tokens[i].children || []);
                            }
                            i++;
                        }
                        items.push({
                            id: nanoid(),
                            inline: itemText,
                        });
                    } else {
                        i++;
                    }
                }
                blocks.push({
                    id: nanoid(),
                    type: 'list',
                    content: {
                        items,
                        listType: 'number',
                    },
                });
                i++; // 跳过 ordered_list_close
                break;
            }

            case 'fence': {
                blocks.push({
                    id: nanoid(),
                    type: 'code',
                    content: {
                        language: token.info?.trim() || 'plaintext',
                        code: token.content,
                    },
                });
                break;
            }

            case 'code_block': {
                blocks.push({
                    id: nanoid(),
                    type: 'code',
                    content: {
                        language: 'plaintext',
                        code: token.content,
                    },
                });
                break;
            }

            case 'hr': {
                blocks.push({
                    id: nanoid(),
                    type: 'paragraph',
                    content: {
                        inline: [],
                    },
                    metadata: { horizontalRule: true },
                });
                break;
            }
        }

        i++;
    }

    return blocks;
}
