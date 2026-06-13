# Design-First Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reverse the design system from code-generates-design to design-first-code-aligns, consolidate to a single `.pen` file, expand the token schema to 9 foundation categories, and rewrite governance docs.

**Architecture:** `docs/design-system/design-system.pen` becomes the single visual source of truth. `packages/design-tokens/src/` implements the design file's foundation decisions. `packages/design-system/` gets a clear primitive/pattern/editor-pattern skeleton. All docs rewritten to describe design-first governance — no script ever touches a `.pen` file.

**Tech Stack:** TypeScript, Zod (token schema), Vitest (tests), Pencil MCP (design file editing), Biome (linting)

**Spec:** `docs/superpowers/specs/2026-06-13-design-system-design-first-rebuild-design.md`

---

## File Structure

### Files to delete
- `scripts/generate-design-system-pen.mjs` — code-to-design generation script (anti-pattern)
- `docs/design-system/design-system-spec.pen` — machine-generated pen file (merged into single source)

### Files to rename
- `docs/design-system/pencil-new.pen` → `docs/design-system/design-system.pen` — single authoritative design file

### Files to modify (code)
| File | Responsibility |
|------|----------------|
| `packages/design-tokens/src/reference.ts` | Add Tier 1 reference values for typography, spacing, radius, shadow, motion, zIndex |
| `packages/design-tokens/src/schema.ts` | Add Zod schemas for 6 new token categories |
| `packages/design-tokens/src/themes/light.ts` | Add Tier 2 semantic mappings for new categories |
| `packages/design-tokens/src/themes/dark.ts` | Mirror light theme shape for new categories |
| `packages/design-system/src/index.ts` | Barrel export for skeleton directories |
| `packages/design-system/src/tailwind-preset.ts` | Extend with new token utility namespaces |

### Files to modify (tests)
| File | Responsibility |
|------|----------------|
| `packages/design-tokens/__tests__/schema.test.ts` | Update validTheme fixture with new categories |
| `packages/design-tokens/__tests__/themes.test.ts` | Add assertions for new token values |
| `packages/design-tokens/__tests__/reference.test.ts` | Add assertions for new reference scales |
| `packages/design-tokens/__tests__/build.test.ts` | Add assertions for new CSS variables in output |

### Files to modify (docs)
| File | Responsibility |
|------|----------------|
| `docs/design-system/agent-guide.md` | Rewrite for design-first governance |
| `docs/design-system/spec.md` | Rewrite source-of-truth and Pencil sections |
| `AGENTS.md` | Update design system section |
| `CLAUDE.md` | Update visual spec reference |

### Files to create (skeleton)
| Path | Responsibility |
|------|----------------|
| `packages/design-system/src/primitives/index.ts` | Barrel for primitive components (future) |
| `packages/design-system/src/patterns/index.ts` | Barrel for pattern components (future) |
| `packages/design-system/src/patterns/editor/index.ts` | Barrel for editor patterns (future) |
| `packages/design-system/src/styles/index.ts` | Barrel for style helpers (future) |

---

## Task 1: Remove the pen generation script

**Files:**
- Delete: `scripts/generate-design-system-pen.mjs`

- [ ] **Step 1: Delete the script**

```bash
rm scripts/generate-design-system-pen.mjs
```

- [ ] **Step 2: Verify no other files import or reference the script**

Run: `grep -r "generate-design-system-pen" --include="*.ts" --include="*.tsx" --include="*.js" --include="*.mjs" --include="*.json" --include="*.md" .`
Expected: Only matches in docs (agent-guide.md, spec.md) which will be updated in later tasks.

- [ ] **Step 3: Commit**

```bash
git add -A scripts/generate-design-system-pen.mjs
git commit -m "refactor(design-system): remove code-to-design pen generation script

The design-first rebuild reverses the source-of-truth relationship.
Scripts must never read, generate, or modify .pen design files."
```

---

## Task 2: Consolidate pen files into design-system.pen

This task uses filesystem operations for the rename and Pencil MCP tools for content merge. No scripts touch `.pen` files.

**Files:**
- Rename: `docs/design-system/pencil-new.pen` → `docs/design-system/design-system.pen`
- Delete (after merge): `docs/design-system/design-system-spec.pen`

- [ ] **Step 1: Rename pencil-new.pen to design-system.pen**

```bash
git mv docs/design-system/pencil-new.pen docs/design-system/design-system.pen
```

- [ ] **Step 2: Read design-system-spec.pen to identify valuable human-maintained content**

Use Pencil MCP `batch_get` on `docs/design-system/design-system-spec.pen` with `patterns: [{}]` and `readDepth: 2` to inspect the generated file's structure. Identify any frames or variables that contain human-curated content not present in `design-system.pen` (e.g., component examples, layout patterns that were manually adjusted after generation).

- [ ] **Step 3: Merge valuable content into design-system.pen**

Using Pencil MCP tools (`batch_get` to read nodes from `design-system-spec.pen`, then `batch_design` to recreate them in `design-system.pen`), copy any valuable frames identified in Step 2 into `design-system.pen`. Place them in the appropriate section (will be restructured in Task 3).

If `design-system-spec.pen` contains only machine-generated swatches with no human additions beyond what generation produced, skip the merge — the tokens already exist in code.

- [ ] **Step 4: Delete design-system-spec.pen**

```bash
git rm docs/design-system/design-system-spec.pen
```

- [ ] **Step 5: Commit**

```bash
git add docs/design-system/design-system.pen docs/design-system/design-system-spec.pen
git commit -m "refactor(design-system): consolidate to single design-system.pen

Merged valuable content from design-system-spec.pen into design-system.pen.
Removed the generated spec file to establish a single authoritative source."
```

---

## Task 3: Restructure design-system.pen into 8 sections

This is a manual design task using Pencil MCP tools. No scripts. The design file must use auto-layout (no absolute positioning for structural frames).

**Files:**
- Modify: `docs/design-system/design-system.pen`

- [ ] **Step 1: Read the current document structure**

Use Pencil MCP `get_editor_state` with `include_schema: true` to understand the document, then `batch_get` with `readDepth: 1` to see top-level frames.

- [ ] **Step 2: Create the 8 top-level sections as vertical auto-layout frames**

Using `batch_design`, create 8 top-level frames in `design-system.pen`. Each frame must use `layout: "vertical"`. Names must use the `NN Name` prefix pattern:

1. `00 Overview`
2. `01 Foundations`
3. `02 Themes`
4. `03 Primitives`
5. `04 Patterns`
6. `05 Domain Surfaces`
7. `06 States`
8. `07 Migration Notes`

