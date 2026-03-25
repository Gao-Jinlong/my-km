/**
 * EditorContainer Tests
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BlockRegistry } from '../../registry/BlockRegistry';
import { registerBuiltinBlocks } from '../../registry/builtin-types';
import { EditorContainer } from '../EditorContainer';

describe('EditorContainer', () => {
    let blockRegistry: BlockRegistry;

    beforeEach(() => {
        blockRegistry = new BlockRegistry();
        registerBuiltinBlocks();
        // Reset singleton before each test
        EditorContainer.resetInstance();
    });

    afterEach(() => {
        EditorContainer.resetInstance();
    });

    it('should create a singleton instance', () => {
        const instance1 = EditorContainer.getInstance(blockRegistry);
        const instance2 = EditorContainer.getInstance(blockRegistry);

        expect(instance1).toBe(instance2);
    });

    it('should create an editor instance', () => {
        const container = EditorContainer.getInstance(blockRegistry);

        const service = container.createInstance('doc-123');

        expect(service).toBeDefined();
        expect(service.documentId).toBe('doc-123');
    });

    it('should return existing instance when creating duplicate', () => {
        const container = EditorContainer.getInstance(blockRegistry);

        const service1 = container.createInstance('doc-123');
        const service2 = container.createInstance('doc-123');

        expect(service1).toBe(service2);
    });

    it('should get service by document id', () => {
        const container = EditorContainer.getInstance(blockRegistry);
        container.createInstance('doc-123');

        const service = container.getService('doc-123');

        expect(service).not.toBeNull();
        expect(service?.documentId).toBe('doc-123');
    });

    it('should return null for non-existent service', () => {
        const container = EditorContainer.getInstance(blockRegistry);

        const service = container.getService('non-existent');

        expect(service).toBeNull();
    });

    it('should get store by document id', () => {
        const container = EditorContainer.getInstance(blockRegistry);
        container.createInstance('doc-123');

        const store = container.getStore('doc-123');

        expect(store).not.toBeNull();
        expect(store?.document).toBeNull();
    });

    it('should return null for non-existent store', () => {
        const container = EditorContainer.getInstance(blockRegistry);

        const store = container.getStore('non-existent');

        expect(store).toBeNull();
    });

    it('should dispose instance', () => {
        const container = EditorContainer.getInstance(blockRegistry);
        container.createInstance('doc-123');

        container.disposeInstance('doc-123');

        expect(container.getService('doc-123')).toBeNull();
        expect(container.getStore('doc-123')).toBeNull();
    });

    it('should dispose all instances', () => {
        const container = EditorContainer.getInstance(blockRegistry);
        container.createInstance('doc-1');
        container.createInstance('doc-2');
        container.createInstance('doc-3');

        container.disposeAll();

        expect(container.getInstanceCount()).toBe(0);
        expect(container.getAllDocumentIds()).toEqual([]);
    });

    it('should get all document ids', () => {
        const container = EditorContainer.getInstance(blockRegistry);
        container.createInstance('doc-1');
        container.createInstance('doc-2');
        container.createInstance('doc-3');

        const ids = container.getAllDocumentIds();

        expect(ids).toEqual(['doc-1', 'doc-2', 'doc-3']);
    });

    it('should get instance count', () => {
        const container = EditorContainer.getInstance(blockRegistry);

        expect(container.getInstanceCount()).toBe(0);

        container.createInstance('doc-1');
        expect(container.getInstanceCount()).toBe(1);

        container.createInstance('doc-2');
        expect(container.getInstanceCount()).toBe(2);
    });

    it('should handle dispose gracefully for already disposed service', () => {
        const container = EditorContainer.getInstance(blockRegistry);
        container.createInstance('doc-123');

        // Dispose twice should not throw
        container.disposeInstance('doc-123');
        container.disposeInstance('doc-123');

        expect(container.getService('doc-123')).toBeNull();
    });
});
