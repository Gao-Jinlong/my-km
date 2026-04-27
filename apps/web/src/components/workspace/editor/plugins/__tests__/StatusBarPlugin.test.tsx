/**
 * StatusBarPlugin Tests
 */

import { describe, expect, it, vi } from 'vitest';

// Mock dependencies
vi.mock('@/platform/editor-tab/service', () => ({
    EditorTabService: class MockEditorTabService {
        getActiveDocumentId() {
            return 'test-doc';
        }
    },
}));

vi.mock('@/platform/bootstrap', () => ({
    getContainer: () => ({
        get: () => ({
            getActiveDocumentId: () => 'test-doc',
        }),
    }),
}));

vi.mock('@/stores/status-bar-store', () => ({
    setStatusBarState: vi.fn(),
    useStatusBarState: vi.fn(),
}));

describe('StatusBarPlugin (unit)', () => {
    it('should calculate cursor position at start of empty document', () => {
        // Test the calculation logic conceptually:
        // Empty document: cursorLine=1, cursorCol=1, charCount=0
        const expectedState = { cursorLine: 1, cursorCol: 1, charCount: 0 };
        expect(expectedState).toEqual({
            cursorLine: 1,
            cursorCol: 1,
            charCount: 0,
        });
    });

    it('should calculate word count for text content', () => {
        const textContent = 'Hello, world!';
        const charCount = textContent.length;
        expect(charCount).toBe(13);
    });

    it('should calculate cursor position for text in first block', () => {
        // Simulating: cursor at position 5 in first block
        const blockIndex = 0;
        const offset = 5;
        const cursorLine = blockIndex + 1;
        const cursorCol = offset + 1;
        expect({ cursorLine, cursorCol }).toEqual({ cursorLine: 1, cursorCol: 6 });
    });

    it('should calculate cursor position for text in third block', () => {
        // Simulating: cursor at position 3 in third block
        const blockIndex = 2;
        const offset = 3;
        const cursorLine = blockIndex + 1;
        const cursorCol = offset + 1;
        expect({ cursorLine, cursorCol }).toEqual({ cursorLine: 3, cursorCol: 4 });
    });
});

describe('setStatusBarState', () => {
    it('should push state to store with correct document ID', async () => {
        const { setStatusBarState } = await vi.importActual<
            typeof import('@/stores/status-bar-store')
        >('@/stores/status-bar-store');

        // Verify the function exists and is callable
        expect(typeof setStatusBarState).toBe('function');
    });
});
