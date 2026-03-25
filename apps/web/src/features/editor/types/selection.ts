/**
 * 光标位置接口
 * 表示编辑器中的某个位置
 */
export interface Position {
    blockId: string;
    offset: number; // 字符偏移量
}

/**
 * 选区接口
 * 表示用户在编辑器中选中的文本范围
 */
export interface Selection {
    anchor: Position; // 选区起始位置
    head: Position; // 选区结束位置
    text: string; // 选中的文本内容
}

/**
 * 文本格式状态接口
 * 表示当前光标位置的文本格式状态
 */
export interface FormatState {
    bold: boolean;
    italic: boolean;
    underline: boolean;
    code: boolean;
    strikethrough: boolean;
    subscript: boolean;
    superscript: boolean;
    highlight: boolean;
}

/**
 * 块级格式状态接口
 */
export interface BlockFormatState {
    blockType: string;
    indent: number;
    alignment: 'left' | 'center' | 'right' | 'justify';
}
