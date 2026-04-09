/**
 * AI Integration Tests
 *
 * 测试 AIContextService 与 EditorService 集成
 * 测试选区变化时上下文更新
 * 测试订阅者正确接收通知
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EditorService } from '../../editor/service';
import type { Document, Selection } from '../../editor/types';
import type { AIContext, AIContextService } from '../service/AIContextService';
import { createAIContextService } from '../service/AIContextService';

/**
 * 创建测试用的文档
 */
function createTestDocument(overrides?: Partial<Document>): Document {
    return {
        id: 'test-doc-123',
        path: '/test/document',
        title: 'Test Document',
        type: 'rich-text',
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

    const selectionChangeCallbacks: ((selection: Selection | null) => void)[] = [];
    const formatChangeCallbacks: ((format: typeof currentFormatState) => void)[] = [];

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
            hasError: false,
            isReadonly: false,
            error: null,
        })),
        destroy: mocks.destroy,
    };

    return {
        service,
        mocks,
        triggerSelectionChange: (selection: Selection | null) => {
            currentSelection = selection;
            mocks.getSelection.mockReturnValue(selection);
            mocks.getSelectedText.mockReturnValue(selection?.text ?? null);
            selectionChangeCallbacks.forEach(cb => {
                cb(selection);
            });
        },
        triggerFormatChange: (format: Partial<typeof currentFormatState>) => {
            currentFormatState = { ...currentFormatState, ...format };
            mocks.getFormatState.mockReturnValue(currentFormatState);
            formatChangeCallbacks.forEach(cb => {
                cb(currentFormatState);
            });
        },
    };
}

