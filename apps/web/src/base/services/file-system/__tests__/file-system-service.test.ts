/**
 * FileSystemService 集成测试
 */

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import type {
    DirectoryEntry,
    DirectoryPickerOptions,
    FileInfo,
    FileReadResult,
    IFileSystemAdapter,
} from '../adapter/types';
import { FileHandleCache } from '../cache/file-handle-cache';
import { FileSystemService } from '../service/file-system-service';
import { FileNotFoundError, ProjectNotOpenError } from '../types';

// Mock FileResourceManager
const mockResourceManager = {
    register: jest.fn(),
    unregister: jest.fn(),
    dispose: jest.fn(),
    getInstance: jest.fn(() => mockResourceManager),
};

// Mock FileHandleCache.clearProject
const mockCacheClearProject = jest
    .fn<(projectId: string) => Promise<void>>()
    .mockResolvedValue(undefined);

// Mock Adapter
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

describe('FileSystemService', () => {
    let fileSystem: FileSystemService;
    let mockAdapter: IFileSystemAdapter;

    beforeEach(() => {
        jest.clearAllMocks();
        mockCacheClearProject.mockClear();

        // Setup global mocks for IndexedDB
        global.indexedDB = {
            open: jest.fn(
                () =>
                    ({
                        onsuccess: null,
                        onerror: null,
                        result: {
                            transaction: {
                                objectStore: jest.fn(),
                            },
                        },
                        error: null,
                    }) as any,
            ),
        } as any;

        mockAdapter = createMockAdapter();
        fileSystem = new FileSystemService(mockAdapter);

        // Mock FileHandleCache.clearProject
        jest.spyOn(FileHandleCache.prototype, 'clearProject').mockImplementation(
            mockCacheClearProject,
        );
    });

    afterEach(() => {
        fileSystem.dispose();
    });

    describe('openProject', () => {
        it('should open a project directory and cache the handle', async () => {
            const mockAdapterOpen = jest.spyOn(mockAdapter, 'openDirectoryPicker');
            mockAdapterOpen.mockResolvedValue('test-project');

            const project = await fileSystem.openProject();

            expect(mockAdapterOpen).toHaveBeenCalled();
            expect(project.name).toBe('test-project');
            expect(fileSystem.currentProject).toBeTruthy();
            expect(fileSystem.currentProject?.name).toBe('test-project');
        });

        it('should throw PermissionDeniedError when user cancels', async () => {
            jest.spyOn(mockAdapter, 'openDirectoryPicker').mockResolvedValue(null);

            await expect(fileSystem.openProject()).rejects.toThrow('Permission denied');
        });
    });

    describe('closeProject', () => {
        it('should clear project handles and reset current project', async () => {
            jest.spyOn(mockAdapter, 'openDirectoryPicker').mockResolvedValue('test-project');
            mockCacheClearProject.mockResolvedValue(undefined);

            await fileSystem.openProject();
            await fileSystem.closeProject();

            expect(mockCacheClearProject).toHaveBeenCalled();
            expect(fileSystem.currentProject).toBeNull();
        });

        it('should be a no-op when no project is open', async () => {
            await fileSystem.closeProject();
            expect(mockCacheClearProject).not.toHaveBeenCalled();
        });
    });

    describe('readFile', () => {
        it('should throw ProjectNotOpenError when no project is open', async () => {
            await expect(fileSystem.readFile('test.txt')).rejects.toThrow(ProjectNotOpenError);
        });

        it('should read file content and return file info', async () => {
            // Setup: open project
            jest.spyOn(mockAdapter, 'openDirectoryPicker').mockResolvedValue('test-project');
            await fileSystem.openProject();

            // Mock adapter readFile
            jest.spyOn(mockAdapter, 'readFile').mockResolvedValue({
                content: 'file content',
                fileInfo: {
                    name: 'test.txt',
                    path: 'test.txt',
                    kind: 'file',
                    size: 100,
                    lastModified: Date.now(),
                },
            });

            const result = await fileSystem.readFile('test.txt');

            expect(result.content).toBe('file content');
            expect(result.fileInfo.name).toBe('test.txt');
            expect(result.fileInfo.size).toBe(100);
        });

        it('should throw FileNotFoundError for non-existent file', async () => {
            jest.spyOn(mockAdapter, 'openDirectoryPicker').mockResolvedValue('test-project');
            await fileSystem.openProject();

            jest.spyOn(mockAdapter, 'readFile').mockRejectedValue({ code: 'ENOENT' });

            await expect(fileSystem.readFile('nonexistent.txt')).rejects.toThrow(FileNotFoundError);
        });
    });

    describe('writeFile', () => {
        it('should throw ProjectNotOpenError when no project is open', async () => {
            await expect(fileSystem.writeFile('test.txt', 'content')).rejects.toThrow(
                ProjectNotOpenError,
            );
        });

        it('should write file content', async () => {
            jest.spyOn(mockAdapter, 'openDirectoryPicker').mockResolvedValue('test-project');
            await fileSystem.openProject();

            const mockWrite = jest.spyOn(mockAdapter, 'writeFile').mockResolvedValue();

            await fileSystem.writeFile('test.txt', 'content');

            expect(mockWrite).toHaveBeenCalledWith('test.txt', 'content');
        });
    });

    describe('listDirectory', () => {
        it('should throw ProjectNotOpenError when no project is open', async () => {
            await expect(fileSystem.listDirectory()).rejects.toThrow(ProjectNotOpenError);
        });

        it('should list directory contents', async () => {
            jest.spyOn(mockAdapter, 'openDirectoryPicker').mockResolvedValue('test-project');
            await fileSystem.openProject();

            jest.spyOn(mockAdapter, 'listDirectory').mockResolvedValue([
                { name: 'file1.txt', kind: 'file', path: 'file1.txt' },
                { name: 'dir1', kind: 'directory', path: 'dir1' },
            ]);

            const entries = await fileSystem.listDirectory();

            expect(entries).toHaveLength(2);
            expect(entries[0].name).toBe('file1.txt');
            expect(entries[1].name).toBe('dir1');
        });
    });

    describe('getFileInfo', () => {
        it('should throw ProjectNotOpenError when no project is open', async () => {
            await expect(fileSystem.getFileInfo('test.txt')).rejects.toThrow(ProjectNotOpenError);
        });

        it('should throw FileNotFoundError for non-existent file', async () => {
            jest.spyOn(mockAdapter, 'openDirectoryPicker').mockResolvedValue('test-project');
            await fileSystem.openProject();

            jest.spyOn(mockAdapter, 'getFileInfo').mockRejectedValue(new Error('Not found'));

            await expect(fileSystem.getFileInfo('nonexistent.txt')).rejects.toThrow(
                FileNotFoundError,
            );
        });

        it('should return file info', async () => {
            jest.spyOn(mockAdapter, 'openDirectoryPicker').mockResolvedValue('test-project');
            await fileSystem.openProject();

            jest.spyOn(mockAdapter, 'getFileInfo').mockResolvedValue({
                name: 'test.txt',
                path: 'test.txt',
                kind: 'file',
                size: 100,
                lastModified: Date.now(),
            });

            const info = await fileSystem.getFileInfo('test.txt');

            expect(info.name).toBe('test.txt');
            expect(info.size).toBe(100);
        });
    });

    describe('dispose', () => {
        it('should close project and dispose resources', async () => {
            jest.spyOn(mockAdapter, 'openDirectoryPicker').mockResolvedValue('test-project');
            mockCacheClearProject.mockResolvedValue(undefined);

            await fileSystem.openProject();
            fileSystem.dispose();

            expect(mockCacheClearProject).toHaveBeenCalled();
            expect(fileSystem.currentProject).toBeNull();
        });
    });
});