- [ ] **Step 3: Populate 00 Overview**

Add child frames (vertical) to `00 Overview`:
- `Design-first Source Relationship` — text frame explaining: design-system.pen is the single visual source of truth; code implements design, never the reverse
- `Design Principles` — text frame with 3-5 core principles

- [ ] **Step 4: Populate 01 Foundations**

Add child frames (vertical) to `01 Foundations`, each containing horizontal sub-frames for variants:
- `Colors` — horizontal children: `Light`, `Dark`, `Accent`, `Feedback`
- `Typography` — horizontal children: `Family`, `Size Scale`, `Weight`, `Line Height`, `Letter Spacing`, `Presets`
- `Spacing` — horizontal children: scale swatches (0 through 16)
- `Radius` — horizontal children: `none`, `sm`, `md`, `lg`, `xl`, `full`
- `Shadow` — horizontal children: `sm`, `md`, `lg`, `overlay`, `focus-ring`
- `Motion` — horizontal children: `Duration`, `Easing`
- `z-index` — horizontal children: `base`, `dropdown`, `sticky`, `modal`, `popover`, `tooltip`, `toast`

Move existing color/typography/spacing swatches from the current document into these frames.

- [ ] **Step 5: Populate 02 Themes**

Add child frames (vertical) to `02 Themes`:
- `Light Theme` — reference showing semantic tokens in light mode
- `Dark Theme` — reference showing semantic tokens in dark mode
- `Future Themes` — placeholder for sepia / high-contrast

- [ ] **Step 6: Populate 03 Primitives**

Add child frames (vertical) to `03 Primitives`:
- `Button` — variants: solid, soft, outline, ghost, link × tones: neutral, accent, danger
- `Input` — states: default, focus, error, disabled
- `Textarea`
- `Select`
- `Checkbox`
- `Dialog`
- `Badge`
- `Card`
- `Tabs`

Move any existing primitive examples into these frames.

- [ ] **Step 7: Populate 04 Patterns**

Add child frames (vertical) to `04 Patterns`:
- `PageHeader`
- `EmptyState`
- `ConfirmDialog`
- `Toolbar`
- `SearchCommand`
- `EditorToolbar` (under editor sub-group)
- `FloatingFormatMenu` (under editor sub-group)

- [ ] **Step 8: Populate 05 Domain Surfaces**

Add child frames (vertical) to `05 Domain Surfaces`:
- `Workspace Shell`
- `Editor Surface`
- `AI Panel`
- `Trace / Observability Pages`

- [ ] **Step 9: Populate 06 States**

Add child frames (vertical) to `06 States`:
- `Loading`
- `Empty`
- `Error`
- `Disabled`
- `Focus`
- `Selected`
- `Drag / Drop`

- [ ] **Step 10: Populate 07 Migration Notes**

Add child frames (vertical) to `07 Migration Notes`:
- `Old UI Replacement Notes` — text documenting which old UI maps to which new components
- `Old Token Replacement Notes` — text documenting `--ws-*` → `workspace.*` mappings
- `Deferred Business UI` — text listing business UI not migrated this phase

- [ ] **Step 11: Verify no frame overlap**

Use `snapshot_layout` with `problemsOnly: true` on the document root to check for clipped or overlapping frames. Fix any layout issues before committing.

- [ ] **Step 12: Commit**

```bash
git add docs/design-system/design-system.pen
git commit -m "design(design-system): restructure into 8 auto-layout sections

00 Overview, 01 Foundations, 02 Themes, 03 Primitives, 04 Patterns,
05 Domain Surfaces, 06 States, 07 Migration Notes.
All structural frames use vertical/horizontal auto-layout — no absolute positioning."
```

---

## Task 4: Add typography tokens

The token schema uses `.strict()` on every object, so each new category must be added to schema, reference, and BOTH themes before tests pass.

**Files:**
- Modify: `packages/design-tokens/src/reference.ts`
- Modify: `packages/design-tokens/src/schema.ts`
- Modify: `packages/design-tokens/src/themes/light.ts`
- Modify: `packages/design-tokens/src/themes/dark.ts`
- Modify: `packages/design-tokens/__tests__/schema.test.ts`
- Modify: `packages/design-tokens/__tests__/themes.test.ts`
- Modify: `packages/design-tokens/__tests__/reference.test.ts`

- [ ] **Step 1: Update the schema test fixture to include typography**

Add the `typography` object to the `validTheme` constant in `packages/design-tokens/__tests__/schema.test.ts`, after the `color` property:

```typescript
    typography: {
        family: { sans: 'sans', mono: 'sans' },
        size: {
            xs: 'sans',
            sm: 'sans',
            base: 'sans',
            md: 'sans',
            lg: 'sans',
            xl: 'sans',
            '2xl': 'sans',
            '3xl': 'sans',
        },
        weight: { regular: 'sans', medium: 'sans', semibold: 'sans', bold: 'sans' },
        lineHeight: { tight: 'sans', normal: 'sans', relaxed: 'sans' },
        letterSpacing: { tight: 'sans', normal: 'sans', wide: 'sans' },
    },
```

- [ ] **Step 2: Run schema test to verify it fails**

Run: `pnpm --filter @my-km/design-tokens test -- --run __tests__/schema.test.ts`
Expected: FAIL — "invalid_type" or "unrecognized_keys" because schema doesn't define `typography` yet.

- [ ] **Step 3: Add typography reference values**

Add to `packages/design-tokens/src/reference.ts`, inside the `ref` object (after the `darkAccent` block, before the closing `}`):

```typescript
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
```

- [ ] **Step 4: Add typography to the Zod schema**

Add this block after the `colorTree` definition (line 64) and before the `editor` definition in `packages/design-tokens/src/schema.ts`:

```typescript
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
    .object({ regular: z.string(), medium: z.string(), semibold: z.string(), bold: z.string() })
    .strict();

const lineHeight = z.object({ tight: z.string(), normal: z.string(), relaxed: z.string() }).strict();

const letterSpacing = z
    .object({ tight: z.string(), normal: z.string(), wide: z.string() })
    .strict();

const typography = z
    .object({ family: fontFamily, size: fontSize, weight: fontWeight, lineHeight, letterSpacing })
    .strict();
```

Then update the `tokenSchema` to include `typography`:

```typescript
export const tokenSchema = z
    .object({
        color: colorTree,
        typography,
        editor,
        workspace,
    })
    .strict();
```

- [ ] **Step 5: Add typography to light theme**

Add after the `color` property in `packages/design-tokens/src/themes/light.ts`:

