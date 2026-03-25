/**
 * 类型测试文件
 * 用于验证类型定义的完整性和正确性
 */

import type {
    Block,
    Document,
    FormatState,
    HeadingBlock,
    ListBlock,
    Operation,
    ParagraphBlock,
    Position,
    Selection,
} from '../index';

// 测试 Document 类型
const testDocument: Document = {
    id: 'doc-test123',
    path: '/documents/test.md',
    title: '测试文档',
    type: 'rich-text',
    content: [],
    version: 1,
    createdAt: '2026-03-25T10:00:00Z',
    updatedAt: '2026-03-25T10:00:00Z',
    operations: [],
};

// 测试 Operation 类型
const testOperation: Operation = {
    type: 'insert-block',
    timestamp: '2026-03-25T10:00:00Z',
    blockId: 'block-test123',
    data: { index: 0 },
};

// 测试 ParagraphBlock 类型
const paragraphBlock: ParagraphBlock = {
    id: 'block-para1',
    type: 'paragraph',
    content: {
        text: '这是一个段落',
    },
};

// 测试 HeadingBlock 类型
const headingBlock: HeadingBlock = {
    id: 'block-head1',
    type: 'heading',
    content: {
        text: '这是一个标题',
        level: 1,
    },
};

// 测试 ListBlock 类型
const listBlock: ListBlock = {
    id: 'block-list1',
    type: 'list',
    content: {
        items: [
            { id: 'item-1', text: '项目 1' },
            { id: 'item-2', text: '项目 2', checked: true },
        ],
        listType: 'bullet',
    },
};

// 测试 Block 联合类型
const blocks: Block[] = [paragraphBlock, headingBlock, listBlock];

// 测试 Position 类型
const position: Position = {
    blockId: 'block-para1',
    offset: 5,
};

// 测试 Selection 类型
const selection: Selection = {
    anchor: { blockId: 'block-para1', offset: 0 },
    head: { blockId: 'block-para1', offset: 10 },
    text: '选中的文本',
};

// 测试 FormatState 类型
const formatState: FormatState = {
    bold: true,
    italic: false,
    underline: false,
    code: false,
    strikethrough: false,
    subscript: false,
    superscript: false,
    highlight: false,
};

// 导出测试变量以避免未使用警告
export {
    testDocument,
    testOperation,
    paragraphBlock,
    headingBlock,
    listBlock,
    blocks,
    position,
    selection,
    formatState,
};
