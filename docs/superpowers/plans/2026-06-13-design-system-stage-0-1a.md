# my-km Design System — Stage 0 + Stage 1a Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the `packages/design-tokens` package, generate token CSS / TS / JSON / d.ts artifacts from a single TypeScript source, and refactor `apps/web/src/app/globals.css` to consume the generated tokens — without touching any business component code.

**Architecture:** Add two new workspace packages (`@my-km/design-tokens` and a `@my-km/design-system` shell) plus a Storybook app shell. The tokens package owns reference (Tier 1) + light/dark themes (Tier 2/3) as pure TypeScript constants; a build script validates both themes share an identical shape (zod) and emits `tokens.css`, `tokens.ts`, `tokens.json`, `tokens.d.ts`. `apps/web` imports the generated CSS instead of hand-maintained CSS variables and switches the dark-mode hook from `class="dark"` to `data-theme="dark"`. The `design-system` package and Storybook app are scaffolded empty in this plan and will be filled in plan #2 (primitives migration).

**Tech Stack:** TypeScript 5.7 · pnpm workspaces · turbo · Zod (token shape validation) · Tailwind v4 (`@theme inline`) · Storybook 8 + Vite (scaffold only) · Biome (lint).

**Scope notes:**
- This plan **does not** migrate primitives, write patterns, or remove `apps/web/src/components/ui`. Those are plan #2.
- This plan **does not** wire Pencil sync or AI-agent index generation. Those are plan #3 (governance).
- This plan **does** set up the package skeletons, the token build pipeline, the `data-theme` switch, and matching unit tests so the foundation is shippable on its own.
- The mapping from existing `oklch(...)` values in `globals.css` to Tier 1 hex references is intentionally lossless: Stage 1a relocates current values verbatim; deeper refactor of values happens in Stage 1b (separate plan) once the pipeline is verified end-to-end.

---

## File Structure

**Created files:**

```
packages/design-tokens/
  package.json
  tsconfig.json
  tsconfig.build.json
  src/
    index.ts                  # public API
    reference.ts              # Tier 1 raw color/scale palette
    schema.ts                 # zod schema for theme shape
    themes/
      light.ts                # Tier 2/3 light mapping
      dark.ts                 # Tier 2/3 dark mapping
      index.ts                # themes registry
    utils.ts                  # alpha() helper, flatten(), toCssVar()
  scripts/
    build.ts                  # generates dist/* artifacts
    verify.ts                 # validates theme shapes match (CI)
  __tests__/
    reference.test.ts
    themes.test.ts
    build.test.ts
  dist/                       # generated output (gitignored)
  README.md

packages/design-system/
  package.json
  tsconfig.json
  src/
    index.ts                  # empty barrel for now
    tailwind-preset.ts        # Tailwind v4 preset reading tokens
  README.md

apps/storybook/
  package.json
  tsconfig.json
  .storybook/
    main.ts
    preview.ts
  src/
    welcome.mdx               # placeholder welcome page
  README.md

docs/design-system/decisions/
  0001-token-tiering.md
  0002-package-layout.md
  0003-api-conventions.md
  0004-primitive-vs-pattern.md
```

**Modified files:**

- `pnpm-workspace.yaml` — already covers `packages/*` and `apps/*`, **no edit needed**, just verify.
- `turbo.json` — add a `tokens:build` task and ensure `build` covers the new packages.
- `apps/web/package.json` — add `@my-km/design-tokens` and `@my-km/design-system` workspace deps.
- `apps/web/src/app/globals.css` — replace inline `:root` + `.dark` blocks with `@import "@my-km/design-tokens/dist/tokens.css"` and switch `.dark` selector to `[data-theme="dark"]`.
- `apps/web/src/app/layout.tsx` — set initial `data-theme="light"` on `<html>`.
- `apps/web/tsconfig.json` — add path entries for the two new workspace packages.
- `AGENTS.md` — append a `## Design System` section linking the spec and ADRs.
- `.gitignore` — ensure `packages/*/dist/` is ignored.

---

## Task 1: Scaffold the `@my-km/design-tokens` package

**Files:**
- Create: `packages/design-tokens/package.json`
- Create: `packages/design-tokens/tsconfig.json`
- Create: `packages/design-tokens/tsconfig.build.json`
- Create: `packages/design-tokens/src/index.ts`
- Create: `packages/design-tokens/README.md`
- Modify: `.gitignore`

- [ ] **Step 1.1: Create package.json**

Write `packages/design-tokens/package.json`:

```json
{
  "name": "@my-km/design-tokens",
  "version": "0.0.0",
  "private": true,
  "description": "Design tokens for my-km — single source of truth for color/typography/spacing/motion",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "default": "./src/index.ts"
    },
    "./dist/tokens.css": "./dist/tokens.css",
    "./dist/tokens.json": "./dist/tokens.json",
    "./dist/tokens.ts": {
      "types": "./dist/tokens.d.ts",
      "default": "./dist/tokens.ts"
    }
  },
  "scripts": {
    "build": "tsx scripts/build.ts",
    "verify": "tsx scripts/verify.ts",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "biome check ."
  },
  "dependencies": {
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "tsx": "^4.19.2",
    "typescript": "^5.7.3",
    "vitest": "^2.1.8",
    "@types/node": "^22.11.0"
  }
}
```

- [ ] **Step 1.2: Create tsconfig**

