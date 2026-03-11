/**
 * FileHandleCache 单元测试
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FileHandleCache } from '../cache/file-handle-cache';

// Mock IndexedDB
const mockIDB = {
    open: vi.fn(),
    delete: vi.fn(),
};

// Mock store methods
const mockStore = {
    get: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    clear: vi.fn(),
    getAll: vi.fn(),
    getAllKeys: vi.fn(),
};

// Mock transaction
const mockTransaction = {
    objectStore: vi.fn(() => mockStore),
    oncomplete: null as (() => void) | null,
};

// Mock database
const mockDB = {
    transaction: vi.fn(() => mockTransaction),
    objectStoreNames: {
        contains: vi.fn(),
    },
    createObjectStore: vi.fn(),
};

// Mock request
const mockRequest = {
    onerror: null as (() => void) | null,
    onsuccess: null as (() => void) | null,
    onupgradeneeded: null as (() => void) | null,
    result: mockDB,
    error: null,
};

describe('FileHandleCache', () => {
    let cache: FileHandleCache;

    beforeEach(() => {
        // Setup IndexedDB mock
        global.indexedDB = mockIDB as any;
        mockIDB.open.mockReturnValue(mockRequest as any);

        // Reset all mocks
        vi.clearAllMocks();
        mockStore.get.mockReset();
        mockStore.put.mockReset();
        mockStore.delete.mockReset();
        mockStore.clear.mockReset();
        mockStore.getAll.mockReset();
        mockStore.getAllKeys.mockReset();

        cache = new FileHandleCache();
    });

    afterEach(() => {
        cache.dispose();
    });

    describe('storeHandle', () => {
        it('should store a file handle with the given key', async () => {
            const mockHandle = {
                kind: 'file',
                name: 'test.txt',
                getFile: vi.fn(),
            } as unknown as FileSystemFileHandle;

            mockStore.put.mockReturnValue({
                onsuccess: null,
                onerror: null,
                result: undefined,
                error: null,
            } as any);

            await cache.storeHandle('test-key', mockHandle);

            expect(mockStore.put).toHaveBeenCalledWith({
                key: 'test-key',
                handle: mockHandle,
                timestamp: expect.any(Number),
            });
        });
    });

    describe('getHandle', () => {
        it('should return the handle for a given key', async () => {
            const mockHandle = {
                kind: 'file',
                name: 'test.txt',
            } as any;

            mockStore.get.mockReturnValue({
                onsuccess: null,
                onerror: null,
                result: { handle: mockHandle },
                error: null,
            } as any);

            const result = await cache.getHandle('test-key');

            expect(mockStore.get).toHaveBeenCalledWith('test-key');
            expect(result).toEqual(mockHandle);
        });

        it('should return null for non-existent key', async () => {
            mockStore.get.mockReturnValue({
                onsuccess: null,
                onerror: null,
                result: null,
                error: null,
            } as any);

            const result = await cache.getHandle('non-existent');
            expect(result).toBeNull();
        });
    });

    describe('deleteHandle', () => {
        it('should delete a handle by key', async () => {
            mockStore.delete.mockReturnValue({
                onsuccess: null,
                onerror: null,
                result: undefined,
                error: null,
            } as any);

            await cache.deleteHandle('test-key');

            expect(mockStore.delete).toHaveBeenCalledWith('test-key');
        });
    });

    describe('clearProject', () => {
        it('should delete all handles with the project ID prefix', async () => {
            const keys = ['project1', 'project1:file1', 'project1:dir/file1', 'project2:file3'];
            mockStore.getAllKeys.mockReturnValue({
                onsuccess: null,
                onerror: null,
                result: keys,
                error: null,
            } as any);

            mockStore.delete.mockReturnValue({
                onsuccess: null,
                onerror: null,
                result: undefined,
                error: null,
            } as any);

            await cache.clearProject('project1');

            expect(mockStore.delete).toHaveBeenCalledTimes(3);
            expect(mockStore.delete).toHaveBeenCalledWith('project1');
            expect(mockStore.delete).toHaveBeenCalledWith('project1:file1');
            expect(mockStore.delete).toHaveBeenCalledWith('project1:dir/file1');
        });
    });

    describe('verifyHandle', () => {
        it('should return true for a valid file handle', async () => {
            const mockHandle = { kind: 'file' } as any;
            const result = await cache.verifyHandle(mockHandle);
            expect(result).toBe(true);
        });

        it('should return true for a valid directory handle', async () => {
            const mockHandle = { kind: 'directory' } as any;
            const result = await cache.verifyHandle(mockHandle);
            expect(result).toBe(true);
        });

        it('should return false for null handle', async () => {
            const result = await cache.verifyHandle(null as any);
            expect(result).toBe(false);
        });

        it('should return false for invalid handle', async () => {
            const mockHandle = { kind: 'invalid' } as any;
            const result = await cache.verifyHandle(mockHandle);
            expect(result).toBe(false);
        });
    });

    describe('hasHandle', () => {
        it('should return true if handle exists', async () => {
            mockStore.get.mockReturnValue({
                onsuccess: null,
                onerror: null,
                result: { handle: {} },
                error: null,
            } as any);

            const result = await cache.hasHandle('test-key');
            expect(result).toBe(true);
        });

        it('should return false if handle does not exist', async () => {
            mockStore.get.mockReturnValue({
                onsuccess: null,
                onerror: null,
                result: null,
                error: null,
            } as any);

            const result = await cache.hasHandle('test-key');
            expect(result).toBe(false);
        });
    });

    describe('getAllKeys', () => {
        it('should return all cached keys', async () => {
            const keys = ['key1', 'key2', 'key3'];
            mockStore.getAllKeys.mockReturnValue({
                onsuccess: null,
                onerror: null,
                result: keys,
                error: null,
            } as any);

            const result = await cache.getAllKeys();
            expect(result).toEqual(keys);
        });
    });

    describe('clearAll', () => {
        it('should clear all cached handles', async () => {
            mockStore.clear.mockReturnValue({
                onsuccess: null,
                onerror: null,
                result: undefined,
                error: null,
            } as any);

            await cache.clearAll();
            expect(mockStore.clear).toHaveBeenCalled();
        });
    });

    describe('dispose', () => {
        it('should clean up resources without errors', () => {
            expect(() => cache.dispose()).not.toThrow();
        });

        it('should be idempotent', () => {
            cache.dispose();
            expect(() => cache.dispose()).not.toThrow();
        });
    });
});
