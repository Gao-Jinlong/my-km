# Design System Product-First Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `docs/design-system/design-system.pen` into a product-first visual spec for the my-km knowledge workbench.

**Architecture:** The design file will be reorganized around four main frames: product overview, foundations/tokens, components/states, and product patterns. Existing design-system governance and token naming remain intact, while Pencil variables and reusable primitive specs are updated to support a richer Product Workbench visual language.

**Tech Stack:** Pencil MCP tools (`get_variables`, `set_variables`, `batch_get`, `batch_design`, `snapshot_layout`, `get_screenshot`, `export_nodes`), existing `.pen` variables, Git for plan commits.

---

## File Map

- Modify: `docs/design-system/design-system.pen`
  - Authoritative visual spec. Edit only through Pencil MCP/editor operations.
- Read: `docs/design-system/agent-guide.md`
  - Confirms design-first governance and `.pen` editing constraints.
- Read: `docs/design-system/spec.md`
  - Confirms token, primitive, and pattern boundaries.
- Read: `docs/superpowers/specs/2026-06-15-design-system-product-first-redesign-design.md`
  - Approved redesign spec.
- Create verification artifacts as needed under a temporary directory such as `D:\projects\my-km\.tmp\design-system-redesign\`
  - Screenshots/exports for visual inspection. Do not commit these unless the user asks.

## Baseline Constraints

- Treat the current modified `docs/design-system/design-system.pen` as the working baseline. Do not revert it.
- Do not script-read, generate, or modify `.pen` directly with filesystem scripts.
- Preserve the 43 reusable primitive nodes or recreate equivalent reusable primitive specs if a full canvas rebuild makes that cleaner.
- Preserve token naming structure: `ref.*`, `color.*`, `workspace.*`, `editor.*`, `typography.*`, `spacing.*`, `radius.*`, `shadow.*`, `motion.*`, and `z-index.*`.
- Keep the design utilitarian and dense. Avoid landing-page composition, decorative orbs, and oversized marketing type.

---

### Task 1: Capture Baseline and Update Design Variables

**Files:**
- Modify: `docs/design-system/design-system.pen`
- Reference: `docs/superpowers/specs/2026-06-15-design-system-product-first-redesign-design.md`

- [ ] **Step 1: Capture current editor state and variables**

Run Pencil reads:

```text
get_editor_state(include_schema=false)
get_variables(filePath="D:\\projects\\my-km\\docs\\design-system\\design-system.pen")
snapshot_layout(filePath="D:\\projects\\my-km\\docs\\design-system\\design-system.pen", maxDepth=2)
```

Expected:

- Top-level frames and reusable primitive count are visible.
- Current variables include the existing GitHub-like blue/gray palette.
- No direct filesystem read/write of the `.pen` file is used.

- [ ] **Step 2: Update color and shadow variables through Pencil**

Use `set_variables` with `replace=false` and this variable update set:

```json
{
  "ref.blue.50": { "type": "color", "value": "#eaf2ff" },
  "ref.blue.100": { "type": "color", "value": "#d7e7ff" },
  "ref.blue.200": { "type": "color", "value": "#b8d4ff" },
  "ref.blue.300": { "type": "color", "value": "#8bb8ff" },
  "ref.blue.400": { "type": "color", "value": "#4f8df7" },
  "ref.blue.500": { "type": "color", "value": "#2563eb" },
  "ref.blue.600": { "type": "color", "value": "#1d4ed8" },
  "ref.blue.700": { "type": "color", "value": "#1e40af" },
  "ref.blue.800": { "type": "color", "value": "#1e3a8a" },
  "ref.blue.900": { "type": "color", "value": "#172554" },
  "ref.cyan.50": { "type": "color", "value": "#ecfeff" },
  "ref.cyan.100": { "type": "color", "value": "#cffafe" },
  "ref.cyan.300": { "type": "color", "value": "#67e8f9" },
  "ref.cyan.500": { "type": "color", "value": "#06b6d4" },
  "ref.cyan.700": { "type": "color", "value": "#0e7490" },
  "ref.teal.50": { "type": "color", "value": "#f0fdfa" },
  "ref.teal.100": { "type": "color", "value": "#ccfbf1" },
  "ref.teal.500": { "type": "color", "value": "#14b8a6" },
  "ref.teal.700": { "type": "color", "value": "#0f766e" },
  "ref.gray.0": { "type": "color", "value": "#ffffff" },
  "ref.gray.50": { "type": "color", "value": "#f8fafc" },
  "ref.gray.100": { "type": "color", "value": "#eef2f7" },
  "ref.gray.200": { "type": "color", "value": "#d9e2ec" },
  "ref.gray.300": { "type": "color", "value": "#b8c4d2" },
  "ref.gray.400": { "type": "color", "value": "#8a98aa" },
  "ref.gray.500": { "type": "color", "value": "#64748b" },
  "ref.gray.600": { "type": "color", "value": "#475569" },
  "ref.gray.700": { "type": "color", "value": "#334155" },
  "ref.gray.800": { "type": "color", "value": "#1f2937" },
  "ref.gray.900": { "type": "color", "value": "#111827" },
  "ref.gray.950": { "type": "color", "value": "#07111f" },
  "color.bg.primary": {
    "type": "color",
    "value": [
      { "theme": { "mode": "light" }, "value": "#ffffff" },
      { "theme": { "mode": "dark" }, "value": "#0b1118" }
    ]
  },
  "color.bg.secondary": {
    "type": "color",
    "value": [
      { "theme": { "mode": "light" }, "value": "#f8fafc" },
      { "theme": { "mode": "dark" }, "value": "#101820" }
    ]
  },
  "color.bg.tertiary": {
    "type": "color",
    "value": [
      { "theme": { "mode": "light" }, "value": "#eef2f7" },
      { "theme": { "mode": "dark" }, "value": "#172233" }
    ]
  },
  "color.bg.hover": {
    "type": "color",
    "value": [
      { "theme": { "mode": "light" }, "value": "#eef6ff" },
      { "theme": { "mode": "dark" }, "value": "#1b2a3d" }
    ]
  },
  "color.bg.active": {
    "type": "color",
    "value": [
      { "theme": { "mode": "light" }, "value": "#dbeafe" },
      { "theme": { "mode": "dark" }, "value": "#0f3158" }
    ]
  },
  "color.fg.primary": {
    "type": "color",
    "value": [
      { "theme": { "mode": "light" }, "value": "#111827" },
      { "theme": { "mode": "dark" }, "value": "#e5edf7" }
    ]
  },
  "color.fg.secondary": {
    "type": "color",
    "value": [
      { "theme": { "mode": "light" }, "value": "#334155" },
      { "theme": { "mode": "dark" }, "value": "#b9c6d8" }
    ]
  },
  "color.fg.muted": {
    "type": "color",
    "value": [
      { "theme": { "mode": "light" }, "value": "#64748b" },
      { "theme": { "mode": "dark" }, "value": "#8fa1b7" }
    ]
  },
  "color.border.default": {
    "type": "color",
    "value": [
      { "theme": { "mode": "light" }, "value": "#d9e2ec" },
      { "theme": { "mode": "dark" }, "value": "#263447" }
    ]
  },
  "color.border.subtle": {
    "type": "color",
    "value": [
      { "theme": { "mode": "light" }, "value": "#e7edf5" },
      { "theme": { "mode": "dark" }, "value": "#1d2a3a" }
    ]
  },
  "color.border.strong": {
    "type": "color",
    "value": [
      { "theme": { "mode": "light" }, "value": "#b8c4d2" },
      { "theme": { "mode": "dark" }, "value": "#3d5169" }
    ]
  },
  "color.border.focus": {
    "type": "color",
    "value": [
      { "theme": { "mode": "light" }, "value": "#2563eb" },
      { "theme": { "mode": "dark" }, "value": "#67e8f9" }
    ]
  },
  "color.accent.default": {
    "type": "color",
    "value": [
      { "theme": { "mode": "light" }, "value": "#2563eb" },
      { "theme": { "mode": "dark" }, "value": "#67e8f9" }
    ]
  },
  "color.accent.hover": {
    "type": "color",
    "value": [
      { "theme": { "mode": "light" }, "value": "#1d4ed8" },
      { "theme": { "mode": "dark" }, "value": "#22d3ee" }
    ]
  },
  "color.accent.active": {
    "type": "color",
    "value": [
      { "theme": { "mode": "light" }, "value": "#1e40af" },
      { "theme": { "mode": "dark" }, "value": "#06b6d4" }
    ]
  },
  "color.accent.subtle-bg": {
    "type": "color",
    "value": [
      { "theme": { "mode": "light" }, "value": "#eaf2ff" },
      { "theme": { "mode": "dark" }, "value": "#12304a" }
    ]
  },
  "color.accent.subtle-fg": {
    "type": "color",
    "value": [
      { "theme": { "mode": "light" }, "value": "#1e40af" },
      { "theme": { "mode": "dark" }, "value": "#a5f3fc" }
    ]
  },
  "editor.selection.bg": {
    "type": "color",
    "value": [
      { "theme": { "mode": "light" }, "value": "#2563eb24" },
      { "theme": { "mode": "dark" }, "value": "#67e8f933" }
    ]
  },
  "editor.surface.bg": {
    "type": "color",
    "value": [
      { "theme": { "mode": "light" }, "value": "#ffffff" },
      { "theme": { "mode": "dark" }, "value": "#0f1720" }
    ]
  },
  "workspace.bg.primary": {
    "type": "color",
    "value": [
      { "theme": { "mode": "light" }, "value": "#ffffff" },
      { "theme": { "mode": "dark" }, "value": "#0b1118" }
    ]
  },
  "workspace.bg.secondary": {
    "type": "color",
    "value": [
      { "theme": { "mode": "light" }, "value": "#f3f7fb" },
      { "theme": { "mode": "dark" }, "value": "#101820" }
    ]
  },
  "workspace.bg.tertiary": {
    "type": "color",
    "value": [
      { "theme": { "mode": "light" }, "value": "#e8eef6" },
      { "theme": { "mode": "dark" }, "value": "#172233" }
    ]
  },
  "workspace.accent.default": {
    "type": "color",
    "value": [
      { "theme": { "mode": "light" }, "value": "#0f766e" },
      { "theme": { "mode": "dark" }, "value": "#67e8f9" }
    ]
  },
  "shadow.sm": { "type": "string", "value": "0 1px 2px rgb(15 23 42 / 0.06)" },
  "shadow.md": { "type": "string", "value": "0 8px 20px rgb(15 23 42 / 0.10), 0 1px 2px rgb(15 23 42 / 0.06)" },
  "shadow.lg": { "type": "string", "value": "0 18px 45px rgb(15 23 42 / 0.16), 0 4px 10px rgb(15 23 42 / 0.08)" },
  "shadow.overlay": { "type": "string", "value": "0 0 0 1px rgb(15 23 42 / 0.08), 0 24px 60px rgb(15 23 42 / 0.24)" },
  "shadow.focus-ring": { "type": "string", "value": "0 0 0 3px color-mix(in srgb, var(--color-border-focus) 28%, transparent)" }
}
```

Expected:

- Variables remain valid.
- Light mode becomes richer while staying neutral.
- Dark mode can support real chrome/panel surfaces.

- [ ] **Step 3: Verify variables**

Run:

```text
get_variables(filePath="D:\\projects\\my-km\\docs\\design-system\\design-system.pen")
```

Expected:

- New `ref.cyan.*` and `ref.teal.*` variables exist.
- `color.accent.default`, `workspace.bg.*`, and `editor.selection.bg` reflect the new Product Workbench palette.

- [ ] **Step 4: Capture baseline screenshots**

Run screenshots for the current major frames before rebuilding:

```text
get_screenshot(filePath="D:\\projects\\my-km\\docs\\design-system\\design-system.pen", nodeId="mskib")
get_screenshot(filePath="D:\\projects\\my-km\\docs\\design-system\\design-system.pen", nodeId="hmSyC")
```

Expected:

- Baseline screenshots show the old documentation-like layout and old primitive grid.
- These screenshots are used only for comparison.

- [ ] **Step 5: Commit checkpoint**

Run:

```powershell
git status --short
```

Expected:

- `docs/design-system/design-system.pen` is modified.
- No unrelated files are staged.

Do not commit yet if this task is executed in the same branch as later visual edits; instead use this as a checkpoint before large canvas recomposition.

---

### Task 2: Rebuild Top-Level Canvas Structure

**Files:**
- Modify: `docs/design-system/design-system.pen`

- [ ] **Step 1: Read current top-level frames**

Run:

```text
batch_get(filePath="D:\\projects\\my-km\\docs\\design-system\\design-system.pen", readDepth=2)
```

Expected:

- Current top-level frames include the old `Design System` and `Primitive Component Library`.
- Existing reusable primitive nodes are identifiable.

- [ ] **Step 2: Create four Product-First top-level frames**

Use `batch_design` to create or transform the top-level structure into these frames:

```text
00 Product Workbench Overview
01 Foundations & Tokens
02 Components & States
03 Product Patterns
```

Layout requirements:

- Arrange frames horizontally from left to right for easier scanning.
- Use widths around 1600-2200px per frame depending on content.
- Use `color.bg.secondary` as canvas/page background and `color.bg.primary` for main surfaces.
- Use 40-56px outer padding and 24-32px internal section gaps.
- Preserve or move the existing primitive reusable nodes into `02 Components & States` rather than deleting them blindly.

Expected:

- The document reads as a product-first system, not one long vertical document.
- Old content can remain temporarily off to the side if needed during recomposition, but final verification should not leave duplicated confusing top-level frames.

- [ ] **Step 3: Add shared section header treatment**

Use `batch_design` to add a consistent header pattern to each frame:

- Eyebrow label: `my-km design system`
- Frame title, such as `Product Workbench Overview`
- One-sentence description
- Small token chips for section scope, such as `workspace.*`, `editor.*`, `primitive`, `pattern`

Expected:

- Headers are compact and scannable.
- No long paragraph blocks dominate the design file.

- [ ] **Step 4: Verify structure**

Run:

```text
snapshot_layout(filePath="D:\\projects\\my-km\\docs\\design-system\\design-system.pen", maxDepth=1)
```

Expected:

- Four main frames are visible.
- No clipped top-level content.
- Any old holding frames are clearly outside the main flow or removed.

---

### Task 3: Build 00 Product Workbench Overview

**Files:**
- Modify: `docs/design-system/design-system.pen`

- [ ] **Step 1: Create workspace shell mockup**

Use `batch_design` inside `00 Product Workbench Overview` to create a realistic app shell:

- Dark compact left rail, 64px wide.
- Workspace sidebar, 240-280px wide.
- Main editor panel.
- Right AI/context panel, 300-360px wide.
- Top command/search area spanning editor and context panels.

Content labels:

- Left rail: compact icons or letter labels for Home, Search, Graph, Settings.
- Sidebar: `Personal OS`, `Inbox`, `Research`, `Writing`, `Projects`, `Archive`.
- Top command: `Search notes, ask AI, run command...`
- Editor title: `Design system migration notes`
- AI panel title: `Context assistant`

Expected:

- The first frame immediately communicates a mature knowledge workbench.
- The visual balance is high-density and calm.

- [ ] **Step 2: Add editor content states**

Add product-like editor content:

- Heading and subheading.
- Body paragraphs represented by readable text lines.
- Inline code chip using `editor.code.inline.bg`.
- Quote block with `editor.quote.border`.
- Selected text or highlighted block using `editor.selection.bg`.
- Focus ring on one command/input surface.

Expected:

- Editor-specific tokens are visible in context.
- The editor feels like a writing surface, not a blank rectangle.

- [ ] **Step 3: Add AI and graph/context details**

Add right-side details:

- AI status pill: `Analyzing 8 sources`.
- Source chips: `Notes`, `Graph`, `Recent edits`.
- Insight card with a short recommendation.
- Context graph/list preview with node dots and connecting lines.
- Prompt input at bottom with send/action affordance.

Expected:

- AI-native nature is visible without making the whole page theatrical.
- Dark or deep surface accents anchor the right panel.

- [ ] **Step 4: Add token callouts**

Place compact callouts near the mockup:

- `workspace.bg.secondary`
- `editor.surface.bg`
- `editor.selection.bg`
- `color.accent.default`
- `shadow.overlay`
- `color.border.focus`

Expected:

- Callouts are small, aligned, and do not obscure the product mockup.

- [ ] **Step 5: Screenshot overview**

Run:

```text
get_screenshot(filePath="D:\\projects\\my-km\\docs\\design-system\\design-system.pen", nodeId="<00 Product Workbench Overview frame id>")
```

Expected:

- Screenshot reads as a product workbench at first glance.
- No overlapping labels.
- Text remains legible at screenshot scale.

---

### Task 4: Build 01 Foundations & Tokens

**Files:**
- Modify: `docs/design-system/design-system.pen`

- [ ] **Step 1: Create surface ladder board**

Use `batch_design` to add a surface ladder:

- `canvas / app background`
- `workspace shell`
- `panel`
- `card`
- `raised overlay`
- `modal`

Each row should show:

- Swatch or mini surface example.
- Token name.
- Light value visual.
- Dark value visual.
- Usage note.

Expected:

- Surface hierarchy is more obvious than the old flat color list.

- [ ] **Step 2: Create semantic color board**

Add semantic groups:

- Accent
- Info
- Success
- Warning
- Error
- Focus
- Selection

Each group should show:

- Default color.
- Subtle background.
- Foreground/text example.
- A small component sample such as badge, alert, or focus outline.

Expected:

- Feedback colors feel integrated with the blue/cyan/teal product palette.

- [ ] **Step 3: Create typography and density board**

Add typography examples:

- Display/section title.
- UI label.
- Body.
- Caption.
- Mono/token label.
- Editor heading/body/code examples.

Use product copy:

- `Workspace`
- `Context assistant`
- `Run command`
- `editor.selection.bg`

Expected:

- The board demonstrates hierarchy without giant marketing type.

- [ ] **Step 4: Create spacing, radius, shadow, and motion board**

Add applied examples:

- Compact button group for spacing.
- Nested panel/card examples for radius.
- Floating command palette for shadow.
- Motion duration chips with `fast`, `base`, `slow`.
- z-index stack diagram using overlay layers.

Expected:

- Foundations are shown as applied UI decisions.

- [ ] **Step 5: Screenshot foundations**

Run:

```text
get_screenshot(filePath="D:\\projects\\my-km\\docs\\design-system\\design-system.pen", nodeId="<01 Foundations & Tokens frame id>")
snapshot_layout(filePath="D:\\projects\\my-km\\docs\\design-system\\design-system.pen", parentId="<01 Foundations & Tokens frame id>", maxDepth=3)
```

Expected:

- No clipped rows.
- Boards are aligned and readable.
- Light/dark comparisons are visually distinct.

---

### Task 5: Rebuild 02 Components & States

**Files:**
- Modify: `docs/design-system/design-system.pen`

- [ ] **Step 1: Inventory reusable primitive nodes**

Run:

```text
batch_get(
  filePath="D:\\projects\\my-km\\docs\\design-system\\design-system.pen",
  patterns=[{ "reusable": true }],
  readDepth=2,
  searchDepth=5
)
```

Expected:

- The 43 primitive components are present or their replacements are ready to be created.

- [ ] **Step 2: Create component family sections**

Use `batch_design` in `02 Components & States` to create these family sections:

- Form inputs
- Overlays
- Navigation and containers
- Feedback
- Data display
- Navigation helpers

Expected:

- Component families match the current spec and existing primitive list.
- Sections use consistent spacing and headings.

- [ ] **Step 3: Recompose primitive cards**

For every primitive, create a polished card that includes:

- Primitive name.
- Compact realistic component preview.
- Variant/state chips where relevant.
- Ownership label: `primitive`.

Required primitive names:

```text
Button, IconButton, Input, Textarea, Select, Checkbox, Radio, Switch, Slider, Field, Label, FormControl,
Dialog, AlertDialog, Drawer, Popover, Tooltip, DropdownMenu, ContextMenu, HoverCard,
Tabs, Accordion, Collapsible, ScrollArea, Separator, Card, Toolbar,
Alert, Toast, Banner, Progress, Spinner, Skeleton,
Avatar, Badge, Tag, Kbd, Code, Table, List,
Breadcrumb, Pagination, CommandPalette
```

Expected:

- All 43 primitives remain represented.
- Cards look like concrete component specs rather than blank boxes.

- [ ] **Step 4: Add state matrix**

Add a state matrix showing:

- Default
- Hover
- Active
- Focus
- Disabled
- Loading
- Error

Use Button, Input, Select, Badge, and Menu Item as examples.

Expected:

- Interaction states are visible and reusable.
- Focus state uses `color.border.focus`/`shadow.focus-ring`.

- [ ] **Step 5: Verify primitive count and screenshot**

Run:

```text
batch_get(filePath="D:\\projects\\my-km\\docs\\design-system\\design-system.pen", patterns=[{ "reusable": true }], readDepth=1, searchDepth=5)
get_screenshot(filePath="D:\\projects\\my-km\\docs\\design-system\\design-system.pen", nodeId="<02 Components & States frame id>")
```

Expected:

- There are 43 reusable primitive entries.
- Screenshot shows a polished component matrix.

---

### Task 6: Build 03 Product Patterns

**Files:**
- Modify: `docs/design-system/design-system.pen`

- [ ] **Step 1: Add Editor Workbench pattern**

Create a pattern card with:

- Mini editor layout.
- Toolbar preview.
- Block type selector.
- Floating format menu.
- Token chips: `editor.surface.bg`, `editor.text.body`, `editor.code.inline.bg`, `editor.quote.border`.

Expected:

- Pattern reads as a reusable editor UI composition.

- [ ] **Step 2: Add AI Context Panel pattern**

Create a pattern card with:

- Dark or deep AI panel.
- Source chips.
- Insight card.
- Prompt input.
- Loading/streaming indicator.
- Token chips: `workspace.accent.default`, `color.bg.tertiary`, `shadow.overlay`.

Expected:

- AI UI is distinct but still part of the same system.

- [ ] **Step 3: Add Command Palette pattern**

Create a pattern card with:

- Raised command palette overlay.
- Search input.
- Grouped commands.
- Kbd shortcuts.
- Selected row.

Expected:

- Overlay shadow, focus, and active row states are visible.

- [ ] **Step 4: Add Knowledge Graph / Context Map pattern**

Create a pattern card with:

- Compact graph surface.
- Nodes and edges.
- Side list of related notes.
- Active node or selected cluster.

Expected:

- Graph pattern feels useful and inspectable, not decorative.

- [ ] **Step 5: Add Settings Modal and system states**

Create pattern cards for:

- Settings modal with tabs/fields/toggles.
- Empty state.
- Loading state.
- Error state.
- Permission state.

Expected:

- Product edge states are visually handled by the same design language.

- [ ] **Step 6: Screenshot patterns**

Run:

```text
get_screenshot(filePath="D:\\projects\\my-km\\docs\\design-system\\design-system.pen", nodeId="<03 Product Patterns frame id>")
snapshot_layout(filePath="D:\\projects\\my-km\\docs\\design-system\\design-system.pen", parentId="<03 Product Patterns frame id>", maxDepth=3)
```

Expected:

- Pattern cards are aligned.
- No labels overlap visuals.
- Patterns clearly mention primitive/pattern ownership.

---

### Task 7: Final Verification and Cleanup

**Files:**
- Modify: `docs/design-system/design-system.pen`

- [ ] **Step 1: Run full layout verification**

Run:

```text
snapshot_layout(filePath="D:\\projects\\my-km\\docs\\design-system\\design-system.pen", maxDepth=2)
snapshot_layout(filePath="D:\\projects\\my-km\\docs\\design-system\\design-system.pen", problemsOnly=true)
```

Expected:

- No clipped or incoherently overlapping content in the four main frames.
- If non-critical old/off-canvas content remains, either remove it or label it as archived reference.

- [ ] **Step 2: Export final frames**

Run:

```text
export_nodes(
  filePath="D:\\projects\\my-km\\docs\\design-system\\design-system.pen",
  nodeIds=["<00 frame id>", "<01 frame id>", "<02 frame id>", "<03 frame id>"],
  outputDir="D:\\projects\\my-km\\.tmp\\design-system-redesign",
  format="png",
  scale=1
)
```

Expected:

- Four PNG files are exported.
- Files are used for visual QA only.

- [ ] **Step 3: Inspect final screenshots**

Use screenshots or exported PNGs to verify:

- The first frame reads as a product-grade workbench.
- Foundations show visual token decisions in context.
- Components include all 43 primitives.
- Patterns include editor, AI, command, graph, settings, and system states.
- Typography is legible.
- The palette is not one-note blue/purple and does not rely on decorative gradients.

- [ ] **Step 4: Check git state**

Run:

```powershell
git status --short
```

Expected:

- `docs/design-system/design-system.pen` is modified.
- Plan/spec commits remain intact.
- Temporary `.tmp` or `.superpowers` artifacts are untracked and not staged.

- [ ] **Step 5: Commit design file only after visual verification**

If the user approves the final screenshots, commit only the design file:

```powershell
git add -- docs/design-system/design-system.pen
git commit -m "design: rebuild design system product-first spec"
```

Expected:

- Commit includes only `docs/design-system/design-system.pen`.
- Follow-up code alignment remains out of scope.

---

## Self-Review Notes

- Spec coverage: covered token updates, four-frame canvas structure, product overview, foundations, component matrix, pattern scenes, and verification.
- Red-flag scan: no unfinished markers or unspecified implementation steps remain.
- Scope check: plan modifies the `.pen` design source only. Code packages, Storybook, and app UI remain follow-up work.