```typescript
    typography: {
        family: { sans: ref.typography.family.sans, mono: ref.typography.family.mono },
        size: { ...ref.typography.size },
        weight: { ...ref.typography.weight },
        lineHeight: { ...ref.typography.lineHeight },
        letterSpacing: { ...ref.typography.letterSpacing },
    },
```

- [ ] **Step 6: Add typography to dark theme**

Add the identical block after the `color` property in `packages/design-tokens/src/themes/dark.ts`:

```typescript
    typography: {
        family: { sans: ref.typography.family.sans, mono: ref.typography.family.mono },
        size: { ...ref.typography.size },
        weight: { ...ref.typography.weight },
        lineHeight: { ...ref.typography.lineHeight },
        letterSpacing: { ...ref.typography.letterSpacing },
    },
```

- [ ] **Step 7: Add typography assertions to themes test**

Add this test case inside the `describe('themes registry', ...)` block in `packages/design-tokens/__tests__/themes.test.ts`:

```typescript
    it('exposes typography family anchors in light theme', () => {
        expect(themes.light.typography.family.sans).toContain('BlinkMacSystemFont');
        expect(themes.light.typography.family.mono).toContain('SF Mono');
        expect(themes.light.typography.size.base).toBe('1rem');
        expect(themes.light.typography.weight.regular).toBe('400');
    });

    it('light and dark themes have identical typography', () => {
        expect(themes.dark.typography).toEqual(themes.light.typography);
    });
```

- [ ] **Step 8: Add typography assertions to reference test**

Add this test case inside `packages/design-tokens/__tests__/reference.test.ts`:

```typescript
    it('exposes a typography scale', () => {
        expect(ref.typography.family.sans).toContain('sans-serif');
        expect(ref.typography.family.mono).toContain('monospace');
        expect(ref.typography.size.xs).toBe('0.75rem');
        expect(ref.typography.size['3xl']).toBe('2.25rem');
        expect(ref.typography.weight.bold).toBe('700');
    });
```

- [ ] **Step 9: Run all token tests**

Run: `pnpm tokens:test`
Expected: PASS — all tests pass including new typography assertions.

- [ ] **Step 10: Verify build produces typography CSS variables**

Run: `pnpm tokens:build`
Then verify the output contains typography variables:
Run: `grep "typography" packages/design-tokens/dist/tokens.css | head -5`
Expected: Lines like `--typography-family-sans: ...;`, `--typography-size-base: 1rem;`, etc.

- [ ] **Step 11: Commit**

```bash
git add packages/design-tokens/
git commit -m "feat(design-tokens): add typography token category

Adds family (sans/mono), size (xs-3xl), weight (regular-bold),
lineHeight (tight/normal/relaxed), letterSpacing (tight/normal/wide).
Light and dark themes share identical typography values."
```

---

## Task 5: Add spacing tokens

**Files:**
- Modify: `packages/design-tokens/src/reference.ts`
- Modify: `packages/design-tokens/src/schema.ts`
- Modify: `packages/design-tokens/src/themes/light.ts`
- Modify: `packages/design-tokens/src/themes/dark.ts`
- Modify: `packages/design-tokens/__tests__/schema.test.ts`
- Modify: `packages/design-tokens/__tests__/themes.test.ts`

- [ ] **Step 1: Update the schema test fixture to include spacing**

Add the `spacing` object to the `validTheme` constant in `packages/design-tokens/__tests__/schema.test.ts`, after the `typography` property:

```typescript
    spacing: {
        '0': 's',
        '0.5': 's',
        '1': 's',
        '1.5': 's',
        '2': 's',
        '3': 's',
        '4': 's',
        '5': 's',
        '6': 's',
        '8': 's',
        '10': 's',
        '12': 's',
        '16': 's',
    },
```

- [ ] **Step 2: Run schema test to verify it fails**

Run: `pnpm --filter @my-km/design-tokens test -- --run __tests__/schema.test.ts`
Expected: FAIL — schema doesn't define `spacing` yet.

- [ ] **Step 3: Add spacing reference values**

Add to `packages/design-tokens/src/reference.ts`, inside the `ref` object (after the `typography` block):

```typescript
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
```

- [ ] **Step 4: Add spacing to the Zod schema**

Add after the `typography` definition in `packages/design-tokens/src/schema.ts`:

```typescript
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
```

Then update `tokenSchema` to include `spacing`:

```typescript
export const tokenSchema = z
    .object({
        color: colorTree,
        typography,
        spacing,
        editor,
        workspace,
    })
    .strict();
```

- [ ] **Step 5: Add spacing to light theme**

Add after the `typography` property in `packages/design-tokens/src/themes/light.ts`:

```typescript
    spacing: { ...ref.spacing },
```

- [ ] **Step 6: Add spacing to dark theme**

Add after the `typography` property in `packages/design-tokens/src/themes/dark.ts`:

```typescript
    spacing: { ...ref.spacing },
```

- [ ] **Step 7: Add spacing assertions to themes test**

Add to `packages/design-tokens/__tests__/themes.test.ts`:

```typescript
    it('exposes spacing scale on 4px baseline', () => {
        expect(themes.light.spacing['0']).toBe('0px');
        expect(themes.light.spacing['1']).toBe('4px');
        expect(themes.light.spacing['4']).toBe('16px');
        expect(themes.light.spacing['16']).toBe('64px');
    });
```

- [ ] **Step 8: Run all token tests**

Run: `pnpm tokens:test`
Expected: PASS

- [ ] **Step 9: Verify build**

Run: `pnpm tokens:build && grep "spacing" packages/design-tokens/dist/tokens.css | head -5`
Expected: Lines like `--spacing-0: 0px;`, `--spacing-1: 4px;`, etc.

- [ ] **Step 10: Commit**

```bash
git add packages/design-tokens/
git commit -m "feat(design-tokens): add spacing token category

13-step scale on 4px baseline (0 through 16).
Aligns with Tailwind v4 default spacing."
```

---

## Task 6: Add radius tokens

**Files:**
- Modify: `packages/design-tokens/src/reference.ts`
- Modify: `packages/design-tokens/src/schema.ts`
- Modify: `packages/design-tokens/src/themes/light.ts`
- Modify: `packages/design-tokens/src/themes/dark.ts`
- Modify: `packages/design-tokens/__tests__/schema.test.ts`
- Modify: `packages/design-tokens/__tests__/themes.test.ts`

- [ ] **Step 1: Update the schema test fixture to include radius**

Add after the `spacing` property in `validTheme` in `packages/design-tokens/__tests__/schema.test.ts`:

```typescript
    radius: {
        none: 's',
        sm: 's',
        md: 's',
        lg: 's',
        xl: 's',
        full: 's',
    },
```

