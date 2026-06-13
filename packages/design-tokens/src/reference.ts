/**
 * Tier 1 — reference palette. The ONLY place hex literals appear.
 * Tier 2 (themes/light.ts, themes/dark.ts) must reference these by name.
 */
export const ref = {
    gray: {
        0: '#ffffff',
        50: '#f6f8fa',
        100: '#ebeef1',
        200: '#d0d7de',
        300: '#afb8c1',
        400: '#8c959f',
        500: '#6e7781',
        600: '#636c76',
        700: '#424a53',
        800: '#32383f',
        900: '#1f2328',
        950: '#171b22',
        1000: '#000000',
    },
    blue: {
        50: '#ddf4ff',
        100: '#b6e3ff',
        200: '#80ccff',
        300: '#54aeff',
        400: '#218bff',
        500: '#0969da',
        600: '#0860c7',
        700: '#0550ae',
        800: '#033d8b',
        900: '#0a3069',
    },
    red: {
        50: '#ffebe9',
        100: '#ffcecb',
        300: '#ff8182',
        500: '#d1242f',
        600: '#cf222e',
        700: '#a40e26',
    },
    green: {
        50: '#dafbe1',
        300: '#4ac26b',
        500: '#1a7f37',
        700: '#116329',
    },
    yellow: {
        50: '#fff8c5',
        300: '#d4a72c',
        500: '#9a6700',
        700: '#7d4e00',
    },
    // Dark-theme anchors used by themes/dark.ts. Kept verbatim from the existing
    // `--ws-*` palette in apps/web/src/app/globals.css for a lossless migration.
    darkSurface: {
        bg: '#181818',
        secondary: '#1e1e1e',
        tertiary: '#252525',
        hover: '#2a2a2a',
        border: '#333333',
    },
    darkText: {
        primary: '#cccccc',
        muted: '#999999',
    },
    darkAccent: {
        blue: '#58a6ff',
        red: '#f85149',
    },
} as const;

export type Reference = typeof ref;
