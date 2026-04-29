/**
 * AI Integration Tests
 *
 * 测试 ContextCollector 与 EditorService 集成
 * 测试选区变化时上下文更新
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EditorService } from '../../editor/service';
import type { Document, Selection } from '../../editor/types';
import { createContextCollector } from '../harness/context-collector';

/**
 * 创建测试用的文档
 */
function createTestDocument(overrides?: Partial<Document>): Document {
    return {
        id: 'test-doc-123',
        path: '/test/document',
        title: 'Test Document',
        type: 'km',
        content: [],
        version: 1,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
        ...overrides,
    };
}

/**
 * 创建增强型模拟编辑器服务
 */
function createEnhancedMockEditorService(
    documentId: string,
    _document?: Document,
): {
    service: EditorService;
    mocks: Record<string, unknown>;
    triggerSelectionChange: (selection: Selection | null) => void;
    triggerFormatChange: (format: Partial<import('../../editor/types').FormatState>) => void;
} {
    let currentSelection: Selection | null = null;
    let currentFormatState = {
        bold: false,
        italic: false,
        underline: false,
        code: false,
        strikethrough: false,
        subscript: false,
        superscript: false,
        highlight: false,
    };

    const mocks = {
        loadDocument: vi.fn(),
        saveDocument: vi.fn().mockResolvedValue({ success: true }),
        getSelection: vi.fn(() => currentSelection),
        getSelectedText: vi.fn(() => currentSelection?.text ?? null),
        getFullContent: vi.fn().mockReturnValue('Document content'),
        getFormatState: vi.fn(() => currentFormatState),
        insertBlock: vi.fn(),
        updateBlock: vi.fn(),
        deleteBlock: vi.fn(),
        destroy: vi.fn(),
    };

    const service: EditorService = {
        documentId,
        filePath: `/test/${documentId}`,
        isDisposed: false,
        onChange: vi.fn(() => ({ dispose: vi.fn() })),
        setEditor: vi.fn(),
        getEditor: vi.fn(() => null),
        loadDocument: mocks.loadDocument,
        saveDocument: mocks.saveDocument,
        getSelection: mocks.getSelection,
        getSelectedText: mocks.getSelectedText,
        getFullContent: mocks.getFullContent,
        getFormatState: mocks.getFormatState,
        getState: vi.fn(() => ({
            isDirty: false,
            isSaving: false,
            isSaved: false,
            hasError: false,
            isReadonly: false,
            error: null,
        })),
        insertTextAtCursor: vi.fn(),
        replaceSelection: vi.fn(),
        destroy: mocks.destroy,
    };

    return {
        service,
        mocks,
        triggerSelectionChange: (selection: Selection | null) => {
            currentSelection = selection;
            mocks.getSelection.mockReturnValue(selection);
            mocks.getSelectedText.mockReturnValue(selection?.text ?? null);
        },
        triggerFormatChange: (format: Partial<typeof currentFormatState>) => {
            currentFormatState = { ...currentFormatState, ...format };
            mocks.getFormatState.mockReturnValue(currentFormatState);
        },
    };
}

describe('AI Integration', () => {
    let contextCollector: ReturnType<typeof createContextCollector>;

    beforeEach(() => {
        contextCollector = createContextCollector();
        vi.clearAllMocks();
    });

    afterEach(() => {
        contextCollector.dispose();
        vi.clearAllMocks();
    });

    describe('ContextCollector 与 EditorService 集成', () => {
        it('应该能够注册编辑器服务', () => {
            const { service: editorService } = createEnhancedMockEditorService('doc-123');

            expect(() => {
                contextCollector.registerEditor('doc-123', editorService);
            }).not.toThrow();
        });

        it('应该能够获取已注册编辑器的上下文', async () => {
            const testDoc = createTestDocument({ title: 'Integration Test Doc' });
            const { service: editorService } = createEnhancedMockEditorService('doc-123', testDoc);

            contextCollector.registerEditor('doc-123', editorService);
            contextCollector.setDocumentMeta('doc-123', {
                id: 'doc-123',
                title: 'Integration Test Doc',
                path: '/test/document',
            });

            const context = await contextCollector.getContext('doc-123');

            expect(context).toBeDefined();
            expect(context?.documentTitle).toBe('Integration Test Doc');
        });

        it('应该返回 null 当获取未注册编辑器的上下文', async () => {
            const context = await contextCollector.getContext('non-existent');

            expect(context).toBeNull();
        });

        it('应该能够管理多个编辑器实例', async () => {
            const doc1 = createTestDocument({ id: 'doc-1', title: 'Document 1' });
            const doc2 = createTestDocument({ id: 'doc-2', title: 'Document 2' });

            const { service: editor1 } = createEnhancedMockEditorService('doc-1', doc1);
            const { service: editor2 } = createEnhancedMockEditorService('doc-2', doc2);

            contextCollector.registerEditor('doc-1', editor1);
            contextCollector.registerEditor('doc-2', editor2);
            contextCollector.setDocumentMeta('doc-1', {
                id: 'doc-1',
                title: 'Document 1',
                path: '/doc-1',
            });
            contextCollector.setDocumentMeta('doc-2', {
                id: 'doc-2',
                title: 'Document 2',
                path: '/doc-2',
            });

            const context1 = await contextCollector.getContext('doc-1');
            const context2 = await contextCollector.getContext('doc-2');

            expect(context1?.documentTitle).toBe('Document 1');
            expect(context2?.documentTitle).toBe('Document 2');

            editor1.destroy();
            editor2.destroy();
        });
    });

    describe('选区变化时上下文更新', () => {
        it('应该能够获取选区变化后的上下文', async () => {
            const testDoc = createTestDocument();
            const { service: editorService, triggerSelectionChange } =
                createEnhancedMockEditorService('doc-123', testDoc);

            contextCollector.registerEditor('doc-123', editorService);

            // 初始没有选区
            let context = await contextCollector.getContext('doc-123');
            expect(context?.selectedText).toBeNull();

            // 模拟选区变化
            const newSelection: Selection = {
                anchor: { blockId: 'block-1', offset: 0 },
                head: { blockId: 'block-1', offset: 5 },
                text: 'Hello',
            };
            triggerSelectionChange(newSelection);

            // 获取更新后的上下文
            context = await contextCollector.getContext('doc-123');

            expect(context?.selectedText).toBe('Hello');
        });

        it('应该能够处理选区消失的情况', async () => {
            const testDoc = createTestDocument();
            const { service: editorService, triggerSelectionChange } =
                createEnhancedMockEditorService('doc-123', testDoc);

            contextCollector.registerEditor('doc-123', editorService);

            // 先设置选区
            triggerSelectionChange({
                anchor: { blockId: 'block-1', offset: 0 },
                head: { blockId: 'block-1', offset: 5 },
                text: 'Hello',
            });

            let context = await contextCollector.getContext('doc-123');
            expect(context?.selectedText).toBe('Hello');

            // 取消选区
            triggerSelectionChange(null);

            context = await contextCollector.getContext('doc-123');
            expect(context?.selectedText).toBeNull();
        });
    });
});
