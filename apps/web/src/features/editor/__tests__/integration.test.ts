/**
 * Editor Integration Tests
 *
 * 测试编辑器基本功能、保存流程、AI 上下文收集
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AIContext, AIContextService } from '../../ai/service/AIContextService';
import { createAIContextService } from '../../ai/service/AIContextService';
import type { IFileSystemProvider } from '../../platform/file-system/provider';
import { BlockRegistry } from '../registry/BlockRegistry';
import { registerBuiltinBlocks } from '../registry/builtin-types';
import { createAutoSaveService, SaveStatus } from '../service/AutoSaveService';
import { createEditorService } from '../service/EditorService';
import type { Document } from '../types';

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
 * 创建模拟的 AutoSaveService (未使用，保留以备将来扩展)
 */
function _createMockAutoSaveService(): {
    service: AutoSaveService;
    mocks: Record<string, unknown>;
} {
    const mocks = {
        register: vi.fn(),
        unregister: vi.fn(),
        triggerSave: vi.fn(),
        saveNow: vi.fn().mockResolvedValue({ success: true }),
        enable: vi.fn(),
        disable: vi.fn(),
        getStatus: vi.fn().mockReturnValue(SaveStatus.IDLE),
        destroy: vi.fn(),
    };

    const service = {
        register: mocks.register,
        unregister: mocks.unregister,
        triggerSave: mocks.triggerSave,
        saveNow: mocks.saveNow,
        enable: mocks.enable,
        disable: mocks.disable,
        getStatus: mocks.getStatus,
        destroy: mocks.destroy,
    } as unknown as AutoSaveService;

    return { service, mocks };
}