- [ ] **Step 2: Run schema test to verify it fails**

Run: `pnpm --filter @my-km/design-tokens test -- --run __tests__/schema.test.ts`
Expected: FAIL

- [ ] **Step 3: Add radius reference values**

Add to `packages/design-tokens/src/reference.ts` (after `spacing`):

```typescript
    radius: {
        none: '0px',
        sm: '4px',
        md: '6px',
        lg: '8px',
        xl: '12px',
        full: '9999px',
    },
```

- [ ] **Step 4: Add radius to the Zod schema**

Add after the `spacing` definition in `packages/design-tokens/src/schema.ts`:

```typescript
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
```

Update `tokenSchema`:

```typescript
export const tokenSchema = z
    .object({
        color: colorTree,
        typography,
        spacing,
        radius,
        editor,
        workspace,
    })
    .strict();
```

- [ ] **Step 5: Add radius to light theme**

Add after `spacing` in `packages/design-tokens/src/themes/light.ts`:

```typescript
    radius: { ...ref.radius },
```

- [ ] **Step 6: Add radius to dark theme**

Add after `spacing` in `packages/design-tokens/src/themes/dark.ts`:

```typescript
    radius: { ...ref.radius },
```

- [ ] **Step 7: Add radius assertions to themes test**

Add to `packages/design-tokens/__tests__/themes.test.ts`:

```typescript
    it('exposes radius scale', () => {
        expect(themes.light.radius.none).toBe('0px');
        expect(themes.light.radius.md).toBe('6px');
        expect(themes.light.radius.full).toBe('9999px');
    });
```

- [ ] **Step 8: Run all token tests**

Run: `pnpm tokens:test`
Expected: PASS

- [ ] **Step 9: Verify build**

Run: `pnpm tokens:build && grep "radius" packages/design-tokens/dist/tokens.css | head -5`
Expected: Lines like `--radius-sm: 4px;`, `--radius-md: 6px;`, etc.

- [ ] **Step 10: Commit**

```bash
git add packages/design-tokens/
git commit -m "feat(design-tokens): add radius token category

6-step scale: none / sm / md / lg / xl / full."
```

---

## Task 7: Add shadow tokens

**Files:**
- Modify: `packages/design-tokens/src/reference.ts`
- Modify: `packages/design-tokens/src/schema.ts`
- Modify: `packages/design-tokens/src/themes/light.ts`
- Modify: `packages/design-tokens/src/themes/dark.ts`
- Modify: `packages/design-tokens/__tests__/schema.test.ts`
- Modify: `packages/design-tokens/__tests__/themes.test.ts`

- [ ] **Step 1: Update the schema test fixture to include shadow**

Add after `radius` in `validTheme` in `packages/design-tokens/__tests__/schema.test.ts`:

```typescript
    shadow: {
        sm: 's',
        md: 's',
        lg: 's',
        overlay: 's',
        'focus-ring': 's',
    },
```

- [ ] **Step 2: Run schema test to verify it fails**

Run: `pnpm --filter @my-km/design-tokens test -- --run __tests__/schema.test.ts`
Expected: FAIL

- [ ] **Step 3: Add shadow reference values**

Add to `packages/design-tokens/src/reference.ts` (after `radius`):

```typescript
    shadow: {
        sm: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
        md: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
        lg: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
        overlay: '0 0 0 1px rgb(0 0 0 / 0.05), 0 8px 24px rgb(0 0 0 / 0.2)',
        'focus-ring': '0 0 0 2px var(--color-border-focus)',
    },
```

- [ ] **Step 4: Add shadow to the Zod schema**

Add after `radius` in `packages/design-tokens/src/schema.ts`:

```typescript
const shadow = z
    .object({
        sm: z.string(),
        md: z.string(),
        lg: z.string(),
        overlay: z.string(),
        'focus-ring': z.string(),
    })
    .strict();
```

Update `tokenSchema`:

```typescript
export const tokenSchema = z
    .object({
        color: colorTree,
        typography,
        spacing,
        radius,
        shadow,
        editor,
        workspace,
    })
    .strict();
```

- [ ] **Step 5: Add shadow to light theme**

Add after `radius` in `packages/design-tokens/src/themes/light.ts`:

```typescript
    shadow: { ...ref.shadow },
```

- [ ] **Step 6: Add shadow to dark theme**

Add after `radius` in `packages/design-tokens/src/themes/dark.ts`:

```typescript
    shadow: { ...ref.shadow },
```

- [ ] **Step 7: Add shadow assertions to themes test**

Add to `packages/design-tokens/__tests__/themes.test.ts`:

```typescript
    it('exposes shadow scale', () => {
        expect(themes.light.shadow.sm).toContain('0 1px 2px');
        expect(themes.light.shadow.overlay).toContain('rgb(0 0 0');
        expect(themes.light.shadow['focus-ring']).toContain('var(--color-border-focus)');
    });
```

- [ ] **Step 8: Run all token tests**

Run: `pnpm tokens:test`
Expected: PASS

- [ ] **Step 9: Verify build**

Run: `pnpm tokens:build && grep "shadow" packages/design-tokens/dist/tokens.css | head -5`
Expected: Lines like `--shadow-sm: 0 1px 2px...;`, etc.

- [ ] **Step 10: Commit**

```bash
git add packages/design-tokens/
git commit -m "feat(design-tokens): add shadow token category

5 shadows: sm / md / lg / overlay / focus-ring."
```

---

## Task 8: Add motion tokens

**Files:**
- Modify: `packages/design-tokens/src/reference.ts`
- Modify: `packages/design-tokens/src/schema.ts`
- Modify: `packages/design-tokens/src/themes/light.ts`
- Modify: `packages/design-tokens/src/themes/dark.ts`
- Modify: `packages/design-tokens/__tests__/schema.test.ts`
- Modify: `packages/design-tokens/__tests__/themes.test.ts`

- [ ] **Step 1: Update the schema test fixture to include motion**

Add after `shadow` in `validTheme` in `packages/design-tokens/__tests__/schema.test.ts`:

```typescript
    motion: {
        duration: { fast: 's', base: 's', slow: 's' },
        easing: { standard: 's', emphasized: 's', exit: 's' },
    },
```

- [ ] **Step 2: Run schema test to verify it fails**

Run: `pnpm --filter @my-km/design-tokens test -- --run __tests__/schema.test.ts`
Expected: FAIL

- [ ] **Step 3: Add motion reference values**

Add to `packages/design-tokens/src/reference.ts` (after `shadow`):

