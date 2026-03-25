/**
 * Editor Types
 *
 * 富文本编辑器类型定义模块
 * 基于 Lexical 引擎，采用粗粒度块设计（Block = 语义单元）
 */

// Block 相关类型
export type {
    BaseBlock,
    Block,
    BlockContentType,
    BlockType,
    CodeBlock,
    CodeContent,
    FormulaBlock,
    FormulaContent,
    HeadingBlock,
    HeadingContent,
    ImageBlock,
    ImageContent,
    ListBlock,
    ListContent,
    ListItem,
    // 具体块类型
    ParagraphBlock,
    // 块内容类型
    ParagraphContent,
    QuoteBlock,
    QuoteContent,
    TableBlock,
    TableCell,
    TableContent,
} from './block';
// Document 相关类型
export type {
    Document,
    DocumentType,
    Operation,
    OperationType,
} from './document';

// Selection 相关类型
export type {
    BlockFormatState,
    FormatState,
    Position,
    Selection,
} from './selection';
