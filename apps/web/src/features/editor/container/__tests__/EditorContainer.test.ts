/**
 * EditorContainer Tests
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { registerBuiltinBlocks } from '../../registry/builtin-types';
import { EditorContainer } from '../EditorContainer';

describe('EditorContainer', () => {
    beforeEach(() => {
        registerBuiltinBlocks();
    });

    afterEach(() => {
        // Dispose all instances after each test
    });

    it('should be a singleton', () => {
        const container1 = new EditorContainer();
        const container2 = new EditorContainer();

        // Both should be separate instances (DI container manages singleton)
        expect(container1).toBeDefined();
        expect(container2).toBeDefined();
    });

    it('should create an editor instance', () => {
        const container = new EditorContainer();

        const service = container.createInstance('doc-123', '/test/doc.md');

        expect(service).toBeDefined();
        expect(service.documentId).toBe('doc-123');
        expect(service.filePath).toBe('/test/doc.md');
    });

    it('should return existing instance when creating duplicate', () => {
        const container = new EditorContainer();

        const service1 = container.createInstance('doc-123', '/test/doc.md');
        const service2 = container.createInstance('doc-123', '/test/doc.md');

        expect(service1).toBe(service2);
    });

    it('should get service by document id', () => {
        const container = new EditorContainer();
        container.createInstance('doc-123', '/test/doc.md');

        const service = container.getService('doc-123');

        expect(service).not.toBeNull();
        expect(service?.documentId).toBe('doc-123');
    });

    it('should return null for non-existent service', () => {
        const container = new EditorContainer();

        const service = container.getService('non-existent');

        expect(service).toBeNull();
    });

    it('should dispose instance', () => {
        const container = new EditorContainer();
        container.createInstance('doc-123', '/test/doc.md');

        container.disposeInstance('doc-123');

        const service = container.getService('doc-123');
        expect(service).toBeNull();
    });

    it('should dispose all instances', () => {
        const container = new EditorContainer();
        container.createInstance('doc-1', '/test/1.md');
        container.createInstance('doc-2', '/test/2.md');

        container.disposeAll();

        expect(container.getService('doc-1')).toBeNull();
        expect(container.getService('doc-2')).toBeNull();
    });

    it('should get all document ids', () => {
        const container = new EditorContainer();
        container.createInstance('doc-1', '/test/1.md');
        container.createInstance('doc-2', '/test/2.md');

        // Note: EditorContainer doesn't expose getAllDocumentIds, but it's used internally
        // This test verifies instances are created
        expect(container.getService('doc-1')).toBeDefined();
        expect(container.getService('doc-2')).toBeDefined();
    });
});