```typescript
    motion: {
        duration: {
            fast: '100ms',
            base: '150ms',
            slow: '300ms',
        },
        easing: {
            standard: 'cubic-bezier(0.4, 0, 0.2, 1)',
            emphasized: 'cubic-bezier(0.2, 0, 0, 1)',
            exit: 'cubic-bezier(0.4, 0, 1, 1)',
        },
    },
```

- [ ] **Step 4: Add motion to the Zod schema**

Add after `shadow` in `packages/design-tokens/src/schema.ts`:

```typescript
const motionDuration = z
    .object({ fast: z.string(), base: z.string(), slow: z.string() })
    .strict();

const motionEasing = z
    .object({ standard: z.string(), emphasized: z.string(), exit: z.string() })
    .strict();

const motion = z.object({ duration: motionDuration, easing: motionEasing }).strict();
```

Update `tokenSchema`:

```typescript
export const tokenSchema = z
    .object({
        color: colorTree,
        typography,
        spacing,
        radius,
        shadow,
        motion,
        editor,
        workspace,
    })
    .strict();
```

- [ ] **Step 5: Add motion to light theme**

Add after `shadow` in `packages/design-tokens/src/themes/light.ts`:

```typescript
    motion: {
        duration: { ...ref.motion.duration },
        easing: { ...ref.motion.easing },
    },
```

- [ ] **Step 6: Add motion to dark theme**

Add after `shadow` in `packages/design-tokens/src/themes/dark.ts`:

```typescript
    motion: {
        duration: { ...ref.motion.duration },
        easing: { ...ref.motion.easing },
    },
```

- [ ] **Step 7: Add motion assertions to themes test**

Add to `packages/design-tokens/__tests__/themes.test.ts`:

```typescript
    it('exposes motion duration and easing', () => {
        expect(themes.light.motion.duration.fast).toBe('100ms');
        expect(themes.light.motion.duration.slow).toBe('300ms');
        expect(themes.light.motion.easing.standard).toContain('cubic-bezier');
    });
```

- [ ] **Step 8: Run all token tests**

Run: `pnpm tokens:test`
Expected: PASS

- [ ] **Step 9: Verify build**

Run: `pnpm tokens:build && grep "motion" packages/design-tokens/dist/tokens.css | head -5`
Expected: Lines like `--motion-duration-fast: 100ms;`, `--motion-easing-standard: cubic-bezier(...);`, etc.

- [ ] **Step 10: Commit**

```bash
git add packages/design-tokens/
git commit -m "feat(design-tokens): add motion token category

Duration (fast/base/slow) and easing (standard/emphasized/exit)."
```

---

## Task 9: Add zIndex tokens

**Files:**
- Modify: `packages/design-tokens/src/reference.ts`
- Modify: `packages/design-tokens/src/schema.ts`
- Modify: `packages/design-tokens/src/themes/light.ts`
- Modify: `packages/design-tokens/src/themes/dark.ts`
- Modify: `packages/design-tokens/__tests__/schema.test.ts`
- Modify: `packages/design-tokens/__tests__/themes.test.ts`

- [ ] **Step 1: Update the schema test fixture to include zIndex**

Add after `motion` in `validTheme` in `packages/design-tokens/__tests__/schema.test.ts`:

```typescript
    zIndex: {
        base: 's',
        dropdown: 's',
        sticky: 's',
        modal: 's',
        popover: 's',
        tooltip: 's',
        toast: 's',
    },
```

- [ ] **Step 2: Run schema test to verify it fails**

Run: `pnpm --filter @my-km/design-tokens test -- --run __tests__/schema.test.ts`
Expected: FAIL

- [ ] **Step 3: Add zIndex reference values**

Add to `packages/design-tokens/src/reference.ts` (after `motion`):

```typescript
    zIndex: {
        base: '0',
        dropdown: '1000',
        sticky: '1100',
        modal: '1200',
        popover: '1300',
        tooltip: '1400',
        toast: '1500',
    },
```

- [ ] **Step 4: Add zIndex to the Zod schema**

Add after `motion` in `packages/design-tokens/src/schema.ts`:

```typescript
const zIndex = z
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
```

Update `tokenSchema` — final form with all 9 categories:

```typescript
export const tokenSchema = z
    .object({
        color: colorTree,
        typography,
        spacing,
        radius,
        shadow,
        motion,
        zIndex,
        editor,
        workspace,
    })
    .strict();
```

- [ ] **Step 5: Add zIndex to light theme**

Add after `motion` in `packages/design-tokens/src/themes/light.ts`:

```typescript
    zIndex: { ...ref.zIndex },
```

- [ ] **Step 6: Add zIndex to dark theme**

Add after `motion` in `packages/design-tokens/src/themes/dark.ts`:

```typescript
    zIndex: { ...ref.zIndex },
```

- [ ] **Step 7: Add zIndex assertions to themes test**

Add to `packages/design-tokens/__tests__/themes.test.ts`:

```typescript
    it('exposes zIndex scale with ordered layers', () => {
        expect(themes.light.zIndex.base).toBe('0');
        expect(themes.light.zIndex.dropdown).toBe('1000');
        expect(themes.light.zIndex.modal).toBe('1200');
        expect(themes.light.zIndex.toast).toBe('1500');
    });
```

- [ ] **Step 8: Run all token tests**

Run: `pnpm tokens:test`
Expected: PASS — all 9 token categories now defined.

- [ ] **Step 9: Run full verification**

Run: `pnpm tokens:verify`
Expected: PASS — both themes validate against the expanded schema.

- [ ] **Step 10: Verify build output has all categories**

Run: `pnpm tokens:build && grep -c "^\s*--" packages/design-tokens/dist/tokens.css`
Expected: A number significantly larger than before (was ~60 tokens × 2 themes; now ~120+ × 2).

- [ ] **Step 11: Commit**

```bash
git add packages/design-tokens/
git commit -m "feat(design-tokens): add zIndex token category

7 layers: base/dropdown/sticky/modal/popover/tooltip/toast.
Token schema now covers all 9 foundation categories."
```

---

## Task 10: Create design-system package skeleton

Create the directory structure and barrel exports defined in the spec. No component implementations yet — this phase lays boundaries only.

**Files:**
- Create: `packages/design-system/src/primitives/index.ts`
- Create: `packages/design-system/src/patterns/index.ts`
- Create: `packages/design-system/src/patterns/editor/index.ts`
- Create: `packages/design-system/src/styles/index.ts`
- Modify: `packages/design-system/src/index.ts`

- [ ] **Step 1: Create primitives barrel**

Create `packages/design-system/src/primitives/index.ts`:

