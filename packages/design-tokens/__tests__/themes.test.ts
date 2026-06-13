import { describe, expect, it } from 'vitest';
import { tokenSchema } from '../src/schema';
import { themes } from '../src/themes';

describe('themes registry', () => {
    it('exposes light and dark', () => {
        expect(Object.keys(themes).sort()).toEqual(['dark', 'light']);
    });

    it('every theme satisfies the token schema', () => {
        for (const [name, theme] of Object.entries(themes)) {
            expect(() => tokenSchema.parse(theme), `theme: ${name}`).not.toThrow();
        }
    });

    it('light theme matches the existing workspace anchors from globals.css', () => {
        expect(themes.light.workspace.bg.primary).toBe('#ffffff');
        expect(themes.light.workspace.bg.secondary).toBe('#f6f8fa');
        expect(themes.light.workspace.bg.tertiary).toBe('#ebeef1');
        expect(themes.light.workspace.bg.hover).toBe('#f3f4f6');
        expect(themes.light.workspace.border).toBe('#d0d7de');
        expect(themes.light.workspace.fg.primary).toBe('#1f2328');
        expect(themes.light.workspace.fg.muted).toBe('#636c76');
        expect(themes.light.workspace.accent.default).toBe('#0969da');
        expect(themes.light.workspace.accent.foreground).toBe('#ffffff');
        expect(themes.light.workspace.icon).toBe('#636c76');
    });

    it('dark theme matches the existing dark workspace anchors from globals.css', () => {
        expect(themes.dark.workspace.bg.primary).toBe('#181818');
        expect(themes.dark.workspace.bg.secondary).toBe('#1e1e1e');
        expect(themes.dark.workspace.bg.tertiary).toBe('#252525');
        expect(themes.dark.workspace.bg.hover).toBe('#2a2a2a');
        expect(themes.dark.workspace.border).toBe('#333333');
        expect(themes.dark.workspace.fg.primary).toBe('#cccccc');
        expect(themes.dark.workspace.fg.muted).toBe('#999999');
        expect(themes.dark.workspace.accent.default).toBe('#58a6ff');
        expect(themes.dark.workspace.accent.foreground).toBe('#000000');
        expect(themes.dark.workspace.icon).toBe('#999999');
    });

    it('editor selection in light is the brand accent at ~18% alpha', () => {
        expect(themes.light.editor.selection.bg).toBe('#0969da2e');
    });
});
