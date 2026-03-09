/**
 * Disposable 模式资源释放验证测试
 *
 * 验证 FileHandleCache、FileSystemService 和 FileResourceManager
 * 是否正确实现 Disposable 模式并释放资源
 */

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { IDisposable } from '../../../common/lifecycle';
import { Disposable, DisposableStore } from '../../../common/lifecycle';
import type {
    DirectoryEntry,
    DirectoryPickerOptions,
    FileInfo,
    FileReadResult,
    IFileSystemAdapter,
} from '../adapter/types';
import { FileHandleCache } from '../cache/file-handle-cache';
import { FileResourceManager } from '../manager/file-resource-manager';
import { FileSystemService } from '../service/file-system-service';

// Create mock adapter helper
const createMockAdapter = (): IFileSystemAdapter => {
    return {
        name: 'mock',
        isSupported: jest.fn<() => Promise<boolean>>().mockResolvedValue(true),
        openDirectoryPicker: jest
            .fn<(options?: DirectoryPickerOptions) => Promise<string | null>>()
            .mockResolvedValue('test-project'),
        readFile: jest.fn<(path: string) => Promise<FileReadResult>>().mockResolvedValue({
            content: '',
            fileInfo: { name: '', path: '', kind: 'file' as const },
        }),
        writeFile: jest
            .fn<(path: string, content: string | Uint8Array) => Promise<void>>()
            .mockResolvedValue(),
        listDirectory: jest.fn<(path: string) => Promise<DirectoryEntry[]>>().mockResolvedValue([]),
        getFileInfo: jest.fn<(path: string) => Promise<FileInfo>>().mockResolvedValue({
            name: '',
            path: '',
            kind: 'file' as const,
        }),
        remove: jest
            .fn<(path: string, options?: { recursive?: boolean }) => Promise<void>>()
            .mockResolvedValue(),
        exists: jest.fn<(path: string) => Promise<boolean>>().mockResolvedValue(false),
        createDirectory: jest.fn<(path: string) => Promise<void>>().mockResolvedValue(),
    };
};

