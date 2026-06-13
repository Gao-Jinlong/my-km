/**
 * Tailwind v4 preset. Maps Tailwind utility namespaces to CSS variables emitted
 * by @my-km/design-tokens. With this preset registered, classes like
 * `bg-bg-primary`, `text-fg-muted`, `border-border-default`, `bg-accent-default`
 * resolve to `var(--color-bg-primary)`, etc.
 *
 * Usage in apps/web/tailwind.config.ts:
 *
 *   import preset from '@my-km/design-system/tailwind-preset';
 *   export default { presets: [preset], content: [...] };
 */
import type { Config } from 'tailwindcss';

const cssVar = (name: string) => `var(--${name})`;

const config: Partial<Config> = {
    theme: {
        extend: {
            colors: {
                bg: {
                    primary: cssVar('color-bg-primary'),
                    secondary: cssVar('color-bg-secondary'),
                    tertiary: cssVar('color-bg-tertiary'),
                    hover: cssVar('color-bg-hover'),
                    active: cssVar('color-bg-active'),
                    disabled: cssVar('color-bg-disabled'),
                    overlay: cssVar('color-bg-overlay'),
                },
                fg: {
                    primary: cssVar('color-fg-primary'),
                    secondary: cssVar('color-fg-secondary'),
                    muted: cssVar('color-fg-muted'),
                    disabled: cssVar('color-fg-disabled'),
                    'on-accent': cssVar('color-fg-on-accent'),
                    'on-error': cssVar('color-fg-on-error'),
                },
                border: {
                    DEFAULT: cssVar('color-border-default'),
                    subtle: cssVar('color-border-subtle'),
                    strong: cssVar('color-border-strong'),
                    focus: cssVar('color-border-focus'),
                },
                accent: {
                    DEFAULT: cssVar('color-accent-default'),
                    hover: cssVar('color-accent-hover'),
                    active: cssVar('color-accent-active'),
                    'subtle-bg': cssVar('color-accent-subtle-bg'),
                    'subtle-fg': cssVar('color-accent-subtle-fg'),
                },
            },
            fontFamily: {
                sans: cssVar('typography-family-sans'),
                mono: cssVar('typography-family-mono'),
            },
            fontSize: {
                xs: cssVar('typography-size-xs'),
                sm: cssVar('typography-size-sm'),
                base: cssVar('typography-size-base'),
                md: cssVar('typography-size-md'),
                lg: cssVar('typography-size-lg'),
                xl: cssVar('typography-size-xl'),
                '2xl': cssVar('typography-size-2xl'),
                '3xl': cssVar('typography-size-3xl'),
            },
            fontWeight: {
                regular: cssVar('typography-weight-regular'),
                medium: cssVar('typography-weight-medium'),
                semibold: cssVar('typography-weight-semibold'),
                bold: cssVar('typography-weight-bold'),
            },
            spacing: {
                0: cssVar('spacing-0'),
                0.5: cssVar('spacing-0-5'),
                1: cssVar('spacing-1'),
                1.5: cssVar('spacing-1-5'),
                2: cssVar('spacing-2'),
                3: cssVar('spacing-3'),
                4: cssVar('spacing-4'),
                5: cssVar('spacing-5'),
                6: cssVar('spacing-6'),
                8: cssVar('spacing-8'),
                10: cssVar('spacing-10'),
                12: cssVar('spacing-12'),
                16: cssVar('spacing-16'),
            },
            borderRadius: {
                none: cssVar('radius-none'),
                sm: cssVar('radius-sm'),
                md: cssVar('radius-md'),
                lg: cssVar('radius-lg'),
                xl: cssVar('radius-xl'),
                full: cssVar('radius-full'),
            },
            boxShadow: {
                sm: cssVar('shadow-sm'),
                md: cssVar('shadow-md'),
                lg: cssVar('shadow-lg'),
                overlay: cssVar('shadow-overlay'),
                'focus-ring': cssVar('shadow-focus-ring'),
            },
            transitionDuration: {
                fast: cssVar('motion-duration-fast'),
                base: cssVar('motion-duration-base'),
                slow: cssVar('motion-duration-slow'),
            },
            transitionTimingFunction: {
                standard: cssVar('motion-easing-standard'),
                emphasized: cssVar('motion-easing-emphasized'),
                exit: cssVar('motion-easing-exit'),
            },
            zIndex: {
                base: cssVar('z-index-base'),
                dropdown: cssVar('z-index-dropdown'),
                sticky: cssVar('z-index-sticky'),
                modal: cssVar('z-index-modal'),
                popover: cssVar('z-index-popover'),
                tooltip: cssVar('z-index-tooltip'),
                toast: cssVar('z-index-toast'),
            },
        },
    },
};

export default config;
