/**
 * EditorService Tests
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerBuiltinBlocks } from '../../registry/builtin-types';
import { createEditorService } from '../EditorService';

describe('EditorService', () => {
    beforeEach(() => {
        registerBuiltinBlocks();
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('should create an editor service instance', () => {
        const service = createEditorService('doc-123', '/test/doc.md');

        expect(service.documentId).toBe('doc-123');
        expect(service.filePath).toBe('/test/doc.md');
        expect(service.getEditor()).toBeNull(); // Editor not injected yet
    });

    it('should have correct initial state', () => {
        const service = createEditorService('doc-123', '/test/doc.md');

        const state = service.getState();
        expect(state.isDirty).toBe(false);
        expect(state.isSaving).toBe(false);
        expect(state.hasError).toBe(false);
        expect(state.error).toBeNull();
        expect(state.isReadonly).toBe(false);
    });

    it('should load a document', () => {
        const service = createEditorService('doc-123', '/test/doc.md');
        const mockDoc = {
            id: 'doc-123',
            path: '/test/doc.md',
            title: 'Test Document',
            type: 'km' as const,
            content: [],
            version: 1,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };

        service.loadDocument(mockDoc);

        const state = service.getState();
        expect(state.isDirty).toBe(false);
        expect(state.error).toBeNull();
    });

    it('should return null for getSelection when no editor', () => {
        const service = createEditorService('doc-123', '/test/doc.md');

        const selection = service.getSelection();
        expect(selection).toBeNull();
    });

    it('should return null for getSelectedText when no editor', () => {
        const service = createEditorService('doc-123', '/test/doc.md');

        const text = service.getSelectedText();
        expect(text).toBeNull();
    });

    it('should return empty string for getFullContent when no editor', () => {
        const service = createEditorService('doc-123', '/test/doc.md');

        const content = service.getFullContent();
        expect(content).toBe('');
    });

    it('should return default format state', () => {
        const service = createEditorService('doc-123', '/test/doc.md');

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

    it('should return save result with error when no editor initialized', async () => {
        const service = createEditorService('doc-123', '/test/doc.md');

        const result = await service.saveDocument();

        expect(result.success).toBe(false);
        expect(result.error).toBe('Editor not initialized');
    });

    it('should destroy the service', () => {
        const service = createEditorService('doc-123', '/test/doc.md');

        service.destroy();

        // After destroy, isDisposed should be true
        expect(service.isDisposed).toBe(true);
    });

    it('should throw error when loading document after destroy', () => {
        const service = createEditorService('doc-123', '/test/doc.md');
        service.destroy();

        const mockDoc = {
            id: 'doc-123',
            path: '/test/doc.md',
            title: 'Test Document',
            type: 'km' as const,
            content: [],
            version: 1,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };

        expect(() => {
            service.loadDocument(mockDoc);
        }).toThrow('EditorService has been destroyed');
    });

    it('should set and get editor', () => {
        const service = createEditorService('doc-123', '/test/doc.md');

        const mockEditor = {
            update: vi.fn(),
            getEditorState: vi.fn(),
            registerUpdateListener: vi.fn(),
        } as any;

        service.setEditor(mockEditor);
        expect(service.getEditor()).toBe(mockEditor);
    });

    describe('spliceText', () => {
        it('未挂载 editor 时应返回错误', () => {
            const service = createEditorService('doc-1', '/x.km');
            const result = service.spliceText(0, 0, 'hello');
            expect(result.success).toBe(false);
            expect(result.error).toMatch(/editor not initialized/i);
        });
    });
});
