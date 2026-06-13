import { ref } from '../reference';
import type { ThemeShape } from '../schema';
import { alpha } from '../utils';

export const dark: ThemeShape = {
    color: {
        bg: {
            primary: ref.darkSurface.bg,
            secondary: ref.darkSurface.secondary,
            tertiary: ref.darkSurface.tertiary,
            hover: ref.darkSurface.hover,
            active: ref.darkSurface.tertiary,
            disabled: ref.darkSurface.secondary,
            overlay: alpha(ref.gray[1000], 0.7),
        },
        fg: {
            primary: ref.darkText.primary,
            secondary: ref.darkText.muted,
            muted: ref.darkText.muted,
            disabled: ref.gray[600],
            'on-accent': ref.gray[1000],
            'on-error': ref.gray[0],
        },
        border: {
            default: ref.darkSurface.border,
            subtle: ref.darkSurface.tertiary,
            strong: ref.gray[600],
            focus: ref.darkAccent.blue,
        },
        accent: {
            default: ref.darkAccent.blue,
            hover: ref.blue[400],
            active: ref.blue[300],
            'subtle-bg': alpha(ref.blue[500], 0.15),
            'subtle-fg': ref.blue[300],
        },
        feedback: {
            success: {
                default: ref.green[300],
                bg: alpha(ref.green[500], 0.15),
                fg: ref.green[300],
            },
            warning: {
                default: ref.yellow[300],
                bg: alpha(ref.yellow[500], 0.15),
                fg: ref.yellow[300],
            },
            error: { default: ref.darkAccent.red, bg: alpha(ref.red[500], 0.15), fg: ref.red[300] },
            info: {
                default: ref.darkAccent.blue,
                bg: alpha(ref.blue[500], 0.15),
                fg: ref.blue[300],
            },
        },
    },
    editor: {
        surface: { bg: ref.darkSurface.bg },
        text: { body: ref.darkText.primary, muted: ref.darkText.muted },
        selection: { bg: alpha(ref.darkAccent.blue, 0.25) },
        cursor: ref.darkText.primary,
        code: {
            inline: { bg: ref.darkSurface.tertiary, fg: ref.darkText.primary },
            block: { bg: ref.darkSurface.secondary },
        },
        quote: { border: ref.darkSurface.border },
        link: { fg: ref.darkAccent.blue, hover: ref.blue[300] },
    },
    workspace: {
        bg: {
            primary: ref.darkSurface.bg,
            secondary: ref.darkSurface.secondary,
            tertiary: ref.darkSurface.tertiary,
            hover: ref.darkSurface.hover,
        },
        fg: { primary: ref.darkText.primary, muted: ref.darkText.muted },
        border: ref.darkSurface.border,
        accent: { default: ref.darkAccent.blue, foreground: ref.gray[1000] },
        icon: ref.darkText.muted,
    },
    typography: {
        family: { sans: ref.typography.family.sans, mono: ref.typography.family.mono },
        size: { ...ref.typography.size },
        weight: { ...ref.typography.weight },
        lineHeight: { ...ref.typography.lineHeight },
        letterSpacing: { ...ref.typography.letterSpacing },
    },
    spacing: { ...ref.spacing },
    radius: { ...ref.radius },
    shadow: { ...ref.shadow },
    motion: {
        duration: { ...ref.motion.duration },
        easing: { ...ref.motion.easing },
    },
    zIndex: { ...ref.zIndex },
};
