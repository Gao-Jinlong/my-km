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
        },
    },
};

export default config;
