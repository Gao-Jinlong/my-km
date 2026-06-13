import { ref } from '../reference';
import type { ThemeShape } from '../schema';
import { alpha } from '../utils';

export const light: ThemeShape = {
    color: {
        bg: {
            primary: ref.gray[0],
            secondary: ref.gray[50],
            tertiary: ref.gray[100],
            hover: '#f3f4f6',
            active: ref.gray[100],
            disabled: ref.gray[50],
            overlay: alpha(ref.gray[1000], 0.5),
        },
        fg: {
            primary: ref.gray[900],
            secondary: ref.gray[700],
            muted: ref.gray[600],
            disabled: ref.gray[400],
            'on-accent': ref.gray[0],
            'on-error': ref.gray[0],
        },
        border: {
            default: ref.gray[200],
            subtle: ref.gray[100],
            strong: ref.gray[300],
            focus: ref.blue[500],
        },
        accent: {
            default: ref.blue[500],
            hover: ref.blue[600],
            active: ref.blue[700],
            'subtle-bg': ref.blue[50],
            'subtle-fg': ref.blue[700],
        },
        feedback: {
            success: { default: ref.green[500], bg: ref.green[50], fg: ref.green[700] },
            warning: { default: ref.yellow[500], bg: ref.yellow[50], fg: ref.yellow[700] },
            error: { default: ref.red[500], bg: ref.red[50], fg: ref.red[700] },
            info: { default: ref.blue[500], bg: ref.blue[50], fg: ref.blue[700] },
        },
    },
    editor: {
        surface: { bg: ref.gray[0] },
        text: { body: ref.gray[900], muted: ref.gray[600] },
        selection: { bg: alpha(ref.blue[500], 0.18) },
        cursor: ref.gray[900],
        code: {
            inline: { bg: ref.gray[100], fg: ref.gray[900] },
            block: { bg: ref.gray[50] },
        },
        quote: { border: ref.gray[200] },
        link: { fg: ref.blue[500], hover: ref.blue[600] },
    },
    workspace: {
        bg: {
            primary: ref.gray[0],
            secondary: ref.gray[50],
            tertiary: ref.gray[100],
            hover: '#f3f4f6',
        },
        fg: { primary: ref.gray[900], muted: ref.gray[600] },
        border: ref.gray[200],
        accent: { default: ref.blue[500], foreground: ref.gray[0] },
        icon: ref.gray[600],
    },
};