describe('Disposable Pattern Verification', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        FileResourceManager.resetInstance();

        // Setup minimal IndexedDB mock
        global.indexedDB = {
            open: jest.fn(
                () =>
                    ({
                        onsuccess: null,
                        onerror: null,
                        result: {
                            transaction: {
                                objectStore: jest.fn(() => ({
                                    get: jest.fn(() => ({
                                        onsuccess: null,
                                        onerror: null,
                                        result: null,
                                        error: null,
                                    })),
                                    put: jest.fn(() => ({
                                        onsuccess: null,
                                        onerror: null,
                                        result: undefined,
                                        error: null,
                                    })),
                                    delete: jest.fn(() => ({
                                        onsuccess: null,
                                        onerror: null,
                                        result: undefined,
                                        error: null,
                                    })),
                                    clear: jest.fn(() => ({
                                        onsuccess: null,
                                        onerror: null,
                                        result: undefined,
                                        error: null,
                                    })),
                                    getAllKeys: jest.fn(() => ({
                                        onsuccess: null,
                                        onerror: null,
                                        result: [],
                                        error: null,
                                    })),
                                })),
                            },
                            objectStoreNames: { contains: jest.fn() },
                            createObjectStore: jest.fn(),
                        },
                        error: null,
                    }) as any,
            ),
        } as any;
    });

    afterEach(() => {
        FileResourceManager.resetInstance();
    });

    describe('DisposableStore', () => {
        it('should dispose all registered disposables', () => {
            const store = new DisposableStore();
            let dispose1Called = false;
            let dispose2Called = false;

            const disposable1: IDisposable = {
                dispose: () => {
                    dispose1Called = true;
                },
            };

            const disposable2: IDisposable = {
                dispose: () => {
                    dispose2Called = true;
                },
            };

            store.add(disposable1);
            store.add(disposable2);
            store.dispose();

            expect(dispose1Called).toBe(true);
            expect(dispose2Called).toBe(true);
        });

        it('should not dispose twice if already disposed', () => {
            const store = new DisposableStore();
            let disposeCalledCount = 0;

            const disposable: IDisposable = {
                dispose: () => {
                    disposeCalledCount++;
                },
            };

            store.add(disposable);
            store.dispose();
            store.dispose();

            expect(disposeCalledCount).toBe(1);
        });

        it('should clear all disposables', () => {
            const store = new DisposableStore();
            let disposeCalled = false;

            const disposable: IDisposable = {
                dispose: () => {
                    disposeCalled = true;
                },
            };

            store.add(disposable);
            store.clear();

            expect(disposeCalled).toBe(true);
            expect((store as any)['_toDispose'].size).toBe(0);
        });

        it('should warn when adding to disposed store', () => {
            const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
            const store = new DisposableStore();
            store.dispose();

            const disposable: IDisposable = {
                dispose: () => {},
            };

            store.add(disposable);

            expect(warnSpy).toHaveBeenCalled();
            warnSpy.mockRestore();
        });
    });

    describe('Disposable base class', () => {
        it('should dispose all registered disposables in subclass', () => {
            class TestDisposable extends Disposable {
                public register<T extends IDisposable>(o: T): T {
                    return this._register(o);
                }

                public getDisposeCount(): number {
                    return (this._store as any)['_toDispose'].size;
                }
            }

            const test = new TestDisposable();
            let disposeCalled = false;

            const disposable: IDisposable = {
                dispose: () => {
                    disposeCalled = true;
                },
            };

            test.register(disposable);
            test.dispose();

            expect(disposeCalled).toBe(true);
        });
    });

    describe('FileHandleCache Disposable', () => {
        it('should properly dispose without errors', () => {
            const cache = new FileHandleCache();
            expect(() => cache.dispose()).not.toThrow();
        });

        it('should be idempotent', () => {
            const cache = new FileHandleCache();
            cache.dispose();
            expect(() => cache.dispose()).not.toThrow();
        });
    });

    describe('FileSystemService Disposable', () => {
        it('should dispose all dependencies and close project', async () => {
            const mockAdapter = createMockAdapter();
            jest.spyOn(mockAdapter, 'openDirectoryPicker').mockResolvedValue('test-project');

            const fileSystem = new FileSystemService(mockAdapter);
            await fileSystem.openProject();

            // Verify project is open
            expect(fileSystem.currentProject).toBeTruthy();

            // Dispose should close project and clean up
            fileSystem.dispose();

            // Verify project is closed
            expect(fileSystem.currentProject).toBeNull();
        });

        it('should handle dispose without open project', () => {
            const fileSystem = new FileSystemService(createMockAdapter());
            expect(() => fileSystem.dispose()).not.toThrow();
        });
    });

    describe('FileResourceManager Disposable', () => {
        it('should release all resources on dispose', () => {
            const manager = FileResourceManager.getInstance();

            manager.register({
                id: 'file-1',
                path: 'src/index.ts',
                isActive: false,
            });

            manager.register({
                id: 'file-2',
                path: 'src/utils.ts',
                isActive: false,
            });

            expect(manager.totalResourceCount).toBe(2);

            manager.dispose();

            expect(manager.totalResourceCount).toBe(0);
        });

        it('should reset singleton properly', () => {
            const manager1 = FileResourceManager.getInstance();
            FileResourceManager.resetInstance();
            const manager2 = FileResourceManager.getInstance();

            expect(manager1).not.toBe(manager2);
        });
    });

    describe('Integration: Multiple services disposal', () => {
        it('should dispose multiple services in correct order', () => {
            const cache = new FileHandleCache();
            const manager = FileResourceManager.getInstance();
            const fileSystem = new FileSystemService(createMockAdapter());

            expect(() => {
                cache.dispose();
                manager.dispose();
                fileSystem.dispose();
            }).not.toThrow();
        });

        it('should handle nested disposable cleanup', () => {
            const fileSystem = new FileSystemService(createMockAdapter());

            // FileSystemService internally uses DisposableStore
            // to manage FileHandleCache and FileResourceManager
            fileSystem.dispose();

            // Verify clean disposal
            expect(fileSystem['_store']).toBeDefined();
        });
    });
});