describe('Editor Integration', () => {
    let blockRegistry: BlockRegistry;
    let aiContextService: AIContextService;

    beforeEach(() => {
        blockRegistry = new BlockRegistry();
        registerBuiltinBlocks();
        aiContextService = createAIContextService();
        vi.clearAllMocks();
    });

    afterEach(() => {
        aiContextService.dispose();
        vi.clearAllMocks();
    });

    describe('EditorService 基本功能', () => {
        it('应该创建编辑器实例并加载文档', () => {
            const service = createEditorService('doc-123', blockRegistry);

            expect(service).toBeDefined();
            expect(service.documentId).toBe('doc-123');
            expect(service.editor).toBeDefined();
            expect(service.store).toBeDefined();

            // 初始状态
            expect(service.store.document).toBeNull();
            expect(service.store.isDirty).toBe(false);

            // 加载文档
            const testDoc = createTestDocument();
            service.loadDocument(testDoc);

            expect(service.store.document).toEqual(testDoc);
            expect(service.store.isDirty).toBe(false);

            service.destroy();
        });

        it('应该能够执行编辑操作并标记为 dirty', () => {
            const service = createEditorService('doc-123', blockRegistry);
            const testDoc = createTestDocument();
            service.loadDocument(testDoc);

            expect(service.store.isDirty).toBe(false);

            // 执行编辑操作
            service.insertBlock({
                id: 'block-1',
                type: 'paragraph',
                content: { text: 'Hello World' },
            });

            expect(service.store.isDirty).toBe(true);

            service.destroy();
        });

        it('应该能够保存文档并标记为 clean', async () => {
            const service = createEditorService('doc-123', blockRegistry);
            const testDoc = createTestDocument();
            service.loadDocument(testDoc);

            // 先进行编辑
            service.insertBlock({
                id: 'block-1',
                type: 'paragraph',
                content: { text: 'Hello World' },
            });

            expect(service.store.isDirty).toBe(true);

            // 保存文档
            const result = await service.saveDocument();

            expect(result.success).toBe(true);
            expect(result.document).toBeDefined();
            expect(result.document?.version).toBe(2); // 版本号应该增加
            expect(service.store.isDirty).toBe(false);

            service.destroy();
        });
    });

    describe('保存流程测试', () => {
        it('应该能够触发自动保存', async () => {
            vi.useFakeTimers();

            const service = createEditorService('doc-123', blockRegistry);
            const testDoc = createTestDocument();
            service.loadDocument(testDoc);

            // 创建自动保存服务
            const autoSaveService = createAutoSaveService(
                {
                    name: 'mock-fs',
                    scheme: 'mock',
                    rootPath: '/mock',
                    capabilities: 0,
                    canHandle: () => true,
                    openDirectory: vi.fn(),
                    listFiles: vi.fn().mockResolvedValue([]),
                    createDirectory: vi.fn(),
                    deleteDirectory: vi.fn(),
                    readFile: vi.fn(),
                    writeFile: vi.fn(),
                    deleteFile: vi.fn(),
                    getFileHandle: vi.fn(),
                    stat: vi.fn(),
                } as unknown as IFileSystemProvider,
                {
                    debounceMs: 100,
                    maxWaitMs: 1000,
                },
            );

            autoSaveService.register('doc-123', service);

            // 触发保存
            autoSaveService.triggerSave('doc-123');

            // 等待防抖时间
            await vi.advanceTimersByTimeAsync(100);

            // 保存后应该变为 clean
            expect(service.store.isDirty).toBe(false);

            autoSaveService.destroy();
            service.destroy();

            vi.useRealTimers();
        });

        it('应该正确处理保存失败的情况', async () => {
            const service = createEditorService('doc-123', blockRegistry);

            // 未加载文档时保存应该失败
            const result = await service.saveDocument();

            expect(result.success).toBe(false);
            expect(result.error).toBe('No document loaded');

            service.destroy();
        });

        it('保存后文档版本号应该增加', async () => {
            const service = createEditorService('doc-123', blockRegistry);
            const testDoc = createTestDocument({ version: 1 });
            service.loadDocument(testDoc);

            // 第一次保存
            const result1 = await service.saveDocument();
            expect(result1.document?.version).toBe(2);

            // 第二次保存
            const result2 = await service.saveDocument();
            expect(result2.document?.version).toBe(3);

            service.destroy();
        });
    });

    describe('AI 上下文收集', () => {
        it('应该能够收集文档信息', async () => {
            const editorService = createEditorService('doc-123', blockRegistry);
            const testDoc = createTestDocument({ id: 'doc-123', title: 'AI Test Document' });
            editorService.loadDocument(testDoc);

            // 注册到 AI 上下文服务
            aiContextService.registerEditor('doc-123', editorService);

            // 获取上下文
            const context = await aiContextService.getContext('doc-123');

            expect(context).toBeDefined();
            expect(context?.document).toBeDefined();
            expect(context?.document.id).toBe('doc-123');
            expect(context?.document.title).toBe('AI Test Document');
            expect(context?.document.path).toBe('/test/document');

            editorService.destroy();
        });

        it('应该能够收集选区信息', async () => {
            const editorService = createEditorService('doc-123', blockRegistry);
            const testDoc = createTestDocument();
            editorService.loadDocument(testDoc);

            aiContextService.registerEditor('doc-123', editorService);

            // 获取上下文（当前没有选区）
            const context = await aiContextService.getContext('doc-123');

            expect(context?.selection).toBeNull();

            editorService.destroy();
        });

        it('应该能够收集完整内容', async () => {
            const editorService = createEditorService('doc-123', blockRegistry);
            const testDoc = createTestDocument();
            editorService.loadDocument(testDoc);

            aiContextService.registerEditor('doc-123', editorService);

            const context = await aiContextService.getContext('doc-123');

            expect(context?.fullContent).toBeDefined();
            // 空文档时，$fullContent 可能返回 null 或 ''，取决于实现
            expect(context?.fullContent ?? '').toBe('');

            editorService.destroy();
        });

        it('应该能够收集格式状态', async () => {
            const editorService = createEditorService('doc-123', blockRegistry);
            const testDoc = createTestDocument();
            editorService.loadDocument(testDoc);

            aiContextService.registerEditor('doc-123', editorService);

            const context = await aiContextService.getContext('doc-123');

            expect(context?.formatState).toBeDefined();
            expect(context?.formatState?.bold).toBe(false);
            expect(context?.formatState?.italic).toBe(false);

            editorService.destroy();
        });

        it('未注册的编辑器应该返回 null', async () => {
            const context = await aiContextService.getContext('non-existent-doc');

            expect(context).toBeNull();
        });

        it('应该能够通知订阅者上下文变化', async () => {
            const editorService = createEditorService('doc-123', blockRegistry);
            const testDoc = createTestDocument({ id: 'doc-123' });
            editorService.loadDocument(testDoc);

            aiContextService.registerEditor('doc-123', editorService);

            const receivedContexts: AIContext[] = [];
            aiContextService.subscribe('doc-123', {
                id: 'test-subscriber',
                onContextChange: context => {
                    receivedContexts.push(context);
                },
            });

            // 触发通知
            aiContextService.notifyContextChange('doc-123');

            // 等待异步操作完成
            await new Promise(resolve => setTimeout(resolve, 10));

            expect(receivedContexts.length).toBe(1);
            expect(receivedContexts[0]?.document.id).toBe('doc-123');

            editorService.destroy();
        });
    });

    describe('集成场景：完整的编辑到保存流程', () => {
        it('应该能够完成创建 -> 编辑 -> 保存的完整流程', async () => {
            // 创建编辑器服务
            const editorService = createEditorService('doc-123', blockRegistry);

            // 加载文档
            const testDoc = createTestDocument({ id: 'doc-123' });
            editorService.loadDocument(testDoc);

            // 注册到 AI 上下文服务
            aiContextService.registerEditor('doc-123', editorService);

            // 执行编辑操作
            editorService.insertBlock({
                id: 'block-1',
                type: 'paragraph',
                content: { text: 'First paragraph' },
            });

            editorService.insertBlock({
                id: 'block-2',
                type: 'paragraph',
                content: { text: 'Second paragraph' },
            });

            // 验证文档已标记为 dirty
            expect(editorService.store.isDirty).toBe(true);

            // 验证 AI 上下文包含最新文档信息
            const contextBeforeSave = await aiContextService.getContext('doc-123');
            expect(contextBeforeSave?.document).toBeDefined();
            expect(contextBeforeSave?.document.id).toBe('doc-123');

            // 保存文档
            const saveResult = await editorService.saveDocument();

            // 验证保存成功
            expect(saveResult.success).toBe(true);
            expect(saveResult.document).toBeDefined();
            expect(saveResult.document?.version).toBe(2);

            // 验证文档已标记为 clean
            expect(editorService.store.isDirty).toBe(false);

            // 验证 AI 上下文已更新
            const contextAfterSave = await aiContextService.getContext('doc-123');
            expect(contextAfterSave?.document.id).toBe('doc-123');

            editorService.destroy();
        });
    });

    describe('多编辑器集成', () => {
        it('应该能够管理多个独立的编辑器实例', async () => {
            // 创建两个编辑器服务
            const editorService1 = createEditorService('doc-1', blockRegistry);
            const editorService2 = createEditorService('doc-2', blockRegistry);

            // 加载不同的文档
            const doc1 = createTestDocument({ id: 'doc-1', title: 'Document 1' });
            const doc2 = createTestDocument({ id: 'doc-2', title: 'Document 2' });

            editorService1.loadDocument(doc1);
            editorService2.loadDocument(doc2);

            // 注册到 AI 上下文服务
            aiContextService.registerEditor('doc-1', editorService1);
            aiContextService.registerEditor('doc-2', editorService2);

            // 分别编辑
            editorService1.insertBlock({
                id: 'block-1',
                type: 'paragraph',
                content: { text: 'Doc 1 content' },
            });

            editorService2.insertBlock({
                id: 'block-2',
                type: 'paragraph',
                content: { text: 'Doc 2 content' },
            });

            // 验证两个编辑器状态独立
            expect(editorService1.store.isDirty).toBe(true);
            expect(editorService2.store.isDirty).toBe(true);

            // 只保存第一个文档
            const result1 = await editorService1.saveDocument();
            expect(result1.success).toBe(true);
            expect(editorService1.store.isDirty).toBe(false);
            expect(editorService2.store.isDirty).toBe(true); // 第二个仍然 dirty

            // 验证 AI 上下文独立
            const context1 = await aiContextService.getContext('doc-1');
            const context2 = await aiContextService.getContext('doc-2');

            expect(context1?.document.title).toBe('Document 1');
            expect(context2?.document.title).toBe('Document 2');

            editorService1.destroy();
            editorService2.destroy();
        });
    });
});
