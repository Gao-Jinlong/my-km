/**
 * AutoSaveService Tests
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IFileSystemProvider } from '../../../../platform/file-system/provider';
import type { Document } from '../../types';
import { createAutoSaveService, SaveStatus } from '../AutoSaveService';
import type { EditorService, SaveResult } from '../EditorService';

/**
 * 创建模拟的 EditorService
 */
function createMockEditorService(
    documentId: string,
    initialDoc?: Partial<Document>,
): { service: EditorService; mocks: Record<string, unknown> } {
    const mockDoc: Document = {
        id: documentId,
        path: `/test/${documentId}.md`,
        title: 'Test Document',
        type: 'rich-text',
        content: [],
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ...initialDoc,
    } as Document;

    let isDirty = false;

    const mocks = {
        saveDocument: vi.fn<() => Promise<SaveResult>>(),
        insertBlock: vi.fn(),
        updateBlock: vi.fn(),
        deleteBlock: vi.fn(),
    };

    mocks.saveDocument.mockImplementation(async () => {
        if (!mockDoc) {
            return { success: false, error: 'No document loaded' };
        }
        mockDoc.version += 1;
        mockDoc.updatedAt = new Date().toISOString();
        isDirty = false;
        return { success: true, document: mockDoc };
    });

    mocks.insertBlock.mockImplementation(() => {
        isDirty = true;
    });

    mocks.updateBlock.mockImplementation(() => {
        isDirty = true;
    });

    mocks.deleteBlock.mockImplementation(() => {
        isDirty = true;
    });

    const service: EditorService = {
        documentId,
        editor: {} as unknown as import('lexical').LexicalEditor,
        store: {
            document: mockDoc,
            isDirty,
            selection: null,
            formatState: null,
            error: null,
            markDirty: () => {
                isDirty = true;
            },
            markClean: () => {
                isDirty = false;
            },
        },
        loadDocument: vi.fn(),
        saveDocument: mocks.saveDocument,
        getSelection: vi.fn(() => null),
        getSelectedText: vi.fn(() => null),
        getFullContent: vi.fn(() => ''),
        getFormatState: vi.fn(() => ({})),
        insertBlock: mocks.insertBlock,
        updateBlock: mocks.updateBlock,
        deleteBlock: mocks.deleteBlock,
        destroy: vi.fn(),
    };

    return { service, mocks };
}

/**
 * 创建模拟的 FileSystemProvider
 */
function createMockFileSystemProvider(): IFileSystemProvider {
    return {
        name: 'mock-fs',
        scheme: 'mock',
        rootPath: '/mock',
        capabilities: 0,
        canHandle: vi.fn(() => true),
        openDirectory: vi.fn(),
        listFiles: vi.fn(() => Promise.resolve([])),
        createDirectory: vi.fn(),
        deleteDirectory: vi.fn(),
        readFile: vi.fn(() => Promise.resolve({ type: 'text', content: '' })),
        writeFile: vi.fn(),
        deleteFile: vi.fn(),
        getFileHandle: vi.fn(() => Promise.resolve({} as unknown as FileSystemFileHandle)),
        stat: vi.fn(() =>
            Promise.resolve({
                type: 'file',
                size: 0,
                createdAt: Date.now(),
                modifiedAt: Date.now(),
            }),
        ),
    };
}

