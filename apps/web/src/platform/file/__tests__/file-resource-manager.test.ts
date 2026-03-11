/**
 * FileResourceManager 测试
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FileResourceManager } from '../manager/file-resource-manager';
import type { FileResource } from '../types';

describe('FileResourceManager', () => {
    beforeEach(() => {
        // Reset singleton instance before each test
        FileResourceManager.resetInstance();
    });

    afterEach(() => {
        FileResourceManager.resetInstance();
    });

    describe('register', () => {
        it('should register a new file resource', () => {
            const manager = FileResourceManager.getInstance();

            const resource: FileResource = {
                id: 'file-1',
                path: 'src/index.ts',
                isActive: false,
            };

            manager.register(resource);

            const activeFiles = manager.getActiveFiles();
            expect(activeFiles).toHaveLength(1);
            expect(activeFiles[0].id).toBe('file-1');
            expect(activeFiles[0].isActive).toBe(true);
        });

        it('should update existing resource to active', () => {
            const manager = FileResourceManager.getInstance();

            const resource: FileResource = {
                id: 'file-1',
                path: 'src/index.ts',
                isActive: false,
            };

            manager.register(resource);
            manager.unregister('file-1');

            // Re-register should mark as active again
            manager.register(resource);

            const activeFiles = manager.getActiveFiles();
            expect(activeFiles).toHaveLength(1);
            expect(activeFiles[0].isActive).toBe(true);
        });
    });

    describe('unregister', () => {
        it('should mark resource as inactive', () => {
            const manager = FileResourceManager.getInstance();

            const resource: FileResource = {
                id: 'file-1',
                path: 'src/index.ts',
                isActive: false,
            };

            manager.register(resource);
            manager.unregister('file-1');

            const activeFiles = manager.getActiveFiles();
            expect(activeFiles).toHaveLength(0);
        });
    });

    describe('getActiveFiles', () => {
        it('should return only active files', () => {
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

            manager.unregister('file-1');

            const activeFiles = manager.getActiveFiles();
            expect(activeFiles).toHaveLength(1);
            expect(activeFiles[0].id).toBe('file-2');
        });
    });

    describe('isResourceActive', () => {
        it('should return true for active resource', () => {
            const manager = FileResourceManager.getInstance();

            manager.register({
                id: 'file-1',
                path: 'src/index.ts',
                isActive: false,
            });

            expect(manager.isResourceActive('file-1')).toBe(true);
        });

        it('should return false for inactive resource', () => {
            const manager = FileResourceManager.getInstance();

            manager.register({
                id: 'file-1',
                path: 'src/index.ts',
                isActive: false,
            });

            manager.unregister('file-1');
            expect(manager.isResourceActive('file-1')).toBe(false);
        });
    });

    describe('getAllResources', () => {
        it('should return all registered resources', () => {
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

            manager.unregister('file-1');

            const allResources = manager.getAllResources();
            expect(allResources).toHaveLength(2);
        });
    });

    describe('releaseResource', () => {
        it('should remove resource from management', () => {
            const manager = FileResourceManager.getInstance();

            manager.register({
                id: 'file-1',
                path: 'src/index.ts',
                isActive: false,
            });

            manager.releaseResource('file-1');

            const allResources = manager.getAllResources();
            expect(allResources).toHaveLength(0);
        });
    });

    describe('releaseProjectResources', () => {
        it('should release all resources for a project', () => {
            const manager = FileResourceManager.getInstance();

            manager.register({
                id: 'file-1',
                path: 'project1/src/index.ts',
                isActive: false,
            });

            manager.register({
                id: 'file-2',
                path: 'project1/src/utils.ts',
                isActive: false,
            });

            manager.register({
                id: 'file-3',
                path: 'project2/src/main.ts',
                isActive: false,
            });

            manager.releaseProjectResources('project1');

            const allResources = manager.getAllResources();
            expect(allResources).toHaveLength(1);
            expect(allResources[0].id).toBe('file-3');
        });
    });

    describe('activeResourceCount', () => {
        it('should return count of active resources', () => {
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

            manager.unregister('file-1');

            expect(manager.activeResourceCount).toBe(1);
        });
    });

    describe('dispose', () => {
        it('should release all resources', () => {
            const manager = FileResourceManager.getInstance();

            manager.register({
                id: 'file-1',
                path: 'src/index.ts',
                isActive: false,
            });

            manager.dispose();

            expect(manager.totalResourceCount).toBe(0);
            expect(manager.activeResourceCount).toBe(0);
        });
    });
});
