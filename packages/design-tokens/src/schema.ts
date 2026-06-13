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
        editor,
        workspace,
    })
    .strict();

export type ThemeShape = z.infer<typeof tokenSchema>;