describe('AI Integration', () => {
    let aiContextService: AIContextService;

    beforeEach(() => {
        aiContextService = createAIContextService();
        vi.clearAllMocks();
    });

    afterEach(() => {
        aiContextService.dispose();
        vi.clearAllMocks();
    });

    describe('AIContextService 与 EditorService 集成', () => {
        it('应该能够注册编辑器服务', () => {
            const { service: editorService } = createEnhancedMockEditorService('doc-123');

            expect(() => {
                aiContextService.registerEditor('doc-123', editorService);
            }).not.toThrow();
        });

        it('应该能够获取已注册编辑器的上下文', async () => {
            const testDoc = createTestDocument({ title: 'Integration Test Doc' });
            const { service: editorService } = createEnhancedMockEditorService('doc-123', testDoc);

            aiContextService.registerEditor('doc-123', editorService);

            const context = await aiContextService.getContext('doc-123');

            expect(context).toBeDefined();
            expect(context?.document.title).toBe('Integration Test Doc');
        });

        it('应该返回 null 当获取未注册编辑器的上下文', async () => {
            const context = await aiContextService.getContext('non-existent');

            expect(context).toBeNull();
        });

        it('应该能够管理多个编辑器实例', async () => {
            const doc1 = createTestDocument({ id: 'doc-1', title: 'Document 1' });
            const doc2 = createTestDocument({ id: 'doc-2', title: 'Document 2' });

            const { service: editor1 } = createEnhancedMockEditorService('doc-1', doc1);
            const { service: editor2 } = createEnhancedMockEditorService('doc-2', doc2);

            aiContextService.registerEditor('doc-1', editor1);
            aiContextService.registerEditor('doc-2', editor2);

            const context1 = await aiContextService.getContext('doc-1');
            const context2 = await aiContextService.getContext('doc-2');

            expect(context1?.document.title).toBe('Document 1');
            expect(context2?.document.title).toBe('Document 2');

            editor1.destroy();
            editor2.destroy();
        });
    });

    describe('选区变化时上下文更新', () => {
        it('应该能够获取选区变化后的上下文', async () => {
            const testDoc = createTestDocument();
            const { service: editorService, triggerSelectionChange } =
                createEnhancedMockEditorService('doc-123', testDoc);

            aiContextService.registerEditor('doc-123', editorService);

            // 初始没有选区
            let context = await aiContextService.getContext('doc-123');
            expect(context?.selection).toBeNull();

            // 模拟选区变化
            const newSelection: Selection = {
                anchor: { blockId: 'block-1', offset: 0 },
                head: { blockId: 'block-1', offset: 5 },
                text: 'Hello',
            };
            triggerSelectionChange(newSelection);

            // 获取更新后的上下文
            context = await aiContextService.getContext('doc-123');

            expect(context?.selection).toBeDefined();
            expect(context?.selection?.text).toBe('Hello');
            expect(context?.selection?.length).toBe(5);
        });

        it('应该能够处理选区消失的情况', async () => {
            const testDoc = createTestDocument();
            const { service: editorService, triggerSelectionChange } =
                createEnhancedMockEditorService('doc-123', testDoc);

            aiContextService.registerEditor('doc-123', editorService);

            // 先设置选区
            triggerSelectionChange({
                anchor: { blockId: 'block-1', offset: 0 },
                head: { blockId: 'block-1', offset: 5 },
                text: 'Hello',
            });

            let context = await aiContextService.getContext('doc-123');
            expect(context?.selection).toBeDefined();

            // 取消选区
            triggerSelectionChange(null);

            context = await aiContextService.getContext('doc-123');
            expect(context?.selection).toBeNull();
        });

        it('选区变化后应该通知订阅者', async () => {
            const testDoc = createTestDocument();
            const { service: editorService, triggerSelectionChange } =
                createEnhancedMockEditorService('doc-123', testDoc);

            aiContextService.registerEditor('doc-123', editorService);

            const receivedContexts: AIContext[] = [];
            aiContextService.subscribe('doc-123', {
                id: 'test-sub',
                onContextChange: ctx => {
                    receivedContexts.push(ctx);
                },
            });

            // 触发选区变化并通知
            triggerSelectionChange({
                anchor: { blockId: 'block-1', offset: 0 },
                head: { blockId: 'block-1', offset: 10 },
                text: 'Test Text',
            });

            // 手动触发上下文变化通知
            aiContextService.notifyContextChange('doc-123');

            // 等待异步操作完成
            await new Promise(resolve => setTimeout(resolve, 10));

            expect(receivedContexts.length).toBeGreaterThan(0);
            expect(receivedContexts[receivedContexts.length - 1]?.selection?.text).toBe(
                'Test Text',
            );
        });
    });

    describe('订阅者正确接收通知', () => {
        it('应该能够注册订阅者', () => {
            const testDoc = createTestDocument();
            const { service: editorService } = createEnhancedMockEditorService('doc-123', testDoc);

            aiContextService.registerEditor('doc-123', editorService);

            expect(() => {
                aiContextService.subscribe('doc-123', {
                    id: 'sub-1',
                    onContextChange: vi.fn(),
                });
            }).not.toThrow();
        });

        it('应该能够取消订阅者', () => {
            const testDoc = createTestDocument();
            const { service: editorService } = createEnhancedMockEditorService('doc-123', testDoc);

            aiContextService.registerEditor('doc-123', editorService);
            aiContextService.subscribe('doc-123', {
                id: 'sub-1',
                onContextChange: vi.fn(),
            });

            expect(() => {
                aiContextService.unsubscribe('doc-123', 'sub-1');
            }).not.toThrow();
        });

        it('应该通知所有订阅者', async () => {
            const testDoc = createTestDocument();
            const { service: editorService } = createEnhancedMockEditorService('doc-123', testDoc);

            aiContextService.registerEditor('doc-123', editorService);

            const callbacks1 = vi.fn();
            const callbacks2 = vi.fn();
            const callbacks3 = vi.fn();

            aiContextService.subscribe('doc-123', { id: 'sub-1', onContextChange: callbacks1 });
            aiContextService.subscribe('doc-123', { id: 'sub-2', onContextChange: callbacks2 });
            aiContextService.subscribe('doc-123', { id: 'sub-3', onContextChange: callbacks3 });

            aiContextService.notifyContextChange('doc-123');

            // 等待异步操作完成
            await new Promise(resolve => setTimeout(resolve, 10));

            expect(callbacks1).toHaveBeenCalled();
            expect(callbacks2).toHaveBeenCalled();
            expect(callbacks3).toHaveBeenCalled();
        });

        it('应该只通知指定文档的订阅者', async () => {
            const doc1 = createTestDocument({ id: 'doc-1' });
            const doc2 = createTestDocument({ id: 'doc-2' });

            const { service: editor1 } = createEnhancedMockEditorService('doc-1', doc1);
            const { service: editor2 } = createEnhancedMockEditorService('doc-2', doc2);

            aiContextService.registerEditor('doc-1', editor1);
            aiContextService.registerEditor('doc-2', editor2);

            const callbacks1 = vi.fn();
            const callbacks2 = vi.fn();

            aiContextService.subscribe('doc-1', { id: 'sub-1', onContextChange: callbacks1 });
            aiContextService.subscribe('doc-2', { id: 'sub-2', onContextChange: callbacks2 });

            // 只通知 doc-1
            aiContextService.notifyContextChange('doc-1');

            // 等待异步操作完成
            await new Promise(resolve => setTimeout(resolve, 10));

            expect(callbacks1).toHaveBeenCalled();
            expect(callbacks2).not.toHaveBeenCalled();
        });

        it('订阅者回调异常不应该影响其他订阅者', async () => {
            const testDoc = createTestDocument();
            const { service: editorService } = createEnhancedMockEditorService('doc-123', testDoc);

            aiContextService.registerEditor('doc-123', editorService);

            const callbacks1 = vi.fn(() => {
                throw new Error('Test error');
            });
            const callbacks2 = vi.fn();

            aiContextService.subscribe('doc-123', { id: 'sub-1', onContextChange: callbacks1 });
            aiContextService.subscribe('doc-123', { id: 'sub-2', onContextChange: callbacks2 });

            aiContextService.notifyContextChange('doc-123');

            // 等待异步操作完成
            await new Promise(resolve => setTimeout(resolve, 10));

            // 两个回调都应该被调用
            expect(callbacks1).toHaveBeenCalled();
            expect(callbacks2).toHaveBeenCalled();
        });

        it('取消订阅后不应该接收通知', async () => {
            const testDoc = createTestDocument();
            const { service: editorService } = createEnhancedMockEditorService('doc-123', testDoc);

            aiContextService.registerEditor('doc-123', editorService);

            const callbacks = vi.fn();
            aiContextService.subscribe('doc-123', { id: 'sub-1', onContextChange: callbacks });

            // 取消订阅
            aiContextService.unsubscribe('doc-123', 'sub-1');

            // 通知
            aiContextService.notifyContextChange('doc-123');

            // 等待异步操作完成
            await new Promise(resolve => setTimeout(resolve, 10));

            expect(callbacks).not.toHaveBeenCalled();
        });

        it('应该能够多次接收通知', async () => {
            const testDoc = createTestDocument();
            const { service: editorService } = createEnhancedMockEditorService('doc-123', testDoc);

            aiContextService.registerEditor('doc-123', editorService);

            const receivedContexts: AIContext[] = [];
            aiContextService.subscribe('doc-123', {
                id: 'sub-1',
                onContextChange: ctx => {
                    receivedContexts.push(ctx);
                },
            });

            // 多次通知
            aiContextService.notifyContextChange('doc-123');
            aiContextService.notifyContextChange('doc-123');
            aiContextService.notifyContextChange('doc-123');

            // 等待异步操作完成
            await new Promise(resolve => setTimeout(resolve, 50));

            expect(receivedContexts.length).toBe(3);
        });
    });

    describe('集成场景测试', () => {
        it('完整的订阅 -> 编辑 -> 通知流程', async () => {
            // 创建编辑器
            const testDoc = createTestDocument({ title: 'Workflow Test' });
            const { service: editorService, triggerSelectionChange } =
                createEnhancedMockEditorService('doc-123', testDoc);

            // 注册到 AI 上下文服务
            aiContextService.registerEditor('doc-123', editorService);

            // 订阅上下文变化
            const receivedContexts: AIContext[] = [];
            aiContextService.subscribe('doc-123', {
                id: 'workflow-sub',
                onContextChange: ctx => {
                    receivedContexts.push(ctx);
                },
            });

            // 模拟用户编辑：选择文本
            triggerSelectionChange({
                anchor: { blockId: 'block-1', offset: 0 },
                head: { blockId: 'block-1', offset: 5 },
                text: 'Hello',
            });

            // 通知上下文变化
            aiContextService.notifyContextChange('doc-123');

            // 等待异步操作完成
            await new Promise(resolve => setTimeout(resolve, 10));

            // 验证
            expect(receivedContexts.length).toBe(1);
            expect(receivedContexts[0]?.selection?.text).toBe('Hello');
            expect(receivedContexts[0]?.document.title).toBe('Workflow Test');
        });

        it('多文档订阅场景', async () => {
            const doc1 = createTestDocument({ id: 'doc-1', title: 'Document 1' });
            const doc2 = createTestDocument({ id: 'doc-2', title: 'Document 2' });
            const doc3 = createTestDocument({ id: 'doc-3', title: 'Document 3' });

            const { service: editor1 } = createEnhancedMockEditorService('doc-1', doc1);
            const { service: editor2 } = createEnhancedMockEditorService('doc-2', doc2);
            const { service: editor3 } = createEnhancedMockEditorService('doc-3', doc3);

            aiContextService.registerEditor('doc-1', editor1);
            aiContextService.registerEditor('doc-2', editor2);
            aiContextService.registerEditor('doc-3', editor3);

            const received1: AIContext[] = [];
            const received2: AIContext[] = [];
            const received3: AIContext[] = [];

            aiContextService.subscribe('doc-1', {
                id: 'sub-1',
                onContextChange: ctx => received1.push(ctx),
            });
            aiContextService.subscribe('doc-2', {
                id: 'sub-2',
                onContextChange: ctx => received2.push(ctx),
            });
            aiContextService.subscribe('doc-3', {
                id: 'sub-3',
                onContextChange: ctx => received3.push(ctx),
            });

            // 只通知 doc-1 和 doc-3
            aiContextService.notifyContextChange('doc-1');
            aiContextService.notifyContextChange('doc-3');

            // 等待异步操作完成
            await new Promise(resolve => setTimeout(resolve, 10));

            expect(received1.length).toBe(1);
            expect(received2.length).toBe(0);
            expect(received3.length).toBe(1);

            expect(received1[0]?.document.title).toBe('Document 1');
            expect(received3[0]?.document.title).toBe('Document 3');
        });
    });
});
