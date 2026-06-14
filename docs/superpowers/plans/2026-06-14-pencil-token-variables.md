# Pencil Token Variables Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace legacy `ws-*` Pencil variables with dot-separated variables that mirror the my-km design token hierarchy and bind existing design nodes to them.

**Architecture:** Use `pencil_set_variables` with `replace: true` to replace the variable table from token source values. Then use focused `pencil_batch_design` calls to replace direct fixed values on high-confidence existing nodes with `$variable` references while preserving visual output.

**Tech Stack:** Pencil MCP tools, `.pen` variable schema, `packages/design-tokens/src/reference.ts`, `packages/design-tokens/src/themes/light.ts`, `packages/design-tokens/src/themes/dark.ts`, pnpm verification scripts.

---

## Files and Responsibilities

- Modify: `docs/design-system/design-system.pen` — variable table and node bindings.
- Read: `packages/design-tokens/src/reference.ts` — exact reference and foundation values.
- Read: `packages/design-tokens/src/themes/light.ts` — exact light semantic/domain values.
- Read: `packages/design-tokens/src/themes/dark.ts` — exact dark semantic/domain values.
- Verify: `package.json` scripts `tokens:verify` and `lint`.

No commit step is included because the user has not explicitly requested a commit.

---

### Task 1: Replace Pencil Variables

**Files:**
- Modify: `docs/design-system/design-system.pen`

- [ ] **Step 1: Read current variables**

Run `pencil_get_variables` for `docs/design-system/design-system.pen`.

Expected: output includes `ws-accent`, `ws-bg-primary`, `ws-font-primary`, and `ws-spacing-xs`.

- [ ] **Step 2: Build the complete replacement map**

Create the `variables` object directly from these source trees:

- `ref.*` from `reference.ts`: all gray, blue, red, green, yellow, `darkSurface`, `darkText`, `darkAccent` entries.
- `color.*`, `editor.*`, `workspace.*` from `light.ts` and `dark.ts`, using themed values with `{ mode: "light" }` and `{ mode: "dark" }`.
- `typography.*`, `spacing.*`, `radius.*`, `shadow.*`, `motion.*`, `z-index.*` from `reference.ts`.

Use Pencil types exactly:

```json
{
  "color.bg.primary": { "type": "color", "value": [{ "value": "#ffffff", "theme": { "mode": "light" } }, { "value": "#181818", "theme": { "mode": "dark" } }] },
  "spacing.4": { "type": "number", "value": 16 },
  "typography.weight.semibold": { "type": "string", "value": "600" }
}
```

Convert alpha values to 8-digit hex: `0.15 -> 26`, `0.18 -> 2e`, `0.25 -> 40`, `0.5 -> 80`, `0.7 -> b3`.

- [ ] **Step 3: Replace the variable table**

Run `pencil_set_variables` for `/Users/gaojinlong/ThisMac/project/my-km/docs/design-system/design-system.pen` with `replace: true` and pass the complete `variables` object built in Step 2.

Expected: the call succeeds and creates the `mode` theme axis.

- [ ] **Step 4: Verify variable replacement**

Run `pencil_get_variables` again.

Expected: no key starts with `ws-`; keys include `color.bg.primary`, `ref.gray.50`, `spacing.4`, `radius.md`, `editor.selection.bg`, and `workspace.bg.primary`.

---

### Task 2: Bind Foundation Showcase Nodes

**Files:**
- Modify: `docs/design-system/design-system.pen`

- [ ] **Step 1: Read foundation nodes**

Run `pencil_batch_get` for node IDs `8lnOd`, `KAyz4`, `Zu9wI`, `E7U52V`, `AMzMV`, `N3HWP` with `readDepth: 5` and `resolveVariables: false`.

Expected: output includes reference palette, typography, spacing, radius, shadow, motion, and z-index showcase nodes.

- [ ] **Step 2: Bind reference swatches**

Run `pencil_batch_design` updates mapping swatch fills to matching `ref.*` variables, including:

```js
Update("JQf1M", { fill: "$ref.gray.0" })
Update("uqZQz", { fill: "$ref.gray.50" })
Update("Saana", { fill: "$ref.gray.100" })
Update("uxaba", { fill: "$ref.gray.200" })
Update("fRfg8", { fill: "$ref.blue.500" })
Update("sNcc4", { fill: "$ref.red.500" })
Update("dyHhq", { fill: "$ref.green.500" })
Update("T23Bxc", { fill: "$ref.yellow.500" })
```

Expected: swatches keep the same visible colors and read as `$ref.*`.

- [ ] **Step 3: Bind section surfaces and text**

Run `pencil_batch_design`:

