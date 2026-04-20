/**
 * AIContextService 单元测试
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EditorService } from '../../../editor/service';
import type { Document, FormatState, Selection } from '../../../editor/types';
import type { AIContext } from '../AIContextService';
import {
    type AIContextService,
    type AIContextSubscriber,
    createAIContextService,
} from '../AIContextService';

/**
 * 创建模拟的 EditorService
 */
function createMockEditorService(
    document?: Document,
    selection?: Selection | null,
    fullContent?: string,
    formatState?: FormatState,
): EditorService {
    return {
        documentId: document?.id || 'test-doc-id',
        filePath: '/test/document',
        isDisposed: false,
        onChange: vi.fn(() => ({ dispose: vi.fn() })),
        setEditor: vi.fn(),
        getEditor: vi.fn(() => null),
        loadDocument: vi.fn(),
        saveDocument: vi.fn().mockResolvedValue({ success: true }),
        getSelection: vi.fn().mockReturnValue(selection ?? null),
        getSelectedText: vi.fn().mockReturnValue(selection?.text ?? null),
        getFullContent: vi.fn().mockReturnValue(fullContent ?? ''),
        getFormatState: vi.fn().mockReturnValue(
            formatState ?? {
                bold: false,
                italic: false,
                underline: false,
                code: false,
                strikethrough: false,
                subscript: false,
                superscript: false,
                highlight: false,
            },
        ),
        getState: vi.fn(() => ({
            isDirty: false,
            isSaving: false,
            hasError: false,
            isReadonly: false,
            error: null,
        })),
        destroy: vi.fn(),
    } as unknown as EditorService;
}

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