describe('AutoSaveService', () => {
    let mockProvider: IFileSystemProvider;

    beforeEach(() => {
        mockProvider = createMockFileSystemProvider();
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('creation', () => {
        it('should create an AutoSaveService instance with default options', () => {
            const service = createAutoSaveService(mockProvider);

            expect(service).toBeDefined();
            expect(typeof service.register).toBe('function');
            expect(typeof service.unregister).toBe('function');
            expect(typeof service.triggerSave).toBe('function');
            expect(typeof service.saveNow).toBe('function');
            expect(typeof service.enable).toBe('function');
            expect(typeof service.disable).toBe('function');
            expect(typeof service.getStatus).toBe('function');
            expect(typeof service.destroy).toBe('function');
        });

        it('should create an AutoSaveService instance with custom options', () => {
            const onStatusChange = vi.fn();
            const onError = vi.fn();

            const service = createAutoSaveService(mockProvider, {
                debounceMs: 1000,
                maxWaitMs: 10000,
                onStatusChange,
                onError,
            });

            expect(service).toBeDefined();
        });
    });

    describe('register', () => {
        it('should register an editor', () => {
            const service = createAutoSaveService(mockProvider);
            const { service: mockEditor } = createMockEditorService('doc-123');

            service.register('doc-123', mockEditor);

            expect(service.getStatus('doc-123')).toBe(SaveStatus.IDLE);
        });

        it('should warn when registering duplicate editor', () => {
            const service = createAutoSaveService(mockProvider);
            const { service: mockEditor } = createMockEditorService('doc-123');
            const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

            service.register('doc-123', mockEditor);
            service.register('doc-123', mockEditor);

            expect(consoleWarnSpy).toHaveBeenCalledWith('Editor already registered: doc-123');
            consoleWarnSpy.mockRestore();
        });

        it('should initialize status to IDLE after registration', () => {
            const service = createAutoSaveService(mockProvider);
            const { service: mockEditor } = createMockEditorService('doc-123');

            service.register('doc-123', mockEditor);

            expect(service.getStatus('doc-123')).toBe(SaveStatus.IDLE);
        });
    });

    describe('unregister', () => {
        it('should unregister an editor', () => {
            const service = createAutoSaveService(mockProvider);
            const { service: mockEditor } = createMockEditorService('doc-123');

            service.register('doc-123', mockEditor);
            service.unregister('doc-123');

            // 取消注册后，状态应该返回 IDLE（默认值）
            expect(service.getStatus('doc-123')).toBe(SaveStatus.IDLE);
        });

        it('should handle unregistering non-existent editor gracefully', () => {
            const service = createAutoSaveService(mockProvider);

            expect(() => {
                service.unregister('non-existent');
            }).not.toThrow();
        });
    });

    describe('triggerSave (debounce)', () => {
        it('should trigger save after debounce delay', async () => {
            vi.useFakeTimers();

            const service = createAutoSaveService(mockProvider, {
                debounceMs: 100,
                maxWaitMs: 1000,
            });
            const { service: mockEditor, mocks } = createMockEditorService('doc-123');

            service.register('doc-123', mockEditor);

            // 触发保存
            service.triggerSave('doc-123');

            // 此时应该还在等待防抖
            expect(mocks.saveDocument).not.toHaveBeenCalled();

            // 快进时间到防抖时间之后
            await vi.advanceTimersByTimeAsync(100);

            // 应该调用了保存
            expect(mocks.saveDocument).toHaveBeenCalledTimes(1);

            vi.useRealTimers();
        });

        it('should debounce multiple trigger calls', async () => {
            vi.useFakeTimers();

            const service = createAutoSaveService(mockProvider, {
                debounceMs: 100,
                maxWaitMs: 1000,
            });
            const { service: mockEditor, mocks } = createMockEditorService('doc-123');

            service.register('doc-123', mockEditor);

            // 多次触发保存
            service.triggerSave('doc-123');
            service.triggerSave('doc-123');
            service.triggerSave('doc-123');

            expect(mocks.saveDocument).not.toHaveBeenCalled();

            // 快进时间到防抖时间之后
            await vi.advanceTimersByTimeAsync(100);

            // 应该只调用了一次保存
            expect(mocks.saveDocument).toHaveBeenCalledTimes(1);

            vi.useRealTimers();
        });

        it('should respect maxWait timeout', async () => {
            vi.useFakeTimers();

            const service = createAutoSaveService(mockProvider, {
                debounceMs: 1000,
                maxWaitMs: 300,
            });
            const { service: mockEditor, mocks } = createMockEditorService('doc-123');

            service.register('doc-123', mockEditor);

            // 触发保存
            service.triggerSave('doc-123');

            // 在防抖时间之前，但超过最大等待时间
            await vi.advanceTimersByTimeAsync(300);

            // 应该调用了保存（因为 maxWait）
            expect(mocks.saveDocument).toHaveBeenCalledTimes(1);

            vi.useRealTimers();
        });

        it('should not trigger save when disabled', async () => {
            const service = createAutoSaveService(mockProvider, {
                debounceMs: 10,
                maxWaitMs: 100,
            });
            const { service: mockEditor, mocks } = createMockEditorService('doc-123');

            service.register('doc-123', mockEditor);
            service.disable('doc-123');

            service.triggerSave('doc-123');

            // 等待足够时间
            await new Promise(resolve => setTimeout(resolve, 150));

            // 不应该调用保存
            expect(mocks.saveDocument).not.toHaveBeenCalled();
        });

        it('should not trigger save for unregistered editor', () => {
            const service = createAutoSaveService(mockProvider);

            expect(() => {
                service.triggerSave('non-existent');
            }).not.toThrow();
        });
    });

    describe('saveNow', () => {
        it('should save immediately without debounce', async () => {
            const service = createAutoSaveService(mockProvider);
            const { service: mockEditor, mocks } = createMockEditorService('doc-123');

            service.register('doc-123', mockEditor);

            await service.saveNow('doc-123');

            // 应该立即调用保存
            expect(mocks.saveDocument).toHaveBeenCalledTimes(1);
        });

        it('should clear pending debounce timer when calling saveNow', async () => {
            vi.useFakeTimers();

            const service = createAutoSaveService(mockProvider, {
                debounceMs: 1000,
                maxWaitMs: 5000,
            });
            const { service: mockEditor, mocks } = createMockEditorService('doc-123');

            service.register('doc-123', mockEditor);

            // 先触发防抖保存
            service.triggerSave('doc-123');

            // 立即调用 saveNow
            await service.saveNow('doc-123');

            // saveNow 应该立即调用保存（这是第 1 次）
            expect(mocks.saveDocument).toHaveBeenCalledTimes(1);

            // 快进时间，确认之前的防抖定时器被清除了
            // 如果定时器没有被清除，这里会再触发一次保存
            await vi.advanceTimersByTimeAsync(1000);

            // 应该仍然只有 1 次保存（saveNow 这次）
            expect(mocks.saveDocument).toHaveBeenCalledTimes(1);

            vi.useRealTimers();
        });

        it('should return error for unregistered editor', async () => {
            const service = createAutoSaveService(mockProvider);

            const result = await service.saveNow('non-existent');

            expect(result.success).toBe(false);
            expect(result.error).toContain('Editor not registered');
        });

        it('should handle save error', async () => {
            const onErrorSpy = vi.fn();
            const service = createAutoSaveService(mockProvider, {
                onError: onErrorSpy,
            });
            const { service: mockEditor, mocks } = createMockEditorService('doc-123');

            mocks.saveDocument.mockResolvedValue({
                success: false,
                error: 'Simulated save error',
            });

            service.register('doc-123', mockEditor);

            const result = await service.saveNow('doc-123');

            expect(result.success).toBe(false);
            expect(result.error).toBe('Simulated save error');
            expect(onErrorSpy).toHaveBeenCalled();
        });
    });

    describe('enable/disable', () => {
        it('should enable auto-save for registered editor', () => {
            const service = createAutoSaveService(mockProvider);
            const { service: mockEditor } = createMockEditorService('doc-123');

            service.register('doc-123', mockEditor);
            service.disable('doc-123');
            service.enable('doc-123');

            // 启用后应该可以触发保存
            service.triggerSave('doc-123');
            // 不抛异常即成功
        });

        it('should disable auto-save for registered editor', () => {
            const service = createAutoSaveService(mockProvider);
            const { service: mockEditor } = createMockEditorService('doc-123');

            service.register('doc-123', mockEditor);
            service.disable('doc-123');

            // 禁用后不应该触发保存
            service.triggerSave('doc-123');
            // 不抛异常即成功
        });

        it('should warn when enabling non-existent editor', () => {
            const service = createAutoSaveService(mockProvider);
            const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

            service.enable('non-existent');

            expect(consoleWarnSpy).toHaveBeenCalledWith('Editor not found: non-existent');
            consoleWarnSpy.mockRestore();
        });

        it('should warn when disabling non-existent editor', () => {
            const service = createAutoSaveService(mockProvider);
            const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

            service.disable('non-existent');

            expect(consoleWarnSpy).toHaveBeenCalledWith('Editor not found: non-existent');
            consoleWarnSpy.mockRestore();
        });
    });

    describe('getStatus', () => {
        it('should return IDLE for unregistered editor', () => {
            const service = createAutoSaveService(mockProvider);

            expect(service.getStatus('non-existent')).toBe(SaveStatus.IDLE);
        });

        it('should return current status', () => {
            const service = createAutoSaveService(mockProvider);
            const { service: mockEditor } = createMockEditorService('doc-123');

            service.register('doc-123', mockEditor);

            expect(service.getStatus('doc-123')).toBe(SaveStatus.IDLE);
        });
    });

    describe('status callbacks', () => {
        it('should call onStatusChange with correct statuses during save', async () => {
            vi.useFakeTimers();

            const statusCalls: SaveStatus[] = [];
            const onStatusChange = (status: SaveStatus) => statusCalls.push(status);

            const service = createAutoSaveService(mockProvider, {
                debounceMs: 50,
                onStatusChange,
            });
            const { service: mockEditor } = createMockEditorService('doc-123');

            service.register('doc-123', mockEditor);

            // 初始状态应该是 IDLE
            expect(statusCalls).toEqual([SaveStatus.IDLE]);

            // 触发保存
            service.triggerSave('doc-123');

            // 快进到保存执行
            await vi.advanceTimersByTimeAsync(50);
            // 等待保存完成
            await vi.advanceTimersByTimeAsync(10);

            // 应该经历过 SAVING -> SAVED -> IDLE
            expect(statusCalls).toContain(SaveStatus.SAVING);
            expect(statusCalls).toContain(SaveStatus.SAVED);

            vi.useRealTimers();
        });

        it('should call onError when save fails', async () => {
            const onErrorSpy = vi.fn();
            const service = createAutoSaveService(mockProvider, {
                onError: onErrorSpy,
            });
            const { service: mockEditor, mocks } = createMockEditorService('doc-123');

            mocks.saveDocument.mockRejectedValue(new Error('Network error'));

            service.register('doc-123', mockEditor);

            await service.saveNow('doc-123');

            expect(onErrorSpy).toHaveBeenCalled();
            expect(onErrorSpy.mock.calls[0][0].message).toBe('Network error');
            expect(onErrorSpy.mock.calls[0][1]).toBe('doc-123');
        });
    });

    describe('destroy', () => {
        it('should clean up all editors and timers', () => {
            vi.useFakeTimers();

            const service = createAutoSaveService(mockProvider);
            const { service: mockEditor1 } = createMockEditorService('doc-123');
            const { service: mockEditor2 } = createMockEditorService('doc-456');

            service.register('doc-123', mockEditor1);
            service.register('doc-456', mockEditor2);

            // 触发保存，创建定时器
            service.triggerSave('doc-123');
            service.triggerSave('doc-456');

            // 销毁服务
            service.destroy();

            // 销毁后不应该抛异常
            expect(() => {
                service.triggerSave('doc-123');
            }).not.toThrow();

            vi.useRealTimers();
        });

        it('should handle destroy gracefully when no editors registered', () => {
            const service = createAutoSaveService(mockProvider);

            expect(() => {
                service.destroy();
            }).not.toThrow();
        });
    });

    describe('multiple editors', () => {
        it('should handle multiple editors independently', async () => {
            vi.useFakeTimers();

            const service = createAutoSaveService(mockProvider, {
                debounceMs: 100,
                maxWaitMs: 500,
            });

            const { service: mockEditor1, mocks: mocks1 } = createMockEditorService('doc-123');
            const { service: mockEditor2, mocks: mocks2 } = createMockEditorService('doc-456');

            service.register('doc-123', mockEditor1);
            service.register('doc-456', mockEditor2);

            // 只触发第一个文档的保存
            service.triggerSave('doc-123');

            await vi.advanceTimersByTimeAsync(100);

            // 只有第一个文档应该被保存
            expect(mocks1.saveDocument).toHaveBeenCalledTimes(1);
            expect(mocks2.saveDocument).not.toHaveBeenCalled();

            vi.useRealTimers();
        });
    });
});