```js
Update("mskib", { fill: "$color.bg.primary" })
for (const id of ["F3Bmif", "HelGK", "DcBKY", "a5LKED", "RsJTJ", "R09JPP", "Mi9j6", "G7iFH"]) Update(id, { fill: "$color.bg.secondary", stroke: "$color.border.default" })
for (const id of ["8lnOd", "KAyz4", "Zu9wI", "E7U52V", "AMzMV", "N3HWP"]) Update(id, { fill: "$color.bg.tertiary", stroke: "$color.border.default" })
for (const id of ["SDYRO", "IK9ku", "AAL9T", "OCw5o", "LxLyq", "s64AS6", "NnMj4", "Jt8uY", "N3WH7t", "UO6fi", "QwlgL"]) Update(id, { fill: "$color.fg.primary" })
```

Expected: major foundation chrome uses `$color.*` variables.

- [ ] **Step 4: Bind spacing, radius, and accent previews**

Run `pencil_batch_design`:

```js
for (const id of ["MGHJo", "ZBL1C", "ZWfOu", "Ptp47", "HPnuW", "ZXvym"]) Update(id, { gap: "$spacing.2" })
Update("Uz7la", { fill: "$color.accent.default", width: "$spacing.1", cornerRadius: "$radius.sm" })
Update("VKNOp", { fill: "$color.accent.default", width: "$spacing.2", cornerRadius: "$radius.sm" })
Update("hyQ1G", { fill: "$color.bg.tertiary", stroke: "$color.border.default", cornerRadius: "$radius.sm" })
Update("ZD0n5", { fill: "$color.bg.tertiary", stroke: "$color.border.default", cornerRadius: "$radius.md" })
Update("fF8n7", { fill: "$color.bg.tertiary", stroke: "$color.border.default", cornerRadius: "$radius.lg" })
```

Expected: preview geometry and color stay equivalent.

---

### Task 3: Bind Remaining High-Confidence Sections

**Files:**
- Modify: `docs/design-system/design-system.pen`

- [ ] **Step 1: Read remaining sections**

Run `pencil_batch_get` for node IDs `G7iFH`, `DcBKY`, `a5LKED`, `RsJTJ`, `R09JPP`, `Mi9j6` with `readDepth: 4` and `resolveVariables: false`.

Expected: output includes theme panels, primitive cards, pattern rows, domain rows, state rows, and migration note groups.

- [ ] **Step 2: Bind panels, cards, and headings**

Run `pencil_batch_design`:

```js
Update("ceUK3", { fill: "$color.bg.primary", stroke: "$color.border.default", cornerRadius: "$radius.lg" })
Update("eHVl4", { fill: "$color.bg.primary", stroke: "$color.border.default", cornerRadius: "$radius.lg" })
for (const id of ["aHEa3", "FHrXv", "uQYJ8", "m6zYeu", "y3uPEj", "zVOsd"]) Update(id, { fill: "$color.bg.tertiary", stroke: "$color.border.default", cornerRadius: "$radius.xl" })
for (const id of ["lHWLD", "i8MTy", "I4DKr", "x0Lle", "SUZuX", "eplNb", "W6kjiP", "eN1Z5", "sjfGH", "XauYR"]) Update(id, { fill: "$color.fg.primary" })
```

Expected: non-foundation sections use semantic surface, border, radius, and text variables.

- [ ] **Step 3: Bind row text after re-reading current IDs**

Use the output from Step 1 to update visible row names to `$color.fg.primary` and row descriptions to `$color.fg.muted`.

Expected: list sections keep the same hierarchy and contrast; direct raw white, gray, and muted text colors are replaced where mappings are unambiguous.

---

### Task 4: Verify Design and Token Integrity

**Files:**
- Verify: `docs/design-system/design-system.pen`
- Verify: `package.json`

- [ ] **Step 1: Verify variables and bindings**

Run `pencil_get_variables`, then `pencil_batch_get` for `mskib` with `readDepth: 3` and `resolveVariables: false`.

Expected: no `ws-*` variables remain, and visible sections contain `$color.*`, `$ref.*`, `$spacing.*`, and `$radius.*` references.

- [ ] **Step 2: Check layout problems**

Run `pencil_snapshot_layout` for `mskib` with `problemsOnly: true`.

Expected: no clipped or broken layout problems caused by variable binding.

- [ ] **Step 3: Run token verification**

Run:

```bash
pnpm tokens:verify
```

Expected: command exits 0.

- [ ] **Step 4: Run lint**

Run:

```bash
pnpm lint
```

Expected: command exits 0 or reports pre-existing issues unrelated to this Pencil-only change.

## Self-Review

- Spec coverage: Task 1 covers variable replacement and `ws-*` removal; Tasks 2-3 cover binding fixed values; Task 4 covers verification.
- Placeholder scan: no `TBD`, `TODO`, or incomplete implementation sections remain.
- Type consistency: Pencil variable names use dot-separated token names and `$variable` references required by the `.pen` schema.