```typescript
/**
 * Primitive components — no business semantics.
 * Each primitive implements the visual spec defined in
 * docs/design-system/design-system.pen §03 Primitives.
 *
 * Future components: button, input, textarea, select, checkbox,
 * dialog, badge, card, tabs.
 */
export {};
```

- [ ] **Step 2: Create patterns barrel**

Create `packages/design-system/src/patterns/index.ts`:

```typescript
/**
 * Pattern components — reusable compositions with no business entity binding.
 * Each pattern implements the visual spec defined in
 * docs/design-system/design-system.pen §04 Patterns.
 *
 * Future components: page-header, empty-state, confirm-dialog,
 * toolbar, search-command.
 */
export {};
```

- [ ] **Step 3: Create editor patterns barrel**

Create `packages/design-system/src/patterns/editor/index.ts`:

```typescript
/**
 * Editor-specific patterns — compositions for the editing surface.
 * Implements docs/design-system/design-system.pen §04 Patterns / Editor.
 *
 * Future components: editor-toolbar, floating-format-menu.
 */
export {};
```

- [ ] **Step 4: Create styles barrel**

Create `packages/design-system/src/styles/index.ts`:

```typescript
/**
 * Style helpers — consume tokens, do not define visual truth.
 * All visual decisions come from design-system.pen.
 */
export {};
```

- [ ] **Step 5: Update package barrel export**

Replace the contents of `packages/design-system/src/index.ts`:

```typescript
// @my-km/design-system
// Primitives, patterns, and Tailwind preset for my-km.
// Visual spec: docs/design-system/design-system.pen

export { default as tailwindPreset } from './tailwind-preset';
export {};
```

- [ ] **Step 6: Verify typecheck**

Run: `pnpm --filter @my-km/design-system lint`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add packages/design-system/src/
git commit -m "feat(design-system): create primitive/pattern/editor skeleton

Adds barrel exports for primitives/, patterns/, patterns/editor/,
and styles/ directories. Establishes clear boundaries per the
design-first rebuild spec. No component implementations yet."
```

---

## Task 11: Extend Tailwind preset for new token categories

The Tailwind preset currently only maps color tokens. Extend it to map spacing, radius, typography, shadow, and zIndex namespaces.

**Files:**
- Modify: `packages/design-system/src/tailwind-preset.ts`

- [ ] **Step 1: Read the current Tailwind preset**

Read `packages/design-system/src/tailwind-preset.ts` to understand the current mapping structure.

- [ ] **Step 2: Extend the preset with new namespaces**

Replace the `theme.extend` object in `packages/design-system/src/tailwind-preset.ts`. Keep the existing `colors` mapping, and add `spacing`, `borderRadius`, `boxShadow`, `transitionDuration`, `transitionTimingFunction`, `zIndex`, `fontFamily`, `fontSize`, and `fontWeight`:

```typescript
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
                '0': cssVar('spacing-0'),
                '0.5': cssVar('spacing-0.5'),
                '1': cssVar('spacing-1'),
                '1.5': cssVar('spacing-1.5'),
                '2': cssVar('spacing-2'),
                '3': cssVar('spacing-3'),
                '4': cssVar('spacing-4'),
                '5': cssVar('spacing-5'),
                '6': cssVar('spacing-6'),
                '8': cssVar('spacing-8'),
                '10': cssVar('spacing-10'),
                '12': cssVar('spacing-12'),
                '16': cssVar('spacing-16'),
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
```

- [ ] **Step 3: Verify lint**

Run: `pnpm --filter @my-km/design-system lint`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/design-system/src/tailwind-preset.ts
git commit -m "feat(design-system): extend Tailwind preset with all token categories

Maps typography, spacing, radius, shadow, motion, and zIndex
CSS variables to Tailwind utility namespaces."
```

---

## Task 12: Rewrite agent-guide.md for design-first

Rewrite the agent guide to reflect design-first governance. Remove all references to pen generation and code-as-source-of-truth.

**Files:**
- Modify: `docs/design-system/agent-guide.md`

- [ ] **Step 1: Replace the entire file contents**

Write `docs/design-system/agent-guide.md`:

```markdown
# Design System Agent Guide

> AI agent 快速上手指南 — design-first 治理，按需读取

## Source relationship (design-first)

1. `docs/design-system/design-system.pen` — **唯一权威设计稿**（人工维护）
2. `docs/design-system/spec.md` — 文字治理规范和工程边界
3. `packages/design-tokens/src/` — 设计稿中 foundation/theme 决策的工程实现
4. `packages/design-system/` — 设计稿中 primitives 和 patterns 的工程实现

**如果实现与设计冲突，默认实现是错的。**
**如果设计稿缺少规格，先更新设计稿，再对齐代码。**

## Quick start

```bash
# Visual spec (read-only, never script)
open docs/design-system/design-system.pen

# Token source code
codegraph_explore "design-tokens themes light dark"

