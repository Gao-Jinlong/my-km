import { XMLParser } from 'fast-xml-parser';
import { formatEditorContext } from '../format-editor-context';

/**
 * XML 解析器：保留属性，attribute 前缀为 @_，不自动转换属性值类型
 * （offset="0" 保持为字符串 "0"，避免 falsy 判断歧义）
 */
const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    parseAttributeValue: false,
    trimValues: true,
});

interface ParsedContext {
    document?: {
        '@_title'?: string;
        '@_path'?: string;
        '@_id'?: string;
    };
    selection?:
        | string
        | {
              '#text': string;
              '@_truncated': string;
          };
    cursor?: {
        '@_block_id': string;
        '@_offset': string;
    };
    excerpt?: {
        '@_full_length': string;
        '@_truncated': string;
        prefix?: string;
        selection_window?: string | { '#text': string; '@_offset': string };
    };
}

/**
 * 解析 formatted 字符串为对象，断言根元素为 <editor_context>
 * 对于可能带属性的元素（selection / selection_window），统一抽取 textContent
 */
function parse(formatted: string): ParsedContext {
    expect(formatted.startsWith('<editor_context>')).toBe(true);
    expect(formatted.endsWith('</editor_context>')).toBe(true);
    const obj = parser.parse(formatted);
    return obj.editor_context as ParsedContext;
}

/**
 * 提取可能带属性的元素的文本内容
 * fast-xml-parser 对纯文本元素返回 string，对带属性的元素返回 { '#text': ..., '@_xxx': ... }
 */
function textOf(node: unknown): string {
    if (typeof node === 'string') return node;
    if (node && typeof node === 'object' && '#text' in node) {
        const v = (node as { '#text': unknown })['#text'];
        return typeof v === 'string' ? v : String(v);
    }
    return '';
}

