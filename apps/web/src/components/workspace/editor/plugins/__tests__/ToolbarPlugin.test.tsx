/**
 * ToolbarPlugin Tests
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Toolbar } from '../../toolbar';

// Mock the EditorTabService
const mockOnDidChangeActive = { dispose: vi.fn() };
vi.mock('@/platform/editor-tab/service', () => ({
    EditorTabService: class MockEditorTabService {
        getActiveDocumentId() {
            return 'test-doc';
        }
        onDidChangeActive() {
            return mockOnDidChangeActive;
        }
    },
}));

vi.mock('@/platform/bootstrap', () => ({
    getContainer: () => ({
        get: (_serviceClass: unknown) => ({
            getActiveDocumentId: () => 'test-doc',
            onDidChangeActive: () => mockOnDidChangeActive,
        }),
    }),
}));

describe('Toolbar', () => {
    it('should render all format buttons', () => {
        const mockEditor = {
            dispatchCommand: vi.fn(),
            update: vi.fn(),
            read: vi.fn(),
            // biome-ignore lint/suspicious/noExplicitAny: mock editor for tests
        } as any;

        const formatState = {
            bold: false,
            italic: false,
            underline: false,
            strikethrough: false,
            code: false,
            highlight: false,
            subscript: false,
            superscript: false,
        };

        render(<Toolbar editor={mockEditor} formatState={formatState} />);

        // Check all 6 format buttons are rendered
        expect(screen.getByTitle('Bold (Ctrl+B)')).toBeTruthy();
        expect(screen.getByTitle('Italic (Ctrl+I)')).toBeTruthy();
        expect(screen.getByTitle('Underline (Ctrl+U)')).toBeTruthy();
        expect(screen.getByTitle('Strikethrough')).toBeTruthy();
        expect(screen.getByTitle('Code')).toBeTruthy();
        expect(screen.getByTitle('Highlight')).toBeTruthy();
    });

    it('should highlight active format button', () => {
        const mockEditor = {
            dispatchCommand: vi.fn(),
            update: vi.fn(),
            read: vi.fn(),
            // biome-ignore lint/suspicious/noExplicitAny: mock editor for tests
        } as any;

        const formatState = {
            bold: true,
            italic: false,
            underline: false,
            strikethrough: false,
            code: false,
            highlight: false,
            subscript: false,
            superscript: false,
        };

        render(<Toolbar editor={mockEditor} formatState={formatState} />);

        const boldButton = screen.getByTitle('Bold (Ctrl+B)');
        // Active buttons should have the active styling class
        expect(boldButton.className).toContain('bg-ws-accent');
    });

    it('should dispatch FORMAT_TEXT_COMMAND on button click', () => {
        const mockEditor = {
            dispatchCommand: vi.fn(),
            update: vi.fn(),
            read: vi.fn(),
            // biome-ignore lint/suspicious/noExplicitAny: mock editor for tests
        } as any;

        const formatState = {
            bold: false,
            italic: false,
            underline: false,
            strikethrough: false,
            code: false,
            highlight: false,
            subscript: false,
            superscript: false,
        };

        render(<Toolbar editor={mockEditor} formatState={formatState} />);

        const boldButton = screen.getByTitle('Bold (Ctrl+B)');
        fireEvent.click(boldButton);

        expect(mockEditor.dispatchCommand).toHaveBeenCalled();
    });

    it('should show all buttons inactive when formatState is null', () => {
        const mockEditor = {
            dispatchCommand: vi.fn(),
            update: vi.fn(),
            read: vi.fn(),
            // biome-ignore lint/suspicious/noExplicitAny: mock editor for tests
        } as any;

        render(<Toolbar editor={mockEditor} formatState={null} />);

        const boldButton = screen.getByTitle('Bold (Ctrl+B)');
        // When formatState is null, no button should be active
        expect(boldButton.className).not.toContain('bg-ws-accent');
    });
});
