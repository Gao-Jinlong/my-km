/**
 * 内置块类型配置
 *
 * 注册 8 种基础块类型：paragraph, heading, list, quote, code, table, image, formula
 */

import type {
    CodeContent,
    FormulaContent,
    HeadingContent,
    ImageContent,
    ListContent,
    ParagraphContent,
    QuoteContent,
    TableContent,
} from '../types/block';
import { BlockCategory, type BlockTypeConfig, blockRegistry } from './BlockRegistry';

/**
 * 段落块类型配置
 */
const paragraphConfig: BlockTypeConfig = {
    type: 'paragraph',
    name: '段落',
    category: BlockCategory.TEXT,
    icon: 'paragraph',
    description: '普通文本段落',
    defaultContent: (): ParagraphContent => ({
        inline: [],
    }),
    isValid: (content): content is ParagraphContent => {
        return typeof content === 'object' && content !== null && Array.isArray(content.inline);
    },
};

/**
 * 标题块类型配置
 */
const headingConfig: BlockTypeConfig = {
    type: 'heading',
    name: '标题',
    category: BlockCategory.TEXT,
    icon: 'heading',
    description: '带级别的标题',
    defaultContent: (): HeadingContent => ({
        inline: [],
        level: 1,
    }),
    isValid: (content): content is HeadingContent => {
        return (
            typeof content === 'object' &&
            content !== null &&
            Array.isArray(content.inline) &&
            [1, 2, 3, 4, 5, 6].includes(content.level)
        );
    },
};

/**
 * 列表块类型配置
 */
const listConfig: BlockTypeConfig = {
    type: 'list',
    name: '列表',
    category: BlockCategory.STRUCTURE,
    icon: 'list',
    description: '有序列表、无序列表或待办事项',
    defaultContent: (): ListContent => ({
        items: [],
        listType: 'bullet',
    }),
    isValid: (content): content is ListContent => {
        return (
            typeof content === 'object' &&
            content !== null &&
            Array.isArray(content.items) &&
            ['bullet', 'number', 'check'].includes(content.listType)
        );
    },
    allowedChildren: ['paragraph', 'list'],
};

/**
 * 引用块类型配置
 */
const quoteConfig: BlockTypeConfig = {
    type: 'quote',
    name: '引用',
    category: BlockCategory.TEXT,
    icon: 'quote',
    description: '引用文本块',
    defaultContent: (): QuoteContent => ({
        inline: [],
        cite: undefined,
    }),
    isValid: (content): content is QuoteContent => {
        return (
            typeof content === 'object' &&
            content !== null &&
            Array.isArray(content.inline) &&
            (content.cite === undefined || typeof content.cite === 'string')
        );
    },
};

/**
 * 代码块类型配置
 */
const codeConfig: BlockTypeConfig = {
    type: 'code',
    name: '代码',
    category: BlockCategory.TEXT,
    icon: 'code',
    description: '代码块，支持语法高亮',
    defaultContent: (): CodeContent => ({
        code: '',
        language: 'plaintext',
    }),
    isValid: (content): content is CodeContent => {
        return (
            typeof content === 'object' &&
            content !== null &&
            typeof content.code === 'string' &&
            typeof content.language === 'string'
        );
    },
};

/**
 * 表格块类型配置
 */
const tableConfig: BlockTypeConfig = {
    type: 'table',
    name: '表格',
    category: BlockCategory.STRUCTURE,
    icon: 'table',
    description: '数据表格',
    defaultContent: (): TableContent => ({
        rows: 3,
        cols: 3,
        cells: [],
    }),
    isValid: (content): content is TableContent => {
        return (
            typeof content === 'object' &&
            content !== null &&
            typeof content.rows === 'number' &&
            typeof content.cols === 'number' &&
            Array.isArray(content.cells)
        );
    },
    allowedChildren: ['paragraph'],
};

/**
 * 图片块类型配置
 */
const imageConfig: BlockTypeConfig = {
    type: 'image',
    name: '图片',
    category: BlockCategory.MEDIA,
    icon: 'image',
    description: '插入图片',
    defaultContent: (): ImageContent => ({
        src: '',
        alt: '',
        caption: undefined,
    }),
    isValid: (content): content is ImageContent => {
        return (
            typeof content === 'object' &&
            content !== null &&
            typeof content.src === 'string' &&
            typeof content.alt === 'string' &&
            (content.caption === undefined || typeof content.caption === 'string')
        );
    },
};

/**
 * 公式块类型配置
 */
const formulaConfig: BlockTypeConfig = {
    type: 'formula',
    name: '公式',
    category: BlockCategory.MEDIA,
    icon: 'formula',
    description: 'LaTeX 数学公式',
    defaultContent: (): FormulaContent => ({
        latex: '',
        displayMode: false,
    }),
    isValid: (content): content is FormulaContent => {
        return (
            typeof content === 'object' &&
            content !== null &&
            typeof content.latex === 'string' &&
            typeof content.displayMode === 'boolean'
        );
    },
};

/**
 * 注册所有内置块类型
 */
export function registerBuiltinBlocks(): void {
    blockRegistry.register(paragraphConfig);
    blockRegistry.register(headingConfig);
    blockRegistry.register(listConfig);
    blockRegistry.register(quoteConfig);
    blockRegistry.register(codeConfig);
    blockRegistry.register(tableConfig);
    blockRegistry.register(imageConfig);
    blockRegistry.register(formulaConfig);
}

// 自动注册内置块类型
registerBuiltinBlocks();

/**
 * 导出所有内置块类型配置
 */
export const builtinBlockTypes = {
    paragraph: paragraphConfig,
    heading: headingConfig,
    list: listConfig,
    quote: quoteConfig,
    code: codeConfig,
    table: tableConfig,
    image: imageConfig,
    formula: formulaConfig,
};
