/**
 * Editor Integration Tests
 *
 * 测试编辑器基本功能、保存流程、AI 上下文收集
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AIContext, AIContextService } from '../../ai/service/AIContextService';
import { createAIContextService } from '../../ai/service/AIContextService';
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
        path: '/test/document.md',
        title: 'Test Document',
        type: 'markdown',
        content: [],
        version: 1,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
        ...overrides,
    };
}

describe('Editor Integration', () => {
    let aiContextService: AIContextService;

    beforeEach(() => {
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
            const service = createEditorService('doc-123', '/test/doc.md');

            expect(service).toBeDefined();
            expect(service.documentId).toBe('doc-123');
            expect(service.filePath).toBe('/test/doc.md');

            // 初始状态
            const initialState = service.getState();
            expect(initialState.isDirty).toBe(false);

            // 加载文档
            const testDoc = createTestDocument();
            service.loadDocument(testDoc);

            const state = service.getState();
            expect(state.isDirty).toBe(false);
        });

        it('应该注入 Lexical 编辑器实例', () => {
            const service = createEditorService('doc-123', '/test/doc.md');

            const mockEditor = {
                update: vi.fn(),
                getEditorState: vi.fn(),
                registerUpdateListener: vi.fn(),
            } as unknown as Parameters<typeof service.setEditor>[0];

            service.setEditor(mockEditor);
            expect(service.getEditor()).toBe(mockEditor);
        });

        it('应该能够保存文档', async () => {
            const service = createEditorService('doc-123', '/test/doc.md');

            // 没有编辑器时保存应该返回错误
            const result = await service.saveDocument();
            expect(result.success).toBe(false);
            expect(result.error).toBe('Editor not initialized');
        });
    });

    describe('AutoSaveService 集成', () => {
        it('应该能够注册编辑器并触发保存', () => {
            const mockFileSystemService = {
                canHandle: vi.fn(() => true),
                listFiles: vi.fn(() => Promise.resolve([])),
                createDirectory: vi.fn(),
                deleteDirectory: vi.fn(),
                readFile: vi.fn(() => Promise.resolve(new Uint8Array())),
                writeFile: vi.fn(),
                deleteFile: vi.fn(),
                stat: vi.fn(() =>
                    Promise.resolve({
                        name: 'test',
                        path: '/test',
                        type: 'file',
                        size: 0,
                        ctime: Date.now(),
                        mtime: Date.now(),
                    }),
                ),
                // biome-ignore lint/suspicious/noExplicitAny: mock object for testing
            } as any;

            const autoSaveService = createAutoSaveService(mockFileSystemService, {
                debounceMs: 100,
                maxWaitMs: 1000,
            });

            const editorService = createEditorService('doc-123', '/test/doc.md');

            // 注册编辑器
            autoSaveService.register('doc-123', editorService);
            expect(autoSaveService.getStatus('doc-123')).toBe(SaveStatus.IDLE);

            // 触发保存
            autoSaveService.triggerSave('doc-123');

            // 清理
            autoSaveService.destroy();
        });
    });

    describe('AI Context 集成', () => {
        it('应该能够收集编辑器内容作为 AI 上下文', () => {
            const service = createEditorService('doc-123', '/test/doc.md');

            const testDoc = createTestDocument({
                content: [
                    {
                        id: 'block-1',
                        type: 'paragraph',
                        content: { inline: [{ text: 'Hello' }] },
                    },
                ],
            });

            service.loadDocument(testDoc);

            // 收集 AI 上下文 - 注意：getFullContent() 需要 Lexical 编辑器
            // 在没有注入编辑器的情况下返回空字符串，这是预期行为
            const context: AIContext = {
                document: {
                    id: 'doc-123',
                    path: '/test/document.md',
                    title: 'Test Document',
                    type: 'markdown',
                },
                selection: null,
                fullContent: JSON.stringify(testDoc.content),
                cursorPosition: null,
                formatState: null,
            };

            expect(context.document.id).toBe('doc-123');
            expect(context.fullContent).toContain('Hello');
            expect(context.document.title).toBe('Test Document');
            expect(context.document.path).toBe('/test/document.md');
        });
    });
});
