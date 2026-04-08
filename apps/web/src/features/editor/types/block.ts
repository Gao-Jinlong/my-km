/**
 * 块类型枚举
 */
export type BlockType =
    | 'paragraph'
    | 'heading'
    | 'list'
    | 'quote'
    | 'code'
    | 'table'
    | 'image'
    | 'formula';

/**
 * 行内格式标记
 */
export type InlineMark =
    | 'bold'
    | 'italic'
    | 'underline'
    | 'strikethrough'
    | 'code'
    | 'highlight'
    | 'subscript'
    | 'superscript';

/**
 * 行内内容单元
 */
export interface Inline {
    text: string;
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    strikethrough?: boolean;
    code?: boolean;
    highlight?: boolean;
    subscript?: boolean;
    superscript?: boolean;
    link?: { url: string; title?: string };
}

/**
 * 段落块内容
 */
export interface ParagraphContent {
    inline: Inline[];
}

/**
 * 标题块内容
 */
export interface HeadingContent {
    inline: Inline[];
    level: 1 | 2 | 3 | 4 | 5 | 6;
}

/**
 * 列表项接口
 */
export interface ListItem {
    id: string;
    inline: Inline[];
    checked?: boolean;
}

/**
 * 列表块内容
 */
export interface ListContent {
    items: ListItem[];
    listType: 'bullet' | 'number' | 'check';
}

/**
 * 引用块内容
 */
export interface QuoteContent {
    inline: Inline[];
    cite?: string;
}

/**
 * 代码块内容
 */
export interface CodeContent {
    code: string;
    language: string;
}

/**
 * 表格单元格接口
 */
export interface TableCell {
    row: number;
    col: number;
    content: string;
}

/**
 * 表格块内容
 */
export interface TableContent {
    rows: number;
    cols: number;
    cells: TableCell[];
}

/**
 * 图片块内容
 */
export interface ImageContent {
    src: string;
    alt: string;
    caption?: string;
}

/**
 * 公式块内容
 */
export interface FormulaContent {
    latex: string;
    displayMode: boolean;
}

/**
 * 所有块内容类型的联合
 */
export type BlockContentType =
    | ParagraphContent
    | HeadingContent
    | ListContent
    | QuoteContent
    | CodeContent
    | TableContent
    | ImageContent
    | FormulaContent;

/**
 * Block 基础接口
 * 所有块类型的通用结构
 */
export interface BaseBlock {
    id: string; // 格式：block-xxxxx
    type: BlockType;
    content: Record<string, any>;
    children?: Block[]; // 嵌套块（用于列表等）
    styles?: Record<string, any>;
    metadata?: Record<string, any>;
}

/**
 * 段落块
 */
export interface ParagraphBlock extends BaseBlock {
    type: 'paragraph';
    content: ParagraphContent;
}

/**
 * 标题块
 */
export interface HeadingBlock extends BaseBlock {
    type: 'heading';
    content: HeadingContent;
}

/**
 * 列表块
 */
export interface ListBlock extends BaseBlock {
    type: 'list';
    content: ListContent;
}

/**
 * 引用块
 */
export interface QuoteBlock extends BaseBlock {
    type: 'quote';
    content: QuoteContent;
}

/**
 * 代码块
 */
export interface CodeBlock extends BaseBlock {
    type: 'code';
    content: CodeContent;
}

/**
 * 表格块
 */
export interface TableBlock extends BaseBlock {
    type: 'table';
    content: TableContent;
}

/**
 * 图片块
 */
export interface ImageBlock extends BaseBlock {
    type: 'image';
    content: ImageContent;
}

/**
 * 公式块
 */
export interface FormulaBlock extends BaseBlock {
    type: 'formula';
    content: FormulaContent;
}

/**
 * 所有块类型的联合
 */
export type Block =
    | ParagraphBlock
    | HeadingBlock
    | ListBlock
    | QuoteBlock
    | CodeBlock
    | TableBlock
    | ImageBlock
    | FormulaBlock;