describe('formatEditorContext', () => {
    // ========== 空输入 ==========

    it('should return empty string for null', () => {
        expect(formatEditorContext(null)).toEqual({ formatted: '' });
    });

    it('should return empty string for undefined', () => {
        expect(formatEditorContext(undefined)).toEqual({ formatted: '' });
    });

    it('should return empty string for empty object', () => {
        expect(formatEditorContext({})).toEqual({ formatted: '' });
    });

    it('should return empty string when all fields are null', () => {
        expect(
            formatEditorContext({
                selectedText: null,
                fullContent: null,
                cursorPosition: null,
            }),
        ).toEqual({ formatted: '' });
    });

    // ========== 单字段 ==========

    it('should format selectedText only', () => {
        const r = formatEditorContext({ selectedText: 'hello world' });
        const ctx = parse(r.formatted);
        expect(textOf(ctx.selection)).toBe('hello world');
        expect(ctx.excerpt).toBeUndefined();
        expect(ctx.cursor).toBeUndefined();
        expect(ctx.document).toBeUndefined();
    });

    it('should format documentTitle', () => {
        const r = formatEditorContext({ documentTitle: 'My Notes' });
        const ctx = parse(r.formatted);
        expect(ctx.document?.['@_title']).toBe('My Notes');
    });

    it('should include all available document fields', () => {
        const r = formatEditorContext({
            documentTitle: 'Title',
            documentPath: '/path/to/file',
            documentId: 'doc-123',
        });
        const ctx = parse(r.formatted);
        expect(ctx.document?.['@_title']).toBe('Title');
        expect(ctx.document?.['@_path']).toBe('/path/to/file');
        expect(ctx.document?.['@_id']).toBe('doc-123');
    });

    it('should include path and id when no title', () => {
        const r = formatEditorContext({
            documentPath: '/path/to/file',
            documentId: 'doc-123',
        });
        const ctx = parse(r.formatted);
        expect(ctx.document?.['@_title']).toBeUndefined();
        expect(ctx.document?.['@_path']).toBe('/path/to/file');
        expect(ctx.document?.['@_id']).toBe('doc-123');
    });

    it('should include id only when no title or path', () => {
        const r = formatEditorContext({ documentId: 'doc-123' });
        const ctx = parse(r.formatted);
        expect(ctx.document?.['@_id']).toBe('doc-123');
        expect(ctx.document?.['@_title']).toBeUndefined();
        expect(ctx.document?.['@_path']).toBeUndefined();
    });

    it('should format cursorPosition', () => {
        const r = formatEditorContext({
            cursorPosition: { blockId: 'block-1', offset: 42 },
        });
        const ctx = parse(r.formatted);
        expect(ctx.cursor?.['@_block_id']).toBe('block-1');
        expect(ctx.cursor?.['@_offset']).toBe('42');
    });

    it('should format fullContent only', () => {
        const r = formatEditorContext({ fullContent: 'short content' });
        const ctx = parse(r.formatted);
        expect(ctx.excerpt).toBeDefined();
        expect(ctx.excerpt?.prefix).toBe('short content');
        expect(ctx.excerpt?.['@_truncated']).toBe('false');
        expect(ctx.excerpt?.['@_full_length']).toBe('13');
    });

    // ========== 截断 ==========

    it('should truncate selectedText over 2000 chars and mark truncated=true', () => {
        const longText = 'x'.repeat(3000);
        const r = formatEditorContext({ selectedText: longText });
        const ctx = parse(r.formatted);
        const sel = ctx.selection as { '#text': string; '@_truncated': string };
        expect(sel['@_truncated']).toBe('true');
        expect(sel['#text'].length).toBe(2000);
    });

    it('should mark selection truncated=false when under limit', () => {
        const r = formatEditorContext({ selectedText: 'short' });
        const ctx = parse(r.formatted);
        const sel = ctx.selection as { '#text': string; '@_truncated': string };
        expect(sel['@_truncated']).toBe('false');
    });

    it('should truncate fullContent to first 1000 chars in prefix', () => {
        const longContent = 'a'.repeat(5000);
        const r = formatEditorContext({ fullContent: longContent });
        const ctx = parse(r.formatted);
        expect(ctx.excerpt?.['@_truncated']).toBe('true');
        expect(ctx.excerpt?.['@_full_length']).toBe('5000');
        // prefix 是纯 a，长度为 1000
        const prefix = ctx.excerpt?.prefix;
        expect(typeof prefix === 'string' ? prefix.length : 0).toBe(1000);
    });

    it('should include selection_window when selectedText is beyond prefix range', () => {
        const prefix = 'x'.repeat(1500);
        const selectedText = 'TARGET';
        const suffix = 'y'.repeat(1000);
        const fullContent = `${prefix}${selectedText}${suffix}`;

        const r = formatEditorContext({ fullContent, selectedText });
        const ctx = parse(r.formatted);
        expect(ctx.excerpt?.selection_window).toBeDefined();
        const win = ctx.excerpt?.selection_window as {
            '#text': string;
            '@_offset': string;
        };
        expect(win['@_offset']).toBe('1500');
        expect(win['#text']).toContain('TARGET');
    });

    it('should NOT include selection_window when selectedText is within prefix', () => {
        const selectedText = 'EARLY';
        const fullContent = `${selectedText}${'z'.repeat(3000)}`;

        const r = formatEditorContext({ fullContent, selectedText });
        const ctx = parse(r.formatted);
        expect(ctx.excerpt?.selection_window).toBeUndefined();
    });

    // ========== 全字段组合 ==========

    it('should format all fields together', () => {
        const r = formatEditorContext({
            documentTitle: 'Test Doc',
            selectedText: 'important',
            fullContent: 'some content here',
            cursorPosition: { blockId: 'blk', offset: 5 },
        });

        const ctx = parse(r.formatted);
        expect(ctx.document?.['@_title']).toBe('Test Doc');
        expect(textOf(ctx.selection)).toBe('important');
        expect(ctx.cursor?.['@_block_id']).toBe('blk');
        expect(ctx.cursor?.['@_offset']).toBe('5');
        expect(ctx.excerpt?.prefix).toBe('some content here');
    });

    // ========== 边界情况 ==========

    it('should ignore unknown fields', () => {
        const r = formatEditorContext({
            unknownField: 'value',
            selectedText: 'hello',
        });
        const ctx = parse(r.formatted);
        expect(textOf(ctx.selection)).toBe('hello');
        expect(r.formatted).not.toContain('unknownField');
    });

    it('should handle non-string selectedText gracefully', () => {
        const r = formatEditorContext({ selectedText: 123 });
        expect(r.formatted).toBe('');
    });

    it('should handle empty string fields as absent', () => {
        const r = formatEditorContext({
            documentTitle: '',
            selectedText: '',
            fullContent: '',
        });
        expect(r.formatted).toBe('');
    });

    it('should handle cursorPosition with missing blockId', () => {
        const r = formatEditorContext({
            cursorPosition: { offset: 10 },
        });
        const ctx = parse(r.formatted);
        expect(ctx.cursor?.['@_block_id']).toBe('unknown');
        expect(ctx.cursor?.['@_offset']).toBe('10');
    });

    it('should handle cursorPosition with missing offset', () => {
        const r = formatEditorContext({
            cursorPosition: { blockId: 'blk-1' },
        });
        const ctx = parse(r.formatted);
        expect(ctx.cursor?.['@_block_id']).toBe('blk-1');
        expect(ctx.cursor?.['@_offset']).toBe('0');
    });

    // ========== XML 转义（新增）==========

    it('should escape XML special chars in selection text', () => {
        const r = formatEditorContext({
            selectedText: '<script>alert("xss")</script> & more',
        });
        // 原始字符串里不能出现未转义的标签结构
        expect(r.formatted).not.toContain('<script>');
        expect(r.formatted).toContain('&lt;script&gt;');
        // 但解析后能还原回原始内容
        const ctx = parse(r.formatted);
        expect(textOf(ctx.selection)).toBe('<script>alert("xss")</script> & more');
    });

    it('should escape XML special chars in document attributes', () => {
        const r = formatEditorContext({
            documentTitle: 'A & B <Notes>',
            documentPath: '/path/with"quote',
        });
        expect(r.formatted).not.toContain('<Notes>');
        const ctx = parse(r.formatted);
        expect(ctx.document?.['@_title']).toBe('A & B <Notes>');
        expect(ctx.document?.['@_path']).toBe('/path/with"quote');
    });

    it('should escape XML special chars in excerpt content', () => {
        const fullContent = 'code: <div class="x">&nbsp;</div>';
        const r = formatEditorContext({ fullContent });
        expect(r.formatted).not.toContain('<div');
        const ctx = parse(r.formatted);
        expect(ctx.excerpt?.prefix).toBe(fullContent);
    });

    // ========== 输出结构（新增）==========

    it('should wrap output in <editor_context> root element', () => {
        const r = formatEditorContext({ selectedText: 'x' });
        expect(r.formatted.startsWith('<editor_context>')).toBe(true);
        expect(r.formatted.endsWith('</editor_context>')).toBe(true);
    });
});