# Component source (when populated)
codegraph_explore "primitives button input dialog"
codegraph_explore "patterns empty-state page-header"
```

## Three-tier token architecture

```
Tier 3 → Component/Domain  (editor.*, workspace.*, button.primary.bg)
Tier 2 → System / Semantic  (color.bg.primary, color.fg.muted)
Tier 1 → Reference          (blue.500 = #0969da, gray.50 = #f6f8fa)
```

Token categories: `color` / `typography` / `spacing` / `radius` / `shadow` / `motion` / `zIndex` / `editor` / `workspace`.

## Golden rules

| # | Rule | Enforcement |
|---|------|-------------|
| 1 | **No bare hex colors** — use token utilities only (`bg-bg-primary`, `text-fg-muted`) | ESLint + Stylelint (error) |
| 2 | **No `bg-[#xxx]` / `style={{ color }}`** — go through tokens | Tailwind plugin + ESLint |
| 3 | **New UI components → `packages/design-system/`**, never `apps/web/src/components/ui/` | no-restricted-imports |
| 4 | **Design changes start in `design-system.pen`**, never in code | code review |
| 5 | **No script reads, generates, or modifies `.pen` files** | convention |
| 6 | **Business code only uses Tier 2/3 tokens**, never Tier 1 | code review |

## When to use what

| Need | Use | Location |
|------|-----|----------|
| Button / Input / Dialog / Badge (no business meaning) | **Primitive** | `packages/design-system/src/primitives/` |
| PageHeader / EmptyState / ConfirmDialog (repeated >=3x) | **Pattern** | `packages/design-system/src/patterns/` |
| EditorToolbar / FloatingFormatMenu (editor-specific) | **Editor Pattern** | `packages/design-system/src/patterns/editor/` |
| ProjectCard / AuthForm (binds business entity) | **Business component** | `apps/web/src/components/{domain}/` |
| Color / spacing / typography values | **Token** | `packages/design-tokens/src/` |
| Visual spec for any of the above | **Design file** | `docs/design-system/design-system.pen` |

**Boundary test**: Can >=2 domains use it? -> design-system. Only one domain? -> stays in web.

## Changing the design system

1. **Visual change**: Edit `docs/design-system/design-system.pen` first
2. **Token change**: Edit `packages/design-tokens/src/` to match the design -> run `pnpm tokens:build`
3. **Add primitive/pattern**: Verify `design-system.pen` has a matching spec section -> create component in `packages/design-system/src/`
4. **ADR required** for: new Tier 2 token, new primitive, pattern promotion/demotion, API convention changes

## Source of truth

| What | Where |
|------|-------|
| Visual spec (authoritative) | `docs/design-system/design-system.pen` |
| Written governance | `docs/design-system/spec.md` |
| Token source (implements design) | `packages/design-tokens/src/` |
| Token output (generated, don't edit) | `packages/design-tokens/dist/tokens.css` |
| ADR records | `docs/design-system/decisions/` |
| Storybook | `pnpm design:storybook` -> localhost:6006 |

## Component API conventions

- **CVA** for variants: `cva('...', { variants: { variant, tone, size } })`
- **asChild** pattern: `<Button asChild><Link href="/x">Go</Link></Button>`
- **data-state** for CSS: `data-state="open"`, `data-disabled`, `data-loading` -- no `.is-active` classes
- **forwardRef** + extends `ComponentPropsWithoutRef<...>`
- **Controlled + Uncontrolled**: `value + onValueChange` AND `defaultValue`

## Naming conventions

| Correct | Wrong |
|---------|-------|
| `color.bg.primary` (dot-separated) | `colorBgPrimary` |
| `.hover` / `.active` / `.disabled` | `.hovered` / `.is-hover` |
| `.subtle` / `.default` / `.strong` | `.light` / `.dark` |
| `fg.on-accent` | `fg.white` |
| `xs / sm / md / lg / xl / 2xl` | `1 / 2 / 3 / 4` |

CSS variable: `color.bg.primary` -> `--color-bg-primary` (auto-generated, never hand-write).
```

- [ ] **Step 2: Commit**

```bash
git add docs/design-system/agent-guide.md
git commit -m "docs(design-system): rewrite agent-guide for design-first governance

Removes pen generation references. Establishes design-system.pen as
the single visual source of truth. Code implements design, not vice versa."
```

---

## Task 13: Update spec.md governance sections

Rewrite the sections of spec.md that describe code-as-source-of-truth and pen generation. These sections directly contradict the design-first model.

**Files:**
- Modify: `docs/design-system/spec.md`

- [ ] **Step 1: Update the source-of-truth header**

In `docs/design-system/spec.md`, replace lines 5-10 (the metadata block):

```markdown
- **Status**: accepted
- **Date**: 2026-06-13
- **Owners**: 单人 + AI agent 协作（design-first / code-aligning）
- **Source of truth**: `docs/design-system/design-system.pen`（视觉）+ 本文件（工程治理）
- **Related**:
  - 权威设计稿：`docs/design-system/design-system.pen`
  - 决策记录：`docs/design-system/decisions/`
```

- [ ] **Step 2: Rewrite §1.1 design philosophy point 1**

Find the text starting with "1. **代码为唯一源**" (around line 46) and replace with:

```markdown
1. **设计稿为唯一视觉源（design-first）**：`docs/design-system/design-system.pen` 是唯一权威设计稿。token 源码、组件实现都必须主动对齐设计稿。如果实现与设计冲突，默认实现是错的。任何脚本都不能读取、生成或修改 `.pen` 设计稿。
```

- [ ] **Step 3: Update §1.2 package layout pen references**

Find the block showing file structure (around line 73-79) and replace the `docs/design-system/` section:

```markdown
docs/design-system/
  design-system.pen       # 唯一权威设计稿（人工维护，禁止脚本读写）
  spec.md                 # 本文件（工程治理规范）
  agent-guide.md          # AI agent 快速上手
  decisions/              # ADR 序列
```

- [ ] **Step 4: Rewrite §2.7 Pencil collaboration section**

Find "### 2.7 Pencil 设计稿协作（单向）" (around line 249) and replace the entire subsection with:

```markdown
### 2.7 设计稿协作（design-first）

- **设计变更从 `design-system.pen` 开始**：任何视觉或组件规格变更，先在设计稿中更新，再对齐代码。
- **代码实现设计稿**：`packages/design-tokens/src/` 和 `packages/design-system/src/` 是设计稿的工程实现，不是设计稿的来源。
- **铁律**：任何脚本都不能读取、生成或修改 `.pen` 设计稿。Pencil 设计稿只能通过 Pencil 编辑器或 MCP 工具人工维护。
- **设计规格缺失时**：先更新 `design-system.pen`，再实现代码。不允许"先写代码再补设计"。
```

- [ ] **Step 5: Update §5.2 — remove the Pencil sync script section**

Find "### 5.2 Pencil 同步脚本" (around line 501) and replace with:

```markdown
### 5.2 设计稿维护（无脚本）

**位置**：`docs/design-system/design-system.pen`

**维护方式**：通过 Pencil 编辑器或 MCP 工具人工维护。

**铁律**：
- 任何脚本都不能读取、生成或修改 `.pen` 设计稿。
- 设计变更从设计稿开始，代码对齐设计稿。
- `packages/design-tokens/src/` 实现设计稿中的 foundation 和 theme 决策。
- `packages/design-system/src/` 实现设计稿中的 primitives 和 patterns。
```

- [ ] **Step 6: Update §6.3 Stage 1 acceptance criteria — remove pencil sync**

Find the line about "Pencil 同步脚本 `pnpm tokens:sync`" (around line 670) and remove it. The acceptance criteria for Stage 1 should end at:

```markdown
9. 5 个 primitive 在 Storybook 有 stories 可看。
```

- [ ] **Step 7: Verify no remaining references to pen generation**

Run: `grep -n "tokens:sync\|pencil-system\.pen\|generate-design-system-pen\|代码.*唯一.*源\|Pencil.*同步.*脚本" docs/design-system/spec.md`
Expected: No matches.

- [ ] **Step 8: Commit**

```bash
git add docs/design-system/spec.md
git commit -m "docs(design-system): rewrite spec for design-first governance

Replaces code-as-source-of-truth with design-first model.
Removes Pencil sync script section. Updates all pen file references
to single authoritative design-system.pen."
```

---

## Task 14: Update AGENTS.md and CLAUDE.md

Update the design system references in the root agent docs to reflect design-first governance and the single pen file.

**Files:**
- Modify: `AGENTS.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update AGENTS.md design system section**

In `AGENTS.md`, find the "## 设计系统" section (around line 63). Replace the table and rules section:

```markdown
## 设计系统

| 文档 | 摘要 |
|------|------|
| [docs/design-system/agent-guide.md](docs/design-system/agent-guide.md) | AI agent 快速上手指南（design-first 治理） |
| [docs/design-system/spec.md](docs/design-system/spec.md) | 设计系统完整规范（token / primitive / pattern / 工程化 / 路线图） |
| [docs/design-system/design-system.pen](docs/design-system/design-system.pen) | 唯一权威设计稿（人工维护，禁止脚本读写） |
| [docs/design-system/decisions/](docs/design-system/decisions/) | ADR 序列：0001 三段式 token、0002 双包结构、0003 API 公约、0004 primitive vs pattern |
| [packages/design-tokens/](packages/design-tokens/) | Token 工程实现（设计稿的 foundation 映射）；改 token 只动这里，跑 `pnpm tokens:build` |
| [packages/design-system/](packages/design-system/) | Primitives + patterns + Tailwind preset（骨架阶段） |
| [apps/storybook/](apps/storybook/) | 文档站；`pnpm design:storybook` 启动，`pnpm design:storybook:build` 构建静态站 |

### Design-first 源头关系

1. `design-system.pen` 是唯一权威设计稿。
2. `packages/design-tokens/src/` 实现设计稿的 foundation/theme。
3. `packages/design-system/` 实现设计稿的 primitives/patterns。
4. **如果实现与设计冲突，默认实现是错的。**
5. **任何脚本都不能读取、生成或修改 `.pen` 设计稿。**

### 三条最常违反的规则

1. **不要写裸十六进制颜色或 `bg-[#xxx]`**。颜色一律走 token：`bg-bg-primary` / `text-fg-muted` 或 `style={{ background: tokens.color.bg.primary }}`。
2. **新组件不进 `apps/web/src/components/ui/`**。primitive 进 `packages/design-system/src/primitives/`，pattern 进 `.../patterns/`，业务组件留在 `apps/web/src/components/{domain}/`。
3. **视觉变更从 `design-system.pen` 开始**：先更新设计稿，再对齐代码。不允许"先写代码再补设计"。
```

- [ ] **Step 2: Update CLAUDE.md design system reference**

In `CLAUDE.md`, find the "## Design System" section (around line 11). Replace with:

```markdown
## Design System

Read [docs/design-system/agent-guide.md](docs/design-system/agent-guide.md) before touching UI code.
Quick reference: no bare hex colors, new components go to `packages/design-system/`, tokens -> `packages/design-tokens/src/`.
Visual spec (authoritative): `docs/design-system/design-system.pen`.
Design-first: code implements design, never the reverse. No script reads/writes `.pen` files.
```

- [ ] **Step 3: Verify no stale references remain**

Run: `grep -rn "design-system-spec\.pen\|pencil-new\.pen\|generate-design-system-pen\|tokens:sync" AGENTS.md CLAUDE.md`
Expected: No matches.

- [ ] **Step 4: Commit**

```bash
git add AGENTS.md CLAUDE.md
git commit -m "docs: update AGENTS.md and CLAUDE.md for design-first governance

References single authoritative design-system.pen.
Removes pen generation and sync script references.
Adds design-first source relationship."
```

---

## Task 15: Final verification

- [ ] **Step 1: Run token tests**

Run: `pnpm tokens:test`
Expected: PASS — all tests including new typography/spacing/radius/shadow/motion/zIndex assertions.

- [ ] **Step 2: Run token verification**

Run: `pnpm tokens:verify`
Expected: PASS — both themes validate against the expanded 9-category schema.

- [ ] **Step 3: Run token build**

Run: `pnpm tokens:build`
Expected: Success — generates tokens.css, tokens.ts, tokens.json, tokens.d.ts.

- [ ] **Step 4: Verify design-system package lint**

Run: `pnpm --filter @my-km/design-system lint`
Expected: PASS

- [ ] **Step 5: Verify no pen generation script exists**

Run: `ls scripts/generate-design-system-pen.mjs 2>&1 || echo "CONFIRMED: deleted"`
Expected: `CONFIRMED: deleted`

- [ ] **Step 6: Verify only one pen file exists**

Run: `ls docs/design-system/*.pen`
Expected: Only `design-system.pen` — no `design-system-spec.pen` or `pencil-new.pen`.

- [ ] **Step 7: Verify no doc references to pen generation**

Run: `grep -rn "generate-design-system-pen\|tokens:sync\|pencil-system\.pen\|design-system-spec\.pen\|pencil-new\.pen" --include="*.md" docs/ AGENTS.md CLAUDE.md`
Expected: No matches (except possibly this plan file itself, which is acceptable).

- [ ] **Step 8: Verify token schema covers all 9 categories**

Run: `grep -A 15 "export const tokenSchema" packages/design-tokens/src/schema.ts`
Expected: Schema shows `color`, `typography`, `spacing`, `radius`, `shadow`, `motion`, `zIndex`, `editor`, `workspace`.

- [ ] **Step 9: Final commit (if any remaining changes)**

If verification surfaced any fixes, commit them. Otherwise, no commit needed — all changes are already committed in previous tasks.

---

## Self-Review Summary

### Spec coverage check

| Spec requirement | Task(s) |
|---|---|
| Remove `scripts/generate-design-system-pen.mjs` | Task 1 |
| Rename `pencil-new.pen` to `design-system.pen` | Task 2 |
| Merge `design-system-spec.pen` content, remove it | Task 2 |
| Restructure design-system.pen into 8 auto-layout sections | Task 3 |
| Token schema covers all 9 categories | Tasks 4-9 |
| Light/dark themes remain isomorphic | Tasks 4-9 (both themes updated identically) |
| Design-system package skeleton with primitive/pattern/editor boundaries | Task 10 |
| Tailwind preset consumes tokens (not defines truth) | Task 11 |
| Rewrite agent-guide for design-first | Task 12 |
| Rewrite spec.md governance sections | Task 13 |
| Update AGENTS.md and CLAUDE.md | Task 14 |
| No script reads/generates/modifies .pen files | Tasks 1, 15 |
| No "code is source of truth" language in docs | Tasks 12-14 |
| Verification commands pass | Task 15 |

### Placeholder scan: none found. Every step has exact code or exact commands.

### Type consistency: all token category names, schema field names, and CSS variable patterns are consistent across tasks.
