/**
 * EditorService Tests
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BlockRegistry } from '../../registry/BlockRegistry';
import { registerBuiltinBlocks } from '../../registry/builtin-types';
import { createEditorService } from '../EditorService';

describe('EditorService', () => {
    let blockRegistry: BlockRegistry;

    beforeEach(() => {
        blockRegistry = new BlockRegistry();
        registerBuiltinBlocks();
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('should create an editor service instance', () => {
        const service = createEditorService('doc-123', blockRegistry);

        expect(service.documentId).toBe('doc-123');
        expect(service.editor).toBeDefined();
        expect(service.store).toBeDefined();
    });

    it('should have correct initial store state', () => {
        const service = createEditorService('doc-123', blockRegistry);

        expect(service.store.document).toBeNull();
        expect(service.store.selection).toBeNull();
        expect(service.store.formatState).toBeNull();
        expect(service.store.isDirty).toBe(false);
        expect(service.store.error).toBeNull();
    });

    it('should load a document', () => {
        const service = createEditorService('doc-123', blockRegistry);
        const mockDoc = {
            id: 'doc-123',
            path: '/test/doc.md',
            title: 'Test Document',
            type: 'rich-text' as const,
            content: [],
            version: 1,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };

        service.loadDocument(mockDoc);

        expect(service.store.document).toEqual(mockDoc);
        expect(service.store.isDirty).toBe(false);
        expect(service.store.error).toBeNull();
    });

    it('should mark dirty when inserting a block', () => {
        const service = createEditorService('doc-123', blockRegistry);
        const mockBlock = {
            id: 'block-123',
            type: 'paragraph' as const,
            content: { text: 'Test' },
        };

        expect(service.store.isDirty).toBe(false);
        service.insertBlock(mockBlock);
        expect(service.store.isDirty).toBe(true);
    });

    it('should mark dirty when updating a block', () => {
        const service = createEditorService('doc-123', blockRegistry);

        expect(service.store.isDirty).toBe(false);
        service.updateBlock('block-123', { text: 'Updated' });
        expect(service.store.isDirty).toBe(true);
    });

    it('should mark dirty when deleting a block', () => {
        const service = createEditorService('doc-123', blockRegistry);

        expect(service.store.isDirty).toBe(false);
        service.deleteBlock('block-123');
        expect(service.store.isDirty).toBe(true);
    });

    it('should return null for getSelection when no selection', () => {
        const service = createEditorService('doc-123', blockRegistry);

        const selection = service.getSelection();
        expect(selection).toBeNull();
    });

    it('should return null for getSelectedText when no selection', () => {
        const service = createEditorService('doc-123', blockRegistry);

        const text = service.getSelectedText();
        expect(text).toBeNull();
    });

    it('should return empty string for getFullContent when empty', () => {
        const service = createEditorService('doc-123', blockRegistry);

        const content = service.getFullContent();
        expect(content).toBe('');
    });

    it('should return default format state', () => {
        const service = createEditorService('doc-123', blockRegistry);

        const formatState = service.getFormatState();
        expect(formatState.bold).toBe(false);
        expect(formatState.italic).toBe(false);
        expect(formatState.underline).toBe(false);
        expect(formatState.code).toBe(false);
        expect(formatState.strikethrough).toBe(false);
        expect(formatState.subscript).toBe(false);
        expect(formatState.superscript).toBe(false);
        expect(formatState.highlight).toBe(false);
    });

    it('should return save result with error when no document loaded', async () => {
        const service = createEditorService('doc-123', blockRegistry);

        const result = await service.saveDocument();

        expect(result.success).toBe(false);
        expect(result.error).toBe('No document loaded');
    });

    it('should destroy the service', () => {
        const service = createEditorService('doc-123', blockRegistry);

        service.destroy();

        // After destroy, calling methods should throw or handle gracefully
        expect(() => {
            const mockBlock = {
                id: 'block-123',
                type: 'paragraph' as const,
                content: { text: 'Test' },
            };
            service.insertBlock(mockBlock);
        }).toThrow('EditorService has been destroyed');
    });

    it('should throw error when loading document after destroy', () => {
        const service = createEditorService('doc-123', blockRegistry);
        service.destroy();

        const mockDoc = {
            id: 'doc-123',
            path: '/test/doc.md',
            title: 'Test Document',
            type: 'rich-text' as const,
            content: [],
            version: 1,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };

        expect(() => {
            service.loadDocument(mockDoc);
        }).toThrow('EditorService has been destroyed');
    });
});
