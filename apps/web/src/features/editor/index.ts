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
export type { EditorService, SaveResult } from './service';
// Service
export { createEditorService } from './service';
export type { EditorStoreApi } from './store';
// Store
export {
    createEditorStore,
    createEmptyFormatState,
    createEmptySelection,
} from './store';
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