Write `packages/design-tokens/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "outDir": "dist"
  },
  "include": ["src/**/*", "scripts/**/*", "__tests__/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

Write `packages/design-tokens/tsconfig.build.json`:

```json
{
  "extends": "./tsconfig.json",
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "__tests__/**", "scripts/**"]
}
```

- [ ] **Step 1.3: Create the placeholder index.ts**

Write `packages/design-tokens/src/index.ts`:

```ts
export { ref } from './reference';
export { themes, type ThemeName } from './themes';
export { tokenSchema, type ThemeShape } from './schema';
```

(Files referenced are created in later tasks; this file will fail to typecheck until then. Intentional — keeps task ordering linear.)

- [ ] **Step 1.4: Create README**

Write `packages/design-tokens/README.md`:

````markdown
# @my-km/design-tokens

Single source of truth for my-km design tokens.

See `docs/design-system/spec.md` §2 and `docs/design-system/decisions/0001-token-tiering.md`.

## Scripts

- `pnpm build` — generates `dist/tokens.css`, `dist/tokens.ts`, `dist/tokens.json`, `dist/tokens.d.ts`
- `pnpm verify` — validates light/dark theme shapes match
- `pnpm test` — runs vitest

## Consumption

```css
@import "@my-km/design-tokens/dist/tokens.css";
```

```ts
import { tokens } from '@my-km/design-tokens/dist/tokens';
```
````

- [ ] **Step 1.5: Update .gitignore**

Check first whether the root `.gitignore` already ignores `dist/`. If not, append:

```
# design-tokens build output
packages/*/dist/
```

- [ ] **Step 1.6: Install deps**

Run:

```bash
pnpm install
```

Expected: pnpm registers the new workspace package and installs `zod`, `tsx`, `vitest`. No errors.

- [ ] **Step 1.7: Commit**

```bash
git add packages/design-tokens/package.json packages/design-tokens/tsconfig.json packages/design-tokens/tsconfig.build.json packages/design-tokens/src/index.ts packages/design-tokens/README.md .gitignore pnpm-lock.yaml
git commit -m "chore(design-tokens): scaffold @my-km/design-tokens package"
```

---

## Task 2: Define the Tier 1 reference palette + utils

**Files:**
- Create: `packages/design-tokens/src/utils.ts`
- Create: `packages/design-tokens/src/reference.ts`
- Create: `packages/design-tokens/__tests__/reference.test.ts`

The reference palette is the only place hex values live. It must be exhaustive enough to source every Tier 2 token added in Task 4.

- [ ] **Step 2.1: Write the failing test**

Write `packages/design-tokens/__tests__/reference.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ref } from '../src/reference';
import { alpha } from '../src/utils';

describe('reference palette', () => {
  it('exposes a gray scale with anchor stops', () => {
    expect(ref.gray[0]).toBe('#ffffff');
    expect(ref.gray[900]).toBe('#1f2328');
    expect(ref.gray[1000]).toBe('#000000');
  });

  it('exposes a blue scale with brand accent at 500', () => {
    expect(ref.blue[500]).toBe('#0969da');
  });

  it('exposes feedback color anchors', () => {
    expect(ref.red[500]).toBe('#d1242f');
    expect(ref.green[500]).toBeDefined();
    expect(ref.yellow[500]).toBeDefined();
  });

  it('every reference value is a 7-char lowercase hex', () => {
    const visit = (node: unknown): string[] => {
      if (typeof node === 'string') return [node];
      if (node && typeof node === 'object') {
        return Object.values(node as Record<string, unknown>).flatMap(visit);
      }
      return [];
    };
    const all = visit(ref);
    expect(all.length).toBeGreaterThan(20);
    for (const value of all) {
      expect(value).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});

describe('alpha()', () => {
  it('appends an 8-bit alpha channel to a 6-digit hex', () => {
    expect(alpha('#0969da', 1)).toBe('#0969daff');
    expect(alpha('#0969da', 0)).toBe('#0969da00');
    expect(alpha('#0969da', 0.18)).toBe('#0969da2e');
  });

  it('throws on invalid hex', () => {
    expect(() => alpha('blue', 0.5)).toThrow();
  });

  it('clamps alpha to [0, 1]', () => {
    expect(alpha('#000000', -1)).toBe('#00000000');
    expect(alpha('#000000', 2)).toBe('#000000ff');
  });
});
```

- [ ] **Step 2.2: Run the test to confirm it fails**

Run:

```bash
pnpm --filter @my-km/design-tokens test
```

Expected: vitest fails with "Cannot find module '../src/reference'" (and similar for utils).

- [ ] **Step 2.3: Implement utils.ts**

Write `packages/design-tokens/src/utils.ts`:

```ts
const HEX6 = /^#[0-9a-f]{6}$/;

/**
 * Append an alpha channel to a 6-digit lowercase hex color.
 * Returns an 8-digit hex (e.g. `#0969da2e`).
 */
export function alpha(hex: string, ratio: number): string {
  if (!HEX6.test(hex)) {
    throw new Error(`alpha(): expected 7-char lowercase hex, got ${JSON.stringify(hex)}`);
  }
  const clamped = Math.min(1, Math.max(0, ratio));
  const byte = Math.round(clamped * 255).toString(16).padStart(2, '0');
  return `${hex}${byte}`;
}

/** Convert a dotted token path to a CSS variable name: `color.bg.primary` → `--color-bg-primary` */
export function toCssVar(path: string): string {
  return `--${path.replace(/\./g, '-')}`;
}

/** Flatten a nested token tree into a flat record keyed by dotted path. */
export function flatten(
  node: unknown,
  prefix: string[] = [],
  out: Record<string, string> = {},
): Record<string, string> {
  if (typeof node === 'string') {
    out[prefix.join('.')] = node;
    return out;
  }
  if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      flatten(value, [...prefix, key], out);
    }
  }
  return out;
}
```

- [ ] **Step 2.4: Implement reference.ts**

Write `packages/design-tokens/src/reference.ts`:

```ts
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
```

- [ ] **Step 2.5: Run the test to confirm it passes**

Run:

```bash
pnpm --filter @my-km/design-tokens test
```

Expected: all tests pass.

- [ ] **Step 2.6: Commit**

```bash
git add packages/design-tokens/src/reference.ts packages/design-tokens/src/utils.ts packages/design-tokens/__tests__/reference.test.ts
git commit -m "feat(design-tokens): add Tier 1 reference palette and color utils"
```

---

## Task 3: Define the theme shape schema

**Files:**
- Create: `packages/design-tokens/src/schema.ts`
- Create: `packages/design-tokens/__tests__/schema.test.ts`

The schema both documents the canonical Tier 2/3 shape AND validates at runtime that light and dark themes match. Spec §2.2 lists the categories.

- [ ] **Step 3.1: Write the failing test**

Write `packages/design-tokens/__tests__/schema.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { tokenSchema } from '../src/schema';

const validTheme = {
  color: {
    bg: { primary: '#fff', secondary: '#fff', tertiary: '#fff', hover: '#fff', active: '#fff', disabled: '#fff', overlay: '#fff' },
    fg: { primary: '#fff', secondary: '#fff', muted: '#fff', disabled: '#fff', 'on-accent': '#fff', 'on-error': '#fff' },
    border: { default: '#fff', subtle: '#fff', strong: '#fff', focus: '#fff' },
    accent: { default: '#fff', hover: '#fff', active: '#fff', 'subtle-bg': '#fff', 'subtle-fg': '#fff' },
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
```

- [ ] **Step 3.2: Run the test to confirm it fails**

Run:

```bash
pnpm --filter @my-km/design-tokens test schema
```

Expected: fails with "Cannot find module '../src/schema'".

- [ ] **Step 3.3: Implement schema.ts**

Write `packages/design-tokens/src/schema.ts`:

```ts
import { z } from 'zod';

const colorString = z.string().min(4); // accept #fff, #ffffff, #ffffffff, oklch(...), rgb(...)

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
      .object({ primary: colorString, secondary: colorString, tertiary: colorString, hover: colorString })
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
```

- [ ] **Step 3.4: Run the test to confirm it passes**

Run:

```bash
pnpm --filter @my-km/design-tokens test schema
```

Expected: all schema tests pass.

- [ ] **Step 3.5: Commit**

```bash
git add packages/design-tokens/src/schema.ts packages/design-tokens/__tests__/schema.test.ts
git commit -m "feat(design-tokens): add zod schema for theme shape"
```

---

## Task 4: Define light + dark theme mappings

**Files:**
- Create: `packages/design-tokens/src/themes/light.ts`
- Create: `packages/design-tokens/src/themes/dark.ts`
- Create: `packages/design-tokens/src/themes/index.ts`
- Create: `packages/design-tokens/__tests__/themes.test.ts`

Mappings preserve current visible values from `apps/web/src/app/globals.css` (the existing `--ws-*` block + sensible defaults for the other categories). The only **new** behaviour is structure: every value goes through Tier 1 references.

- [ ] **Step 4.1: Write the failing test**

Write `packages/design-tokens/__tests__/themes.test.ts`:

```ts
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
});
```

- [ ] **Step 4.2: Run the test to confirm it fails**

Run:

```bash
pnpm --filter @my-km/design-tokens test themes
```

Expected: fails with "Cannot find module '../src/themes'".

- [ ] **Step 4.3: Implement light.ts**

Write `packages/design-tokens/src/themes/light.ts`:

```ts
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
```

- [ ] **Step 4.4: Implement dark.ts**

Write `packages/design-tokens/src/themes/dark.ts`:

```ts
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
      success: { default: ref.green[300], bg: alpha(ref.green[500], 0.15), fg: ref.green[300] },
      warning: { default: ref.yellow[300], bg: alpha(ref.yellow[500], 0.15), fg: ref.yellow[300] },
      error: { default: ref.darkAccent.red, bg: alpha(ref.red[500], 0.15), fg: ref.red[300] },
      info: { default: ref.darkAccent.blue, bg: alpha(ref.blue[500], 0.15), fg: ref.blue[300] },
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
};
```

- [ ] **Step 4.5: Implement themes/index.ts**

Write `packages/design-tokens/src/themes/index.ts`:

```ts
import { light } from './light';
import { dark } from './dark';

