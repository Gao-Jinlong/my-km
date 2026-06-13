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

    it('exposes typography family anchors in light theme', () => {
        expect(themes.light.typography.family.sans).toContain('BlinkMacSystemFont');
        expect(themes.light.typography.family.mono).toContain('SF Mono');
        expect(themes.light.typography.size.base).toBe('1rem');
        expect(themes.light.typography.weight.regular).toBe('400');
    });

    it('light and dark themes have identical typography', () => {
        expect(themes.dark.typography).toEqual(themes.light.typography);
    });

    it('exposes spacing scale on 4px baseline', () => {
        expect(themes.light.spacing['0']).toBe('0px');
        expect(themes.light.spacing['1']).toBe('4px');
        expect(themes.light.spacing['4']).toBe('16px');
        expect(themes.light.spacing['16']).toBe('64px');
    });

    it('exposes radius scale', () => {
        expect(themes.light.radius.none).toBe('0px');
        expect(themes.light.radius.md).toBe('6px');
        expect(themes.light.radius.full).toBe('9999px');
    });

    it('exposes shadow scale', () => {
        expect(themes.light.shadow.sm).toContain('0 1px 2px');
        expect(themes.light.shadow.overlay).toContain('rgb(0 0 0');
        expect(themes.light.shadow['focus-ring']).toContain('var(--color-border-focus)');
    });

    it('exposes motion duration and easing', () => {
        expect(themes.light.motion.duration.fast).toBe('100ms');
        expect(themes.light.motion.duration.slow).toBe('300ms');
        expect(themes.light.motion.easing.standard).toContain('cubic-bezier');
    });

    it('exposes zIndex scale with ordered layers', () => {
        expect(themes.light['z-index'].base).toBe('0');
        expect(themes.light['z-index'].dropdown).toBe('1000');
        expect(themes.light['z-index'].modal).toBe('1200');
        expect(themes.light['z-index'].toast).toBe('1500');
    });
});
