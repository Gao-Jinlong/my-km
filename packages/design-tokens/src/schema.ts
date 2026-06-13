import { z } from 'zod';

const colorString = z.string().min(4);

const bg = z
    .object({
        primary: colorString,
        secondary: colorString,
        tertiary: colorString,
        hover: colorString,
        active: colorString,
        disabled: colorString,
        overlay: colorString,
    })
    .strict();

const fg = z
    .object({
        primary: colorString,
        secondary: colorString,
        muted: colorString,
        disabled: colorString,
        'on-accent': colorString,
        'on-error': colorString,
    })
    .strict();

const border = z
    .object({
        default: colorString,
        subtle: colorString,
        strong: colorString,
        focus: colorString,
    })
    .strict();

const accent = z
    .object({
        default: colorString,
        hover: colorString,
        active: colorString,
        'subtle-bg': colorString,
        'subtle-fg': colorString,
    })
    .strict();

const feedbackChannel = z
    .object({
        default: colorString,
        bg: colorString,
        fg: colorString,
    })
    .strict();

const feedback = z
    .object({
        success: feedbackChannel,
        warning: feedbackChannel,
        error: feedbackChannel,
        info: feedbackChannel,
    })
    .strict();

const colorTree = z.object({ bg, fg, border, accent, feedback }).strict();

const fontFamily = z.object({ sans: z.string(), mono: z.string() }).strict();

const fontSize = z
    .object({
        xs: z.string(),
        sm: z.string(),
        base: z.string(),
        md: z.string(),
        lg: z.string(),
        xl: z.string(),
        '2xl': z.string(),
        '3xl': z.string(),
    })
    .strict();

const fontWeight = z
    .object({
        regular: z.string(),
        medium: z.string(),
        semibold: z.string(),
        bold: z.string(),
    })
    .strict();

const lineHeight = z
    .object({ tight: z.string(), normal: z.string(), relaxed: z.string() })
    .strict();

const letterSpacing = z
    .object({ tight: z.string(), normal: z.string(), wide: z.string() })
    .strict();

const typography = z
    .object({ family: fontFamily, size: fontSize, weight: fontWeight, lineHeight, letterSpacing })
    .strict();

const spacing = z
    .object({
        '0': z.string(),
        '0.5': z.string(),
        '1': z.string(),
        '1.5': z.string(),
        '2': z.string(),
        '3': z.string(),
        '4': z.string(),
        '5': z.string(),
        '6': z.string(),
        '8': z.string(),
        '10': z.string(),
        '12': z.string(),
        '16': z.string(),
    })
    .strict();

const radius = z
    .object({
        none: z.string(),
        sm: z.string(),
        md: z.string(),
        lg: z.string(),
        xl: z.string(),
        full: z.string(),
    })
    .strict();

const shadow = z
    .object({
        sm: z.string(),
        md: z.string(),
        lg: z.string(),
        overlay: z.string(),
        'focus-ring': z.string(),
    })
    .strict();

const motionDuration = z.object({ fast: z.string(), base: z.string(), slow: z.string() }).strict();
const motionEasing = z
    .object({ standard: z.string(), emphasized: z.string(), exit: z.string() })
    .strict();
const motion = z.object({ duration: motionDuration, easing: motionEasing }).strict();

const zIndexScale = z
    .object({
        base: z.string(),
        dropdown: z.string(),
        sticky: z.string(),
        modal: z.string(),
        popover: z.string(),
        tooltip: z.string(),
        toast: z.string(),
    })
    .strict();

const editor = z
    .object({
        surface: z.object({ bg: colorString }).strict(),
        text: z.object({ body: colorString, muted: colorString }).strict(),
        selection: z.object({ bg: colorString }).strict(),
        cursor: colorString,
        code: z
            .object({
                inline: z.object({ bg: colorString, fg: colorString }).strict(),
                block: z.object({ bg: colorString }).strict(),
            })
            .strict(),
        quote: z.object({ border: colorString }).strict(),
        link: z.object({ fg: colorString, hover: colorString }).strict(),
    })
    .strict();

const workspace = z
    .object({
        bg: z
            .object({
                primary: colorString,
                secondary: colorString,
                tertiary: colorString,
                hover: colorString,
            })
            .strict(),
        fg: z.object({ primary: colorString, muted: colorString }).strict(),
        border: colorString,
        accent: z.object({ default: colorString, foreground: colorString }).strict(),
        icon: colorString,
    })
    .strict();

export const tokenSchema = z
    .object({
        color: colorTree,
        typography,
        spacing,
        radius,
        shadow,
        motion,
        'z-index': zIndexScale,
        editor,
        workspace,
    })
    .strict();

export type ThemeShape = z.infer<typeof tokenSchema>;
