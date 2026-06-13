import { describe, expect, it } from 'vitest';
import { tokenSchema } from '../src/schema';

const validTheme = {
    color: {
        bg: {
            primary: '#fff',
            secondary: '#fff',
            tertiary: '#fff',
            hover: '#fff',
            active: '#fff',
            disabled: '#fff',
            overlay: '#fff',
        },
        fg: {
            primary: '#fff',
            secondary: '#fff',
            muted: '#fff',
            disabled: '#fff',
            'on-accent': '#fff',
            'on-error': '#fff',
        },
        border: { default: '#fff', subtle: '#fff', strong: '#fff', focus: '#fff' },
        accent: {
            default: '#fff',
            hover: '#fff',
            active: '#fff',
            'subtle-bg': '#fff',
            'subtle-fg': '#fff',
        },
        feedback: {
            success: { default: '#fff', bg: '#fff', fg: '#fff' },
            warning: { default: '#fff', bg: '#fff', fg: '#fff' },
            error: { default: '#fff', bg: '#fff', fg: '#fff' },
            info: { default: '#fff', bg: '#fff', fg: '#fff' },
        },
    },
    editor: {
        surface: { bg: '#fff' },
        text: { body: '#fff', muted: '#fff' },
        selection: { bg: '#fff' },
        cursor: '#fff',
        code: {
            inline: { bg: '#fff', fg: '#fff' },
            block: { bg: '#fff' },
        },
        quote: { border: '#fff' },
        link: { fg: '#fff', hover: '#fff' },
    },
    workspace: {
        bg: { primary: '#fff', secondary: '#fff', tertiary: '#fff', hover: '#fff' },
        fg: { primary: '#fff', muted: '#fff' },
        border: '#fff',
        accent: { default: '#fff', foreground: '#fff' },
        icon: '#fff',
    },
};

describe('tokenSchema', () => {
    it('accepts a fully-populated theme', () => {
        expect(() => tokenSchema.parse(validTheme)).not.toThrow();
    });

    it('rejects a theme missing a required key', () => {
        const broken = JSON.parse(JSON.stringify(validTheme));
        delete broken.color.bg.primary;
        expect(() => tokenSchema.parse(broken)).toThrow(/primary/);
    });

    it('rejects a theme with unknown extra keys at the top level', () => {
        const broken = { ...validTheme, sneaky: { foo: '#fff' } };
        expect(() => tokenSchema.parse(broken)).toThrow(/sneaky/);
    });
});