export const themes = { light, dark } as const;

export type ThemeName = keyof typeof themes;
```

- [ ] **Step 4.6: Run the test to confirm it passes**

Run:

```bash
pnpm --filter @my-km/design-tokens test
```

Expected: every test (reference, schema, themes) passes.

- [ ] **Step 4.7: Commit**

```bash
git add packages/design-tokens/src/themes packages/design-tokens/__tests__/themes.test.ts
git commit -m "feat(design-tokens): add light and dark Tier 2/3 mappings"
```

---

## Task 5: Build the token generator script

**Files:**
- Create: `packages/design-tokens/scripts/build.ts`
- Create: `packages/design-tokens/scripts/verify.ts`
- Create: `packages/design-tokens/__tests__/build.test.ts`

The build script reads `themes/{light,dark}.ts`, validates them via `tokenSchema`, then emits four artifacts. The verify script is a thin wrapper that only runs validation (used in CI when full build is not needed).

- [ ] **Step 5.1: Write the failing test**

Write `packages/design-tokens/__tests__/build.test.ts`:

```ts
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const pkgDir = resolve(__dirname, '..');
const distDir = resolve(pkgDir, 'dist');

describe('token build pipeline', () => {
  beforeAll(() => {
    rmSync(distDir, { recursive: true, force: true });
    execSync('pnpm build', { cwd: pkgDir, stdio: 'inherit' });
  });

  afterAll(() => {
    // Leave dist/ in place after the test for downstream tasks; the
    // beforeAll() of the next run will clean it.
  });

  it('emits all four artifacts', () => {
    expect(existsSync(resolve(distDir, 'tokens.css'))).toBe(true);
    expect(existsSync(resolve(distDir, 'tokens.ts'))).toBe(true);
    expect(existsSync(resolve(distDir, 'tokens.json'))).toBe(true);
    expect(existsSync(resolve(distDir, 'tokens.d.ts'))).toBe(true);
  });

  it('tokens.css has root + dark scoped blocks', () => {
    const css = readFileSync(resolve(distDir, 'tokens.css'), 'utf8');
    expect(css).toMatch(/:root,\s*\[data-theme="light"\]\s*\{/);
    expect(css).toMatch(/\[data-theme="dark"\]\s*\{/);
    expect(css).toMatch(/--color-bg-primary:\s*#ffffff;/);
    expect(css).toMatch(/--workspace-accent-default:\s*#0969da;/);
  });

  it('tokens.css scopes dark workspace accent to the dark anchor', () => {
    const css = readFileSync(resolve(distDir, 'tokens.css'), 'utf8');
    const darkBlock = css.split('[data-theme="dark"]')[1] ?? '';
    expect(darkBlock).toMatch(/--workspace-accent-default:\s*#58a6ff;/);
  });

  it('tokens.json mirrors the schema shape', () => {
    const json = JSON.parse(readFileSync(resolve(distDir, 'tokens.json'), 'utf8')) as Record<string, unknown>;
    expect(json).toHaveProperty('themes.light.color.bg.primary', '#ffffff');
    expect(json).toHaveProperty('themes.dark.color.bg.primary', '#181818');
  });

  it('tokens.ts re-exports CSS-var bindings', () => {
    const ts = readFileSync(resolve(distDir, 'tokens.ts'), 'utf8');
    expect(ts).toContain("'var(--color-bg-primary)'");
    expect(ts).toContain('export const tokens');
  });

  it('tokens.d.ts declares typed token tree', () => {
    const dts = readFileSync(resolve(distDir, 'tokens.d.ts'), 'utf8');
    expect(dts).toContain('export declare const tokens');
  });
});
```

- [ ] **Step 5.2: Run the test to confirm it fails**

Run:

```bash
pnpm --filter @my-km/design-tokens test build
```

Expected: fails because `pnpm build` fails (script not implemented yet).

- [ ] **Step 5.3: Implement scripts/build.ts**

Write `packages/design-tokens/scripts/build.ts`:

```ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ref } from '../src/reference';
import { tokenSchema, type ThemeShape } from '../src/schema';
import { themes } from '../src/themes';
import { flatten, toCssVar } from '../src/utils';

const distDir = resolve(__dirname, '..', 'dist');
mkdirSync(distDir, { recursive: true });

// 1. Validate every theme up front. Bail with a readable error.
for (const [name, theme] of Object.entries(themes)) {
  const result = tokenSchema.safeParse(theme);
  if (!result.success) {
    console.error(`Theme "${name}" failed validation:`);
    console.error(result.error.format());
    process.exit(1);
  }
}

// 2. Emit tokens.css — :root for light + scoped block for dark.
const lightFlat = flatten(themes.light);
const darkFlat = flatten(themes.dark);

const cssBody = (entries: Record<string, string>): string =>
  Object.entries(entries)
    .map(([path, value]) => `  ${toCssVar(path)}: ${value};`)
    .join('\n');

const cssOut = `/* Generated by @my-km/design-tokens. Do not edit by hand. */\n\n:root,\n[data-theme="light"] {\n${cssBody(lightFlat)}\n}\n\n[data-theme="dark"] {\n${cssBody(darkFlat)}\n}\n`;
writeFileSync(resolve(distDir, 'tokens.css'), cssOut);

// 3. Emit tokens.json (raw values, both themes + reference).
const jsonOut = {
  reference: ref,
  themes: themes as Record<string, ThemeShape>,
};
writeFileSync(resolve(distDir, 'tokens.json'), `${JSON.stringify(jsonOut, null, 2)}\n`);

// 4. Emit tokens.ts — a typed object whose leaves are `var(--xxx)` strings.
const cssVarTree = (input: unknown, prefix: string[] = []): unknown => {
  if (typeof input === 'string') {
    return `var(${toCssVar(prefix.join('.'))})`;
  }
  if (input && typeof input === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      out[key] = cssVarTree(value, [...prefix, key]);
    }
    return out;
  }
  return input;
};

const tokensVarTree = cssVarTree(themes.light);
const tsOut = `// Generated by @my-km/design-tokens. Do not edit by hand.\n\nexport const tokens = ${JSON.stringify(tokensVarTree, null, 2)} as const;\n\nexport type Tokens = typeof tokens;\n`;
writeFileSync(resolve(distDir, 'tokens.ts'), tsOut);

// 5. Emit tokens.d.ts — narrower types for IDE hovers.
const dtsOut = `// Generated by @my-km/design-tokens. Do not edit by hand.\n\nexport declare const tokens: ${typeAnnotation(tokensVarTree)};\nexport type Tokens = typeof tokens;\n`;
writeFileSync(resolve(distDir, 'tokens.d.ts'), dtsOut);

function typeAnnotation(node: unknown): string {
  if (typeof node === 'string') return 'string';
  if (node && typeof node === 'object') {
    const entries = Object.entries(node as Record<string, unknown>)
      .map(([key, value]) => `  readonly ${JSON.stringify(key)}: ${typeAnnotation(value)};`)
      .join('\n');
    return `{\n${entries}\n}`;
  }
  return 'unknown';
}

console.log(`✓ Wrote ${Object.keys(lightFlat).length} tokens × 2 themes to ${distDir}`);
```

- [ ] **Step 5.4: Implement scripts/verify.ts**

Write `packages/design-tokens/scripts/verify.ts`:

```ts
import { tokenSchema } from '../src/schema';
import { themes } from '../src/themes';

let failed = false;
for (const [name, theme] of Object.entries(themes)) {
  const result = tokenSchema.safeParse(theme);
  if (!result.success) {
    failed = true;
    console.error(`Theme "${name}" failed:`, result.error.format());
  } else {
    console.log(`✓ ${name}`);
  }
}
process.exit(failed ? 1 : 0);
```

- [ ] **Step 5.5: Run the test to confirm it passes**

Run:

```bash
pnpm --filter @my-km/design-tokens test build
```

Expected: build executes, all 6 build-test assertions pass.

Also run the verify script standalone:

```bash
pnpm --filter @my-km/design-tokens verify
```

Expected: prints `✓ light` and `✓ dark`, exit 0.

- [ ] **Step 5.6: Commit**

```bash
git add packages/design-tokens/scripts packages/design-tokens/__tests__/build.test.ts
git commit -m "feat(design-tokens): add build pipeline emitting css/ts/json/d.ts"
```

---

## Task 6: Scaffold the `@my-km/design-system` shell package

**Files:**
- Create: `packages/design-system/package.json`
- Create: `packages/design-system/tsconfig.json`
- Create: `packages/design-system/src/index.ts`
- Create: `packages/design-system/src/tailwind-preset.ts`
- Create: `packages/design-system/README.md`

This package will host primitives + patterns in plan #2. For Stage 0/1a we ship only the empty barrel and a Tailwind v4 preset that re-exports the token CSS so `apps/web` consumes the system through one stable import point.

- [ ] **Step 6.1: Create package.json**

Write `packages/design-system/package.json`:

```json
{
  "name": "@my-km/design-system",
  "version": "0.0.0",
  "private": true,
  "description": "Primitives, patterns, and Tailwind preset for my-km",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "default": "./src/index.ts"
    },
    "./tailwind-preset": {
      "types": "./src/tailwind-preset.ts",
      "default": "./src/tailwind-preset.ts"
    },
    "./tokens.css": "../design-tokens/dist/tokens.css"
  },
  "scripts": {
    "test": "vitest run",
    "lint": "biome check ."
  },
  "dependencies": {
    "@my-km/design-tokens": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^5.7.3",
    "vitest": "^2.1.8"
  }
}
```

- [ ] **Step 6.2: Create tsconfig.json**

Write `packages/design-system/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "jsx": "react-jsx"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 6.3: Create the empty barrel**

Write `packages/design-system/src/index.ts`:

```ts
// @my-km/design-system — populated in plan #2 (primitives migration).
// Stage 0/1a only ships the package shell + Tailwind preset.

export {};
```

- [ ] **Step 6.4: Create the Tailwind preset**

Write `packages/design-system/src/tailwind-preset.ts`:

```ts
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
        // Workspace + editor namespaces are intentionally NOT mapped here yet —
        // they ship in plan #2 once consumers exist. Token CSS variables are
        // already emitted, so anyone who needs them can reach for var(...) directly.
      },
    },
  },
};

export default config;
```

- [ ] **Step 6.5: Create README**

Write `packages/design-system/README.md`:

```markdown
# @my-km/design-system

Primitives + patterns + Tailwind preset for my-km. See `docs/design-system/spec.md`.

This package is a **shell** in Stage 0/1a — populated in plan #2.

## Tailwind preset

```ts
// apps/web/tailwind.config.ts
import preset from '@my-km/design-system/tailwind-preset';

export default {
  presets: [preset],
  content: ['./src/**/*.{ts,tsx,mdx}'],
};
```
```

- [ ] **Step 6.6: Install + commit**

Run:

```bash
pnpm install
```

Expected: pnpm registers the package; the `workspace:*` link to design-tokens resolves.

```bash
git add packages/design-system pnpm-lock.yaml
git commit -m "chore(design-system): scaffold @my-km/design-system shell + tailwind preset"
```

---

## Task 7: Scaffold the `apps/storybook` shell

**Files:**
- Create: `apps/storybook/package.json`
- Create: `apps/storybook/tsconfig.json`
- Create: `apps/storybook/.storybook/main.ts`
- Create: `apps/storybook/.storybook/preview.ts`
- Create: `apps/storybook/src/welcome.mdx`
- Create: `apps/storybook/README.md`

Stage 0 only proves Storybook builds; stories arrive in plan #2.

- [ ] **Step 7.1: Create package.json**

Write `apps/storybook/package.json`:

```json
{
  "name": "@my-km/storybook",
  "version": "0.0.0",
  "private": true,
  "description": "Living documentation for the my-km design system",
  "scripts": {
    "dev": "storybook dev -p 6006",
    "build": "storybook build -o dist",
    "lint": "biome check ."
  },
  "dependencies": {
    "@my-km/design-system": "workspace:*",
    "@my-km/design-tokens": "workspace:*",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@storybook/addon-a11y": "^8.4.7",
    "@storybook/addon-essentials": "^8.4.7",
    "@storybook/addon-themes": "^8.4.7",
    "@storybook/blocks": "^8.4.7",
    "@storybook/react": "^8.4.7",
    "@storybook/react-vite": "^8.4.7",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.4",
    "storybook": "^8.4.7",
    "typescript": "^5.7.3",
    "vite": "^6.0.3"
  }
}
```

- [ ] **Step 7.2: Create tsconfig.json**

Write `apps/storybook/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["DOM", "DOM.Iterable", "ES2022"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "resolveJsonModule": true,
    "jsx": "react-jsx",
    "noEmit": true
  },
  "include": ["src/**/*", ".storybook/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 7.3: Create main.ts**

Write `apps/storybook/.storybook/main.ts`:

```ts
import type { StorybookConfig } from '@storybook/react-vite';

const config: StorybookConfig = {
  framework: '@storybook/react-vite',
  stories: [
    '../src/**/*.mdx',
    '../src/**/*.stories.@(ts|tsx)',
    // Stories from packages/design-system will be picked up here in plan #2:
    // '../../../packages/design-system/src/**/*.stories.@(ts|tsx)',
  ],
  addons: [
    '@storybook/addon-essentials',
    '@storybook/addon-a11y',
    '@storybook/addon-themes',
  ],
  core: { disableTelemetry: true },
};

export default config;
```

- [ ] **Step 7.4: Create preview.ts**

Write `apps/storybook/.storybook/preview.ts`:

```ts
import type { Preview } from '@storybook/react';
import { withThemeByDataAttribute } from '@storybook/addon-themes';
import '@my-km/design-tokens/dist/tokens.css';

const preview: Preview = {
  parameters: {
    layout: 'centered',
    controls: { expanded: true },
  },
  decorators: [
    withThemeByDataAttribute({
      themes: { light: 'light', dark: 'dark' },
      defaultTheme: 'light',
      attributeName: 'data-theme',
    }),
  ],
};

export default preview;
```

- [ ] **Step 7.5: Create welcome.mdx**

Write `apps/storybook/src/welcome.mdx`:

```mdx
import { Meta } from '@storybook/blocks';

<Meta title="Welcome" />

# my-km Design System

This is the living documentation for the my-km design system.

For now this site only renders this welcome page — primitives and patterns will
be populated in plan #2 ("primitives migration").

See:

- `docs/design-system/spec.md` — full specification
- `docs/design-system/decisions/` — ADRs
- `packages/design-tokens` — token source
- `packages/design-system` — primitives + patterns (empty for now)

Use the **Theme** toolbar (top of the canvas) to switch between light and dark.
```

- [ ] **Step 7.6: Create README**

Write `apps/storybook/README.md`:

```markdown
# @my-km/storybook

Storybook site for the my-km design system.

```bash
pnpm --filter @my-km/storybook dev    # http://localhost:6006
pnpm --filter @my-km/storybook build  # static site to dist/
```
```

- [ ] **Step 7.7: Install and verify build**

Run:

```bash
pnpm install
pnpm --filter @my-km/design-tokens build
pnpm --filter @my-km/storybook build
```

Expected:
- pnpm install succeeds; storybook + addons resolve.
- design-tokens build emits `dist/tokens.css`.
- storybook build emits `apps/storybook/dist/` containing `index.html`.

- [ ] **Step 7.8: Commit**

```bash
git add apps/storybook pnpm-lock.yaml
git commit -m "chore(storybook): scaffold @my-km/storybook with welcome page"
```

---

## Task 8: Wire `apps/web` to consume the generated tokens

**Files:**
- Modify: `apps/web/package.json`
- Modify: `apps/web/tsconfig.json`
- Modify: `apps/web/tailwind.config.ts`
- Modify: `apps/web/src/app/globals.css`
- Modify: `apps/web/src/app/layout.tsx`

This task is the visible payoff: `apps/web` no longer hand-maintains the `--ws-*` block; it imports the generated CSS, and the dark hook moves from `class="dark"` to `data-theme="dark"`.

**Pre-flight:** before editing, run `pnpm --filter @my-km/design-tokens build` so `dist/tokens.css` exists locally. Without this, the next dev/build of `apps/web` will fail to resolve the CSS import.

- [ ] **Step 8.1: Add workspace deps to apps/web/package.json**

Edit `apps/web/package.json` — under `"dependencies"`, add (alphabetised among existing entries):

```json
"@my-km/design-system": "workspace:*",
"@my-km/design-tokens": "workspace:*",
```

- [ ] **Step 8.2: Add path mappings to apps/web/tsconfig.json**

Edit the `compilerOptions.paths` block in `apps/web/tsconfig.json` to add:

```json
"@my-km/design-tokens": ["../../packages/design-tokens/src"],
"@my-km/design-tokens/*": ["../../packages/design-tokens/src/*"],
"@my-km/design-system": ["../../packages/design-system/src"],
"@my-km/design-system/*": ["../../packages/design-system/src/*"]
```

(Insert these alongside the existing `@workspace/shared` entries; keep the existing entries.)

- [ ] **Step 8.3: Plug the Tailwind preset into apps/web/tailwind.config.ts**

Edit the top of `apps/web/tailwind.config.ts` to import the preset and register it:

```ts
import type { Config } from 'tailwindcss';
import dsPreset from '@my-km/design-system/tailwind-preset';

const config: Config = {
    presets: [dsPreset],
    darkMode: ['selector', '[data-theme="dark"]'],
    content: [
        './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
        './src/components/**/*.{js,ts,jsx,tsx,mdx}',
        './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    ],
    // ... keep the rest of the existing config below
```

Notes:
- Keep the existing `theme.extend.colors` block. Tailwind merges them; the preset adds the `bg`, `fg`, `border`, `accent` namespaces; the existing `--background`, `--card`, `--popover`, `--sidebar`, `--ws-*` mappings stay until plan #2 retires them.
- `darkMode: ['selector', '[data-theme="dark"]']` makes existing `dark:...` utilities fire under the new attribute.

- [ ] **Step 8.4: Refactor apps/web/src/app/globals.css**

Replace the entire file with:

```css
@import 'tailwindcss';
@import '@my-km/design-tokens/dist/tokens.css';

@plugin "tailwindcss-animate";

@custom-variant dark (&:is([data-theme="dark"] *));

@theme inline {
    --font-sans: var(--font-geist-sans);
    --font-mono: var(--font-geist-mono);

    /* Bridge the legacy `--background` / `--foreground` / `--card` / `--popover`
       / `--ws-*` names that existing components still rely on to the new
       generated tokens. These bridges are removed in plan #2. */
    --color-background: var(--color-bg-primary);
    --color-foreground: var(--color-fg-primary);
    --color-card: var(--color-bg-primary);
    --color-card-foreground: var(--color-fg-primary);
    --color-popover: var(--color-bg-primary);
    --color-popover-foreground: var(--color-fg-primary);
    --color-primary: var(--color-fg-primary);
    --color-primary-foreground: var(--color-bg-primary);
    --color-secondary: var(--color-bg-secondary);
    --color-secondary-foreground: var(--color-fg-primary);
    --color-muted: var(--color-bg-secondary);
    --color-muted-foreground: var(--color-fg-muted);
    --color-accent: var(--color-bg-secondary);
    --color-accent-foreground: var(--color-fg-primary);
    --color-destructive: var(--color-feedback-error-default);
    --color-border: var(--color-border-default);
    --color-input: var(--color-border-default);
    --color-ring: var(--color-border-focus);

    --color-ws-bg-primary: var(--workspace-bg-primary);
    --color-ws-bg-secondary: var(--workspace-bg-secondary);
    --color-ws-bg-tertiary: var(--workspace-bg-tertiary);
    --color-ws-bg-hover: var(--workspace-bg-hover);
    --color-ws-border: var(--workspace-border);
    --color-ws-fg-primary: var(--workspace-fg-primary);
    --color-ws-fg-muted: var(--workspace-fg-muted);
    --color-ws-accent: var(--workspace-accent-default);
    --color-ws-accent-foreground: var(--workspace-accent-foreground);
    --color-ws-icon: var(--workspace-icon);

    --radius-sm: calc(var(--radius) - 4px);
    --radius-md: calc(var(--radius) - 2px);
    --radius-lg: var(--radius);
    --radius-xl: calc(var(--radius) + 4px);
    --radius-2xl: calc(var(--radius) + 8px);
    --radius-3xl: calc(var(--radius) + 12px);
    --radius-4xl: calc(var(--radius) + 16px);
}

:root {
    --radius: 0.625rem;
}

@layer base {
    * {
        @apply border-ws-border;
    }
    body {
        @apply bg-ws-bg-primary text-ws-fg-primary antialiased transition-colors duration-200;
    }
}
```

This deletes ~120 lines of hand-maintained `:root` / `.dark` blocks. The bridge `@theme inline` rules keep every existing utility class (`bg-background`, `bg-ws-bg-primary`, `dark:bg-...`, etc.) working unchanged.

- [ ] **Step 8.5: Switch the html element to data-theme**

Edit `apps/web/src/app/layout.tsx`. Find the `<html>` line and change:

```tsx
<html lang="zh-CN">
```

to:

```tsx
<html lang="zh-CN" data-theme="light" suppressHydrationWarning>
```

(`suppressHydrationWarning` is for the future theme provider that will flip the attribute pre-paint.)

If any other code in the app toggles the dark theme via `document.documentElement.classList.toggle('dark', ...)`, search and update it to set `data-theme` instead. Run:

```bash
rg -n "classList\\.(add|remove|toggle)\\(.dark." apps/web/src
rg -n "document\\.documentElement\\.classList" apps/web/src
```

For each hit, change `'dark'` class operations to:

```ts
document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
```

If no hits: skip — the dark theme isn't toggled at runtime yet, and the static `light` default is fine.

- [ ] **Step 8.6: Verify the web app still builds and renders**

Run:

```bash
pnpm install
pnpm --filter @my-km/design-tokens build
pnpm --filter @my-km/web type-check
pnpm --filter @my-km/web build
```

Expected:
- `type-check` passes.
- `build` produces `.next/` without errors.
- No "unknown utility" warnings about `bg-ws-*`, `bg-background`, etc.

Spot-check at runtime (optional but recommended):

```bash
pnpm --filter @my-km/web dev
```

Then open http://localhost:4000 and confirm:
- Page renders with the same colours as before the refactor.
- DevTools `<html>` tag has `data-theme="light"`.
- Setting `document.documentElement.setAttribute('data-theme','dark')` in the console flips the page colours.

- [ ] **Step 8.7: Commit**

```bash
git add apps/web/package.json apps/web/tsconfig.json apps/web/tailwind.config.ts apps/web/src/app/globals.css apps/web/src/app/layout.tsx pnpm-lock.yaml
git commit -m "refactor(web): consume generated tokens, switch to data-theme"
```

---

## Task 9: Wire turbo + root scripts so the build is reproducible

**Files:**
- Modify: `turbo.json`
- Modify: root `package.json`

- [ ] **Step 9.1: Add a tokens:build pipeline to turbo.json**

Edit `turbo.json` — under the existing `tasks` map, append a `build` declaration that requires `dist/**` outputs for the tokens package, and add a `tokens:build` alias. Replace the file with:

```json
{
    "$schema": "https://turbo.build/schema.json",
    "globalDependencies": ["**/.env.*local"],
    "tasks": {
        "build": {
            "dependsOn": ["^build"],
            "outputs": [".next/**", "!.next/cache/**", "dist/**", "build/**"]
        },
        "dev": {
            "cache": false,
            "persistent": true
        },
        "lint": {
            "dependsOn": ["^lint"],
            "outputs": []
        },
        "format": {
            "dependsOn": ["^format"],
            "outputs": []
        },
        "test": {
            "dependsOn": ["^build"],
            "outputs": ["coverage/**"],
            "inputs": ["src/**/*.tsx", "src/**/*.ts", "test/**/*.ts", "test/**/*.tsx", "__tests__/**/*.ts", "__tests__/**/*.tsx"]
        },
        "verify": {
            "outputs": [],
            "inputs": ["src/**/*.ts"]
        },
        "clean": {
            "cache": false
        }
    }
}
```

The change vs current: extend the `test` `inputs` glob to include `__tests__/**` (where the design-tokens tests live) and add a `verify` task definition.

- [ ] **Step 9.2: Add root-level scripts**

Edit root `package.json`. In the `scripts` block, alongside the existing entries, add:

```json
"tokens:build": "pnpm --filter @my-km/design-tokens build",
"tokens:verify": "pnpm --filter @my-km/design-tokens verify",
"tokens:test": "pnpm --filter @my-km/design-tokens test",
"design:storybook": "pnpm --filter @my-km/storybook dev",
"design:storybook:build": "pnpm --filter @my-km/storybook build"
```

- [ ] **Step 9.3: Verify everything still works end-to-end**

Run:

```bash
pnpm install
pnpm tokens:build
pnpm tokens:test
pnpm tokens:verify
pnpm --filter @my-km/web type-check
pnpm --filter @my-km/web build
pnpm design:storybook:build
```

Expected: all six commands succeed.

- [ ] **Step 9.4: Commit**

```bash
git add turbo.json package.json
git commit -m "chore(monorepo): wire tokens build into turbo + root scripts"
```

---

## Task 10: Write the four founding ADRs

**Files:**
- Create: `docs/design-system/decisions/0001-token-tiering.md`
- Create: `docs/design-system/decisions/0002-package-layout.md`
- Create: `docs/design-system/decisions/0003-api-conventions.md`
- Create: `docs/design-system/decisions/0004-primitive-vs-pattern.md`

These ADRs lock down the four decisions referenced repeatedly by the spec and by future plans. They are short by design — the depth lives in `spec.md`; ADRs only record the decision + alternatives + consequences so future authors don't relitigate.

- [ ] **Step 10.1: Write 0001-token-tiering.md**

Write `docs/design-system/decisions/0001-token-tiering.md`:

```markdown
# 0001 — Three-tier token structure with editor.* as a domain subtree

- **Status:** accepted
- **Date:** 2026-06-13
- **Spec ref:** `spec.md` §2

## Context

my-km has accumulated three competing token sources (`globals.css` `--color-*`,
`globals.css` `--ws-*`, Pencil `pencil-new.pen` swatches). Without a clear
layered model we cannot answer "where does brand blue live", "how do we add
sepia later", or "how does the editor differ from chrome".

## Decision

Adopt a three-tier token structure:

1. **Tier 1 — Reference**: raw palette (`ref.blue.500 = #0969da`). Hex only.
2. **Tier 2 — System**: semantic role tokens (`color.bg.primary`, `color.fg.muted`).
3. **Tier 3 — Component/Domain**: contextual overrides (`button.primary.bg`,
   `editor.code.inline.bg`, `workspace.sidebar.bg`).

Editor-specific tokens live as the `editor.*` subtree of the token tree —
**not** a fourth tier. They default to borrowing Tier 2 values but may override
when the editor needs different semantics (selection, code blocks, quotes).

Business code uses Tier 2/3 only. Tier 1 is invisible outside the tokens package.

## Alternatives

- **Flat structure** — rejected: makes theme switching brittle and obscures the
  difference between "raw palette" and "semantic role".
- **Two-tier (no Tier 3)** — rejected: cannot express component-specific or
  domain-specific overrides without Tier 3.
- **Editor as a separate fourth layer** — rejected: makes the dependency graph
  asymmetric and forces editor primitives to live outside the normal layering.

## Consequences

- Theme changes only touch Tier 2/3.
- Adding chart/calendar tokens later mirrors `editor.*` (a domain subtree).
- Anyone using a Tier 1 reference outside the tokens package fails the lint
  rule planned for Stage 3.
```

- [ ] **Step 10.2: Write 0002-package-layout.md**

Write `docs/design-system/decisions/0002-package-layout.md`:

```markdown
# 0002 — Two-package layout: design-tokens + design-system

- **Status:** accepted
- **Date:** 2026-06-13
- **Spec ref:** `spec.md` §1.2

## Context

The tokens layer is consumed by every layer above it (primitives, patterns,
business code, Pencil scripts, Storybook). Components are only consumed by
business code and Storybook.

## Decision

Two workspace packages:

- **`@my-km/design-tokens`** — zero runtime deps, pure TS source + generated
  artifacts (`tokens.css`, `tokens.ts`, `tokens.json`, `tokens.d.ts`).
- **`@my-km/design-system`** — primitives, patterns, Tailwind preset; depends
  on design-tokens via workspace link.

Storybook lives at `apps/storybook/`, depending on design-system.

## Alternatives

- **Single package** — rejected: blurs the boundary between "values" and
  "components"; forces tokens consumers to pull React.
- **Three packages** (tokens + ui + design-system docs) — rejected: too heavy
  for a small team with no external consumers.

## Consequences

- Token changes can ship without rebuilding any React.
- Tokens package can later be extracted for non-React consumers (CLI, native).
- Build of `design-system` depends on `design-tokens` `build`.
```

- [ ] **Step 10.3: Write 0003-api-conventions.md**

Write `docs/design-system/decisions/0003-api-conventions.md`:

```markdown
# 0003 — Component API conventions

- **Status:** accepted
- **Date:** 2026-06-13
- **Spec ref:** `spec.md` §3.3

## Context

We have ~13 inconsistent components in `apps/web/src/components/ui` and plan
to grow to 35+. Without conventions each new author re-debates the same
choices.

## Decision

All primitives and patterns follow five rules:

1. **`asChild` mode** — replaceable elements support Radix-style `asChild`.
2. **Variants via CVA** — variants live in a sibling `*.variants.ts` file
   using `class-variance-authority`. Component props derive from
   `VariantProps<typeof xVariants>`.
3. **`forwardRef` + full HTML props passthrough** — never swallow `aria-*` /
   `data-*` / event handlers.
4. **Controlled + uncontrolled** — every stateful primitive supports both
   `defaultValue` and `value + onValueChange`.
5. **State exposed via `data-*`** — `data-state`, `data-disabled`,
   `data-loading`. CSS branches on these. No `is-active` class names.

## Alternatives

- **shadcn defaults verbatim** — rejected: shadcn does not standardise variants
  via CVA in every file and tolerates a mix of patterns.
- **Custom DSL for variants** — rejected: CVA already solves this with type
  inference.

## Consequences

- Authoring a new primitive has a known recipe.
- Lint rules can enforce file collocation (`*.variants.ts` next to `*.tsx`).
- Consumers can rely on `forwardRef` + props passthrough universally.
```

- [ ] **Step 10.4: Write 0004-primitive-vs-pattern.md**

Write `docs/design-system/decisions/0004-primitive-vs-pattern.md`:

```markdown
# 0004 — Primitive vs Pattern judgement

- **Status:** accepted
- **Date:** 2026-06-13
- **Spec ref:** `spec.md` §3.1, §4.1

## Context

Without a sharp boundary between "primitive" and "pattern" everything drifts
into one giant `components/` folder.

## Decision

**Primitive** — must satisfy ALL of:

1. No business terms in name (no `project`, `workspace`, `editor`, `auth`).
2. Reusable across ≥2 unrelated domains.
3. Behaviour describable by an ARIA role (button, dialog, menu, tab, ...).

**Pattern** — must satisfy ALL of:

1. Appears (or will appear) ≥3 times in my-km.
2. Has a single canonical answer; freelance variants are a smell.
3. Does not bind to a specific business data shape (uses generics / slots /
   render props).

Editor toolbars, floating menus, and slash-command menus are **patterns**
inside `patterns/editor/` — not primitives.

`ProjectCard`, `AuthForm`, `WelcomeHero` and similar **never** enter
design-system; they live in `apps/web/src/components/...`.

## Alternatives

- **No distinction** — rejected: produces giant flat `components/` directories
  where authors can't tell what's reusable.
- **Three layers** (primitive / pattern / template) — rejected: "template"
  always means "page", which is a business-specific concern that lives in web.

## Consequences

- Lint can enforce `primitives/*` files do not import from `patterns/*`.
- New components have a clear placement decision.
- `design-system/index.md` (plan #3) can group exports by layer.
```

- [ ] **Step 10.5: Commit**

```bash
git add docs/design-system/decisions
git commit -m "docs(design-system): add ADRs 0001-0004"
```

---

## Task 11: Document the design system in AGENTS.md

**Files:**
- Modify: `AGENTS.md`

- [ ] **Step 11.1: Append a Design System section**

Open `AGENTS.md`. Right before the existing `## 注意事项` (or at the end if you prefer; placement is not load-bearing), insert this new section:

```markdown
## 设计系统

| 文档 | 摘要 |
|------|------|
| [docs/design-system/spec.md](docs/design-system/spec.md) | 设计系统完整规范（token / primitive / pattern / 工程化 / 路线图） |
| [docs/design-system/decisions/](docs/design-system/decisions/) | ADR 序列：0001 三段式 token、0002 双包结构、0003 API 公约、0004 primitive vs pattern |
| [packages/design-tokens/](packages/design-tokens/) | Token 唯一源；改 token 只动这里，跑 `pnpm tokens:build` |
| [packages/design-system/](packages/design-system/) | Primitives + patterns + Tailwind preset（Stage 0/1a 为空壳，plan #2 填充） |
| [apps/storybook/](apps/storybook/) | 文档站；`pnpm design:storybook` 启动，`pnpm design:storybook:build` 构建静态站 |

### 三条最常违反的规则

1. **不要写裸十六进制颜色或 `bg-[#xxx]`**。颜色一律走 token：`bg-bg-primary` / `text-fg-muted` 或 `style={{ background: tokens.color.bg.primary }}`。
2. **新组件不进 `apps/web/src/components/ui/`**。primitive 进 `packages/design-system/src/primitives/`，pattern 进 `.../patterns/`，业务组件留在 `apps/web/src/components/{domain}/`。
3. **改 token 必走源码**：编辑 `packages/design-tokens/src/themes/{light,dark}.ts`，**不要**手改 `globals.css` 或 `dist/tokens.css`（后者是生成产物）。
```

- [ ] **Step 11.2: Commit**

```bash
git add AGENTS.md
git commit -m "docs(agents): document design system entry points and rules"
```

---

## Task 12: Final integration verification + CHANGELOG seed

**Files:**
- Create: `packages/design-tokens/CHANGELOG.md`
- Create: `packages/design-system/CHANGELOG.md`

This task is the final smoke test — run every checked path once more, in order, and seed both packages' changelogs so plan #2 can append.

- [ ] **Step 12.1: Smoke test the whole pipeline from a clean state**

Run:

```bash
pnpm install
rm -rf packages/design-tokens/dist
pnpm tokens:build
pnpm tokens:test
pnpm tokens:verify
pnpm --filter @my-km/web type-check
pnpm --filter @my-km/web build
pnpm design:storybook:build
pnpm lint
```

Expected:
- Tokens artifacts (`tokens.css`, `tokens.ts`, `tokens.json`, `tokens.d.ts`) exist.
- All design-tokens tests pass.
- Verify prints `✓ light` and `✓ dark`.
- `apps/web` typechecks AND builds.
- Storybook builds to `apps/storybook/dist/index.html`.
- `pnpm lint` (Biome) passes for all new files.

If any step fails, fix and re-run from the failing step. Do not skip.

- [ ] **Step 12.2: Manual visual regression check**

Run `pnpm --filter @my-km/web dev` and visit each top-level route (Welcome, Auth/Login, Workspace) at http://localhost:4000. Compare against a recent screenshot or memory:

- Background colours match.
- Sidebars match.
- Buttons / inputs / cards match.
- Hover states match.

If anything looks shifted: most likely cause is a Tier 2 mapping in `themes/light.ts` not matching the original literal in `globals.css`. Adjust the mapping (the `themes.test.ts` anchor assertions cover the workspace block; expand them if the deviation is elsewhere) and rebuild tokens.

- [ ] **Step 12.3: Seed the design-tokens CHANGELOG**

Write `packages/design-tokens/CHANGELOG.md`:

```markdown
# @my-km/design-tokens — CHANGELOG

## 0.1.0 — 2026-06-13

Initial release (Stage 0 + Stage 1a).

### Added

- Tier 1 reference palette (`gray`, `blue`, `red`, `green`, `yellow`,
  `darkSurface`, `darkText`, `darkAccent`).
- `tokenSchema` (zod) for theme shape validation.
- `themes.light` and `themes.dark` with `color.*`, `editor.*`, `workspace.*`
  branches.
- `scripts/build.ts` emitting `tokens.css`, `tokens.ts`, `tokens.json`,
  `tokens.d.ts` to `dist/`.
- `scripts/verify.ts` for CI-only schema validation.
- `alpha()`, `flatten()`, `toCssVar()` utilities.

### Migrated from `apps/web/src/app/globals.css`

- `--ws-*` workspace tokens — now `--workspace-*` (consumed via Tailwind preset
  shim and `globals.css` `@theme inline` bridges).
- Light/dark workspace anchors preserved verbatim.
```

- [ ] **Step 12.4: Seed the design-system CHANGELOG**

Write `packages/design-system/CHANGELOG.md`:

```markdown
# @my-km/design-system — CHANGELOG

## 0.1.0 — 2026-06-13

Initial release (Stage 0).

### Added

- Package shell with empty barrel.
- `tailwind-preset.ts` mapping `bg.*`, `fg.*`, `border.*`, `accent.*` namespaces
  to `@my-km/design-tokens` CSS variables.

### Pending (plan #2)

- Primitives migration from `apps/web/src/components/ui/*`.
- Patterns + editor patterns.
- Storybook stories.
```

- [ ] **Step 12.5: Commit**

```bash
git add packages/design-tokens/CHANGELOG.md packages/design-system/CHANGELOG.md
git commit -m "docs(design-system): seed CHANGELOG for design-tokens and design-system"
```

---

## Acceptance Checklist (run before declaring the plan done)

- [ ] `pnpm install` succeeds with no warnings about unresolved workspace links.
- [ ] `pnpm tokens:build` emits all four artifacts under `packages/design-tokens/dist/`.
- [ ] `pnpm tokens:test` passes (reference + schema + themes + build tests).
- [ ] `pnpm tokens:verify` exits 0.
- [ ] `pnpm --filter @my-km/web type-check` passes.
- [ ] `pnpm --filter @my-km/web build` succeeds and produces `.next/`.
- [ ] `pnpm design:storybook:build` succeeds and produces `apps/storybook/dist/index.html`.
- [ ] `apps/web/src/app/globals.css` no longer contains a `:root { --color-* }` or `.dark { --color-* }` block (only the bridge `@theme inline` block + `:root { --radius }`).
- [ ] `apps/web/src/app/layout.tsx`'s `<html>` element has `data-theme="light"`.
- [ ] `git log --oneline` shows ~12 atomic commits, one per task.
- [ ] `docs/design-system/decisions/` contains ADRs 0001–0004.
- [ ] `AGENTS.md` references the design system entry points and the three rules.
- [ ] Visiting the running web app shows colours indistinguishable from the pre-refactor build.

---

## Out of Scope (do NOT do in this plan)

- Migrating any of the 13 components in `apps/web/src/components/ui/*`. This is plan #2.
- Writing new primitives or patterns. Plan #2.
- Removing the bridge `@theme inline` block in `globals.css`. It stays until every legacy class name (`bg-background`, `bg-ws-*`, `dark:...`) is migrated. Plan #2.
- Pencil sync script (`pnpm tokens:sync`). Plan #3.
- AI agent index (`docs/design-system/index.md`). Plan #3.
- Lint rules forbidding raw hex, `bg-[#...]`, etc. Plan #3.
- Storybook stories for tokens / primitives. Plan #2.
- a11y CI / `@storybook/test-runner`. Plan #3.

If any of the above feels urgent, file a follow-up — do not stretch this plan.
