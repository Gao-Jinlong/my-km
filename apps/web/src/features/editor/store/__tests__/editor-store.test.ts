/**
 * Editor Store Tests
 */

import { describe, expect, it } from 'vitest';
import { createEditorStore, createEmptyFormatState, createEmptySelection } from '../editor-store';

describe('EditorStore', () => {
    it('should create a store with initial state', () => {
        const store = createEditorStore();

        expect(store.document).toBeNull();
        expect(store.selection).toBeNull();
        expect(store.formatState).toBeNull();
        expect(store.isDirty).toBe(false);
        expect(store.isLoading).toBe(false);
        expect(store.error).toBeNull();
    });

    it('should set document', () => {
        const store = createEditorStore();
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

        store.setDocument(mockDoc);
        expect(store.document).toEqual(mockDoc);
        expect(store.error).toBeNull();
    });

    it('should set selection', () => {
        const store = createEditorStore();
        const mockSelection = {
            anchor: { blockId: 'block-1', offset: 0 },
            head: { blockId: 'block-1', offset: 10 },
            text: 'Test text',
        };

        store.setSelection(mockSelection);
        expect(store.selection).toEqual(mockSelection);
    });

    it('should set selection to null', () => {
        const store = createEditorStore();
        const mockSelection = {
            anchor: { blockId: 'block-1', offset: 0 },
            head: { blockId: 'block-1', offset: 10 },
            text: 'Test text',
        };

        store.setSelection(mockSelection);
        store.setSelection(null);
        expect(store.selection).toBeNull();
    });

    it('should set format state', () => {
        const store = createEditorStore();
        const mockFormatState = {
            bold: true,
            italic: false,
            underline: true,
            code: false,
            strikethrough: false,
            subscript: false,
            superscript: false,
            highlight: false,
        };

        store.setFormatState(mockFormatState);
        expect(store.formatState).toEqual(mockFormatState);
    });

    it('should mark dirty and clean', () => {
        const store = createEditorStore();

        expect(store.isDirty).toBe(false);

        store.markDirty();
        expect(store.isDirty).toBe(true);

        store.markClean();
        expect(store.isDirty).toBe(false);
    });

    it('should set and clear error', () => {
        const store = createEditorStore();

        expect(store.error).toBeNull();

        store.setError('Test error');
        expect(store.error).toBe('Test error');

        store.clearError();
        expect(store.error).toBeNull();
    });

    it('should reset to initial state', () => {
        const store = createEditorStore();
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

        // Set some state
        store.setDocument(mockDoc);
        store.markDirty();
        store.setError('Test error');

        // Reset
        store.reset();

        // Verify reset
        expect(store.document).toBeNull();
        expect(store.isDirty).toBe(false);
        expect(store.error).toBeNull();
    });

    it('should create empty format state', () => {
        const formatState = createEmptyFormatState();

        expect(formatState.bold).toBe(false);
        expect(formatState.italic).toBe(false);
        expect(formatState.underline).toBe(false);
        expect(formatState.code).toBe(false);
        expect(formatState.strikethrough).toBe(false);
        expect(formatState.subscript).toBe(false);
        expect(formatState.superscript).toBe(false);
        expect(formatState.highlight).toBe(false);
    });

    it('should create empty selection', () => {
        const selection = createEmptySelection();

        expect(selection.anchor).toEqual({ blockId: '', offset: 0 });
        expect(selection.head).toEqual({ blockId: '', offset: 0 });
        expect(selection.text).toBe('');
    });
});