describe('AIContextService', () => {
    let service: AIContextService;

    beforeEach(() => {
        service = createAIContextService();
    });

    afterEach(() => {
        service.dispose();
    });

    describe('createAIContextService', () => {
        it('应该创建服务实例', () => {
            expect(service).toBeDefined();
        });

        it('应该返回实现所有方法的对象', () => {
            expect(typeof service.getContext).toBe('function');
            expect(typeof service.subscribe).toBe('function');
            expect(typeof service.unsubscribe).toBe('function');
            expect(typeof service.notifyContextChange).toBe('function');
            expect(typeof service.registerEditor).toBe('function');
            expect(typeof service.dispose).toBe('function');
        });
    });

    describe('registerEditor', () => {
        it('应该成功注册编辑器服务', () => {
            const editorService = createMockEditorService();
            expect(() => {
                service.registerEditor('doc-1', editorService);
            }).not.toThrow();
        });

        it('应该可以注册多个编辑器', () => {
            const editor1 = createMockEditorService(createTestDocument({ id: 'doc-1' }));
            const editor2 = createMockEditorService(createTestDocument({ id: 'doc-2' }));

            service.registerEditor('doc-1', editor1);
            service.registerEditor('doc-2', editor2);

            // 不应该抛出异常
            expect(() => service.registerEditor('doc-1', editor1)).not.toThrow();
        });

        it('在销毁后注册应该抛出异常', () => {
            const editorService = createMockEditorService();
            service.dispose();

            expect(() => {
                service.registerEditor('doc-1', editorService);
            }).toThrow('AIContextService has been destroyed');
        });
    });

    describe('getContext', () => {
        it('应该返回 null 当编辑器未注册时', async () => {
            const result = await service.getContext('non-existent-doc');
            expect(result).toBeNull();
        });

        it('应该返回 null 当文档未加载时', async () => {
            const editorService = createMockEditorService(undefined, null, '', undefined);
            service.registerEditor('doc-1', editorService);

            const result = await service.getContext('doc-1');
            expect(result).toBeNull();
        });

        it('应该返回完整的上下文当编辑器已注册且有文档时', async () => {
            const testDoc = createTestDocument();
            const editorService = createMockEditorService(testDoc);
            service.registerEditor('doc-1', editorService);

            const result = await service.getContext('doc-1');

            expect(result).toBeDefined();
            expect(result?.document).toEqual({
                id: testDoc.id,
                path: testDoc.path,
                title: testDoc.title,
                type: testDoc.type,
            });
        });

        it('应该包含选区信息当有选区时', async () => {
            const testDoc = createTestDocument();
            const testSelection: Selection = {
                anchor: { blockId: 'block-1', offset: 0 },
                head: { blockId: 'block-1', offset: 10 },
                text: 'Hello Text',
            };
            const editorService = createMockEditorService(testDoc, testSelection, 'Hello Text');
            service.registerEditor('doc-1', editorService);

            const result = await service.getContext('doc-1');

            expect(result?.selection).toBeDefined();
            expect(result?.selection?.text).toBe('Hello Text');
            expect(result?.selection?.length).toBe(10);
        });

        it('应该返回 null 选区当没有选区时', async () => {
            const testDoc = createTestDocument();
            const editorService = createMockEditorService(testDoc, null, 'Full content');
            service.registerEditor('doc-1', editorService);

            const result = await service.getContext('doc-1');

            expect(result?.selection).toBeNull();
        });

        it('应该包含完整内容', async () => {
            const testDoc = createTestDocument();
            const editorService = createMockEditorService(testDoc, null, 'Full document content');
            service.registerEditor('doc-1', editorService);

            const result = await service.getContext('doc-1');

            expect(result?.fullContent).toBe('Full document content');
        });

        it('应该包含格式状态', async () => {
            const testDoc = createTestDocument();
            const testFormatState: FormatState = {
                bold: true,
                italic: false,
                underline: true,
                code: false,
                strikethrough: false,
                subscript: false,
                superscript: false,
                highlight: false,
            };
            const editorService = createMockEditorService(testDoc, null, '', testFormatState);
            service.registerEditor('doc-1', editorService);

            const result = await service.getContext('doc-1');

            expect(result?.formatState).toEqual(testFormatState);
        });

        it('在销毁后调用应该抛出异常', async () => {
            const editorService = createMockEditorService();
            service.registerEditor('doc-1', editorService);
            service.dispose();

            await expect(service.getContext('doc-1')).rejects.toThrow(
                'AIContextService has been destroyed',
            );
        });
    });

    describe('subscribe/unsubscribe', () => {
        it('应该成功订阅', () => {
            const subscriber: AIContextSubscriber = {
                id: 'sub-1',
                onContextChange: vi.fn(),
            };

            expect(() => {
                service.subscribe('doc-1', subscriber);
            }).not.toThrow();
        });

        it('应该可以订阅多个订阅者', () => {
            const subscriber1: AIContextSubscriber = {
                id: 'sub-1',
                onContextChange: vi.fn(),
            };
            const subscriber2: AIContextSubscriber = {
                id: 'sub-2',
                onContextChange: vi.fn(),
            };

            service.subscribe('doc-1', subscriber1);
            service.subscribe('doc-1', subscriber2);

            // 不应该抛出异常
            expect(() => {
                service.subscribe('doc-1', subscriber1);
            }).not.toThrow();
        });

        it('应该成功取消订阅', () => {
            const subscriber: AIContextSubscriber = {
                id: 'sub-1',
                onContextChange: vi.fn(),
            };

            service.subscribe('doc-1', subscriber);
            expect(() => {
                service.unsubscribe('doc-1', 'sub-1');
            }).not.toThrow();
        });

        it('取消订阅不存在的订阅者不应该抛出异常', () => {
            expect(() => {
                service.unsubscribe('doc-1', 'non-existent-sub');
            }).not.toThrow();
        });

        it('在销毁后订阅应该抛出异常', () => {
            const subscriber: AIContextSubscriber = {
                id: 'sub-1',
                onContextChange: vi.fn(),
            };

            service.dispose();

            expect(() => {
                service.subscribe('doc-1', subscriber);
            }).toThrow('AIContextService has been destroyed');
        });

        it('在销毁后取消订阅不应该抛出异常', () => {
            service.dispose();

            expect(() => {
                service.unsubscribe('doc-1', 'sub-1');
            }).not.toThrow();
        });
    });

    describe('notifyContextChange', () => {
        it('应该调用订阅者的回调函数', async () => {
            const testDoc = createTestDocument();
            const editorService = createMockEditorService(testDoc);
            service.registerEditor('doc-1', editorService);

            const onContextChange = vi.fn();
            const subscriber: AIContextSubscriber = {
                id: 'sub-1',
                onContextChange,
            };

            service.subscribe('doc-1', subscriber);
            service.notifyContextChange('doc-1');

            // 等待异步操作完成
            await new Promise(resolve => setTimeout(resolve, 10));

            expect(onContextChange).toHaveBeenCalled();
            expect(onContextChange).toHaveBeenCalledWith(
                expect.objectContaining({
                    document: expect.objectContaining({
                        id: testDoc.id,
                    }),
                }),
            );
        });

        it('应该通知所有订阅者', async () => {
            const testDoc = createTestDocument();
            const editorService = createMockEditorService(testDoc);
            service.registerEditor('doc-1', editorService);

            const onContextChange1 = vi.fn();
            const onContextChange2 = vi.fn();

            service.subscribe('doc-1', { id: 'sub-1', onContextChange: onContextChange1 });
            service.subscribe('doc-1', { id: 'sub-2', onContextChange: onContextChange2 });

            service.notifyContextChange('doc-1');

            // 等待异步操作完成
            await new Promise(resolve => setTimeout(resolve, 10));

            expect(onContextChange1).toHaveBeenCalled();
            expect(onContextChange2).toHaveBeenCalled();
        });

        it('应该只通知指定文档的订阅者', async () => {
            const editor1 = createMockEditorService(createTestDocument({ id: 'doc-1' }));
            const editor2 = createMockEditorService(createTestDocument({ id: 'doc-2' }));
            service.registerEditor('doc-1', editor1);
            service.registerEditor('doc-2', editor2);

            const onContextChange1 = vi.fn();
            const onContextChange2 = vi.fn();

            service.subscribe('doc-1', { id: 'sub-1', onContextChange: onContextChange1 });
            service.subscribe('doc-2', { id: 'sub-2', onContextChange: onContextChange2 });

            service.notifyContextChange('doc-1');

            // 等待异步操作完成
            await new Promise(resolve => setTimeout(resolve, 10));

            expect(onContextChange1).toHaveBeenCalled();
            expect(onContextChange2).not.toHaveBeenCalled();
        });

        it('当没有订阅者时不应该抛出异常', () => {
            expect(() => {
                service.notifyContextChange('doc-1');
            }).not.toThrow();
        });

        it('在销毁后不应该调用订阅者', async () => {
            const testDoc = createTestDocument();
            const editorService = createMockEditorService(testDoc);
            service.registerEditor('doc-1', editorService);

            const onContextChange = vi.fn();
            service.subscribe('doc-1', { id: 'sub-1', onContextChange });

            service.dispose();
            service.notifyContextChange('doc-1');

            // 等待异步操作完成
            await new Promise(resolve => setTimeout(resolve, 10));

            expect(onContextChange).not.toHaveBeenCalled();
        });

        it('订阅者回调抛出异常不应该影响其他订阅者', async () => {
            const testDoc = createTestDocument();
            const editorService = createMockEditorService(testDoc);
            service.registerEditor('doc-1', editorService);

            const onContextChange1 = vi.fn(() => {
                throw new Error('Test error');
            });
            const onContextChange2 = vi.fn();

            service.subscribe('doc-1', { id: 'sub-1', onContextChange: onContextChange1 });
            service.subscribe('doc-1', { id: 'sub-2', onContextChange: onContextChange2 });

            service.notifyContextChange('doc-1');

            // 等待异步操作完成
            await new Promise(resolve => setTimeout(resolve, 10));

            expect(onContextChange1).toHaveBeenCalled();
            expect(onContextChange2).toHaveBeenCalled();
        });
    });

    describe('内存泄漏防护', () => {
        it('destroy 后应该清理所有订阅者', () => {
            const subscriber: AIContextSubscriber = {
                id: 'sub-1',
                onContextChange: vi.fn(),
            };

            service.subscribe('doc-1', subscriber);
            service.dispose();

            // 销毁后，内部订阅者 Map 应该被清空
            // 这里通过验证是否可以重新订阅来间接测试
            expect(() => {
                service.subscribe('doc-1', subscriber);
            }).toThrow();
        });

        it('取消订阅后应该减少订阅者数量', async () => {
            const testDoc = createTestDocument();
            const editorService = createMockEditorService(testDoc);
            service.registerEditor('doc-1', editorService);

            const onContextChange = vi.fn();
            const subscriber: AIContextSubscriber = {
                id: 'sub-1',
                onContextChange,
            };

            service.subscribe('doc-1', subscriber);
            service.unsubscribe('doc-1', 'sub-1');

            service.notifyContextChange('doc-1');

            // 等待异步操作完成
            await new Promise(resolve => setTimeout(resolve, 10));

            expect(onContextChange).not.toHaveBeenCalled();
        });
    });

    describe('集成场景', () => {
        it('完整的订阅流程应该正常工作', async () => {
            // 创建服务
            const service = createAIContextService();

            // 创建并注册编辑器
            const testDoc = createTestDocument({ title: 'Integration Test' });
            const testSelection: Selection = {
                anchor: { blockId: 'block-1', offset: 0 },
                head: { blockId: 'block-1', offset: 5 },
                text: 'Hello',
            };
            const editorService = createMockEditorService(testDoc, testSelection, 'Hello World');
            service.registerEditor('doc-1', editorService);

            // 订阅
            const receivedContexts: AIContext[] = [];
            const subscriber: AIContextSubscriber = {
                id: 'test-sub',
                onContextChange: context => {
                    receivedContexts.push(context);
                },
            };
            service.subscribe('doc-1', subscriber);

            // 触发通知
            service.notifyContextChange('doc-1');

            // 等待异步操作完成
            await new Promise(resolve => setTimeout(resolve, 10));

            // 验证
            expect(receivedContexts.length).toBe(1);
            expect(receivedContexts[0].document.title).toBe('Integration Test');
            expect(receivedContexts[0].selection?.text).toBe('Hello');

            // 清理
            service.dispose();
        });

        it('多文档场景应该正常工作', async () => {
            const service = createAIContextService();

            // 注册两个文档
            const doc1 = createTestDocument({ id: 'doc-1', title: 'Document 1' });
            const doc2 = createTestDocument({ id: 'doc-2', title: 'Document 2' });
            const editor1 = createMockEditorService(doc1);
            const editor2 = createMockEditorService(doc2);

            service.registerEditor('doc-1', editor1);
            service.registerEditor('doc-2', editor2);

            // 分别订阅
            const receivedContexts1: AIContext[] = [];
            const receivedContexts2: AIContext[] = [];

            service.subscribe('doc-1', {
                id: 'sub-1',
                onContextChange: ctx => receivedContexts1.push(ctx),
            });
            service.subscribe('doc-2', {
                id: 'sub-2',
                onContextChange: ctx => receivedContexts2.push(ctx),
            });

            // 通知两个文档
            service.notifyContextChange('doc-1');
            service.notifyContextChange('doc-2');

            // 等待异步操作完成
            await new Promise(resolve => setTimeout(resolve, 10));

            expect(receivedContexts1.length).toBe(1);
            expect(receivedContexts1[0].document.title).toBe('Document 1');
            expect(receivedContexts2.length).toBe(1);
            expect(receivedContexts2[0].document.title).toBe('Document 2');

            service.dispose();
        });
    });
});
