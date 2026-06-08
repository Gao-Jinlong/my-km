import { formatEditorContext } from '../format-editor-context';

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
        const result = formatEditorContext({ selectedText: 'hello world' });
        expect(result.formatted).toContain('Selected text: "hello world"');
        expect(result.formatted).toContain('[Editor Context]');
        expect(result.formatted).not.toContain('Document excerpt:');
        expect(result.formatted).not.toContain('Cursor:');
    });

    it('should format documentTitle', () => {
        const result = formatEditorContext({ documentTitle: 'My Notes' });
        expect(result.formatted).toContain('Document: My Notes');
    });

    it('should prefer documentTitle over documentPath and documentId', () => {
        const result = formatEditorContext({
            documentTitle: 'Title',
            documentPath: '/path/to/file',
            documentId: 'doc-123',
        });
        expect(result.formatted).toContain('Document: Title');
        expect(result.formatted).not.toContain('/path/to/file');
        expect(result.formatted).not.toContain('doc-123');
    });

    it('should use documentPath when no title', () => {
        const result = formatEditorContext({
            documentPath: '/path/to/file',
            documentId: 'doc-123',
        });
        expect(result.formatted).toContain('Document: /path/to/file');
    });

    it('should use documentId when no title or path', () => {
        const result = formatEditorContext({ documentId: 'doc-123' });
        expect(result.formatted).toContain('Document: doc-123');
    });

    it('should format cursorPosition', () => {
        const result = formatEditorContext({
            cursorPosition: { blockId: 'block-1', offset: 42 },
        });
        expect(result.formatted).toContain('Cursor: block-1 at offset 42');
    });

    it('should format fullContent only', () => {
        const result = formatEditorContext({ fullContent: 'short content' });
        expect(result.formatted).toContain('Document excerpt:');
        expect(result.formatted).toContain('short content');
    });

    // ========== 截断 ==========

    it('should truncate selectedText over 2000 chars', () => {
        const longText = 'x'.repeat(3000);
        const result = formatEditorContext({ selectedText: longText });
        expect(result.formatted).toContain('Selected text:');
        const match = result.formatted.match(/Selected text: "([^"]*)/);
        expect(match).toBeTruthy();
        expect(match![1].length).toBeLessThanOrEqual(2010);
    });

    it('should truncate fullContent to first 1000 chars', () => {
        const longContent = 'a'.repeat(5000);
        const result = formatEditorContext({ fullContent: longContent });
        expect(result.formatted).toContain('Document excerpt:');
        expect(result.formatted).toContain('a'.repeat(100));
        expect(result.formatted).not.toContain('a'.repeat(2000));
    });

    it('should include selection window when selectedText is beyond prefix range', () => {
        const prefix = 'x'.repeat(1500);
        const selectedText = 'TARGET';
        const suffix = 'y'.repeat(1000);
        const fullContent = `${prefix}${selectedText}${suffix}`;

        const result = formatEditorContext({ fullContent, selectedText });
        expect(result.formatted).toContain('TARGET');
        expect(result.formatted).toContain('[around selection]');
    });

    it('should NOT include selection window when selectedText is within prefix', () => {
        const selectedText = 'EARLY';
        const fullContent = `${selectedText}${'z'.repeat(3000)}`;

        const result = formatEditorContext({ fullContent, selectedText });
        expect(result.formatted).toContain('EARLY');
        expect(result.formatted).not.toContain('[around selection]');
    });

    // ========== 全字段组合 ==========

    it('should format all fields together', () => {
        const result = formatEditorContext({
            documentTitle: 'Test Doc',
            selectedText: 'important',
            fullContent: 'some content here',
            cursorPosition: { blockId: 'blk', offset: 5 },
        });

        expect(result.formatted).toContain('[Editor Context]');
        expect(result.formatted).toContain('Document: Test Doc');
        expect(result.formatted).toContain('Selected text: "important"');
        expect(result.formatted).toContain('Cursor: blk at offset 5');
        expect(result.formatted).toContain('Document excerpt:');
        expect(result.formatted).toContain('some content here');
    });

    // ========== 边界情况 ==========

    it('should ignore unknown fields', () => {
        const result = formatEditorContext({
            unknownField: 'value',
            selectedText: 'hello',
        });
        expect(result.formatted).toContain('Selected text: "hello"');
        expect(result.formatted).not.toContain('unknownField');
    });

    it('should handle non-string selectedText gracefully', () => {
        const result = formatEditorContext({ selectedText: 123 });
        expect(result.formatted).toBe('');
    });

    it('should handle empty string fields as absent', () => {
        const result = formatEditorContext({
            documentTitle: '',
            selectedText: '',
            fullContent: '',
        });
        expect(result.formatted).toBe('');
    });

    it('should handle cursorPosition with missing blockId', () => {
        const result = formatEditorContext({
            cursorPosition: { offset: 10 },
        });
        expect(result.formatted).toContain('Cursor: unknown at offset 10');
    });

    it('should handle cursorPosition with missing offset', () => {
        const result = formatEditorContext({
            cursorPosition: { blockId: 'blk-1' },
        });
        expect(result.formatted).toContain('Cursor: blk-1 at offset 0');
    });
});
