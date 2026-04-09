/**
 * Rich Text Editor Module
 *
 * 基于 Lexical 的富文本编辑器
 * 采用粗粒度块设计（Block = 语义单元）
 */

// Container
export { EditorContainer } from './container';
export type { BlockCategory, BlockTypeConfig } from './registry';
// Registry
export { BlockRegistry, blockRegistry, builtinBlockTypes, registerBuiltinBlocks } from './registry';
export type { EditorService, EditorState, SaveResult } from './service';
export { createEditorService } from './service';
// Store
// Core types
export type {
    BaseBlock,
    Block,
    BlockContentType,
    BlockFormatState,
    BlockType,
    CodeBlock,
    CodeContent,
    Document,
    DocumentType,
    FormatState,
    FormulaBlock,
    FormulaContent,
    HeadingBlock,
    HeadingContent,
    ImageBlock,
    ImageContent,
    ListBlock,
    ListContent,
    ListItem,
    Operation,
    OperationType,
    ParagraphBlock,
    ParagraphContent,
    Position,
    QuoteBlock,
    QuoteContent,
    Selection,
    TableBlock,
    TableCell,
    TableContent,
} from './types';
