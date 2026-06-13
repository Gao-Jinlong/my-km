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
    typography: {
        family: {
            sans: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', Helvetica, Arial, sans-serif",
            mono: "'SF Mono', 'Monaco', 'Menlo', 'Consolas', monospace",
        },
        size: {
            xs: '0.75rem',
            sm: '0.875rem',
            base: '1rem',
            md: '1.125rem',
            lg: '1.25rem',
            xl: '1.5rem',
            '2xl': '1.875rem',
            '3xl': '2.25rem',
        },
        weight: {
            regular: '400',
            medium: '500',
            semibold: '600',
            bold: '700',
        },
        lineHeight: {
            tight: '1.25',
            normal: '1.5',
            relaxed: '1.75',
        },
        letterSpacing: {
            tight: '-0.01em',
            normal: '0em',
            wide: '0.01em',
        },
    },
    spacing: {
        '0': '0px',
        '0.5': '2px',
        '1': '4px',
        '1.5': '6px',
        '2': '8px',
        '3': '12px',
        '4': '16px',
        '5': '20px',
        '6': '24px',
        '8': '32px',
        '10': '40px',
        '12': '48px',
        '16': '64px',
    },
    radius: { none: '0px', sm: '4px', md: '6px', lg: '8px', xl: '12px', full: '9999px' },
    shadow: {
        sm: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
        md: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
        lg: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
        overlay: '0 0 0 1px rgb(0 0 0 / 0.05), 0 8px 24px rgb(0 0 0 / 0.2)',
        'focus-ring': '0 0 0 2px var(--color-border-focus)',
    },
    motion: {
        duration: { fast: '100ms', base: '150ms', slow: '300ms' },
        easing: {
            standard: 'cubic-bezier(0.4, 0, 0.2, 1)',
            emphasized: 'cubic-bezier(0.2, 0, 0, 1)',
            exit: 'cubic-bezier(0.4, 0, 1, 1)',
        },
    },
    zIndex: {
        base: '0',
        dropdown: '1000',
        sticky: '1100',
        modal: '1200',
        popover: '1300',
        tooltip: '1400',
        toast: '1500',
    },
} as const;

export type Reference = typeof ref;
