# Primitives Visual Matrix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand `docs/design-system/design-system.pen` node `J8eHA` into a complete visual matrix for every primitive listed in `docs/design-system/spec.md` §3.2.

**Architecture:** This is a design-only change. Keep the existing `03 Primitives` title and intro, replace the six simple rows with six family sections, and add compact visual matrix cards for every primitive. Only `J8eHA` should change.

**Tech Stack:** Pencil design tools (`pencil_batch_get`, `pencil_batch_design`, `pencil_snapshot_layout`, `pencil_get_screenshot`), existing design-system docs, Git status checks.

---

## File Structure

- Modify: `docs/design-system/design-system.pen` — authoritative visual design-system spec; only node `J8eHA` changes.
- Read: `docs/superpowers/specs/2026-06-14-primitives-visual-matrix-design.md` — approved scope.
- Read: `docs/design-system/spec.md:256-279` — canonical primitive inventory.

Do not modify production code, token package files, or unrelated docs. Do not commit unless the user explicitly asks.

## Inventory

```text
Form inputs: Button, IconButton, Input, Textarea, Select, Checkbox, Radio, Switch, Slider, Field, Label, FormControl
Overlays: Dialog, AlertDialog, Drawer, Popover, Tooltip, DropdownMenu, ContextMenu, HoverCard
Navigation and containers: Tabs, Accordion, Collapsible, ScrollArea, Separator, Card, Toolbar
Feedback: Alert, Toast, Banner, Progress, Spinner, Skeleton
Data display: Avatar, Badge, Tag, Kbd, Code, Table, List
Navigation helpers: Breadcrumb, Pagination, CommandPalette
```

## Visual Rules

Use the current dark style in `J8eHA`: frame `#1e1e1e`, frame stroke `#333333`, section fill `#262626`, card fill `#1f1f1f`, card stroke `#3a3a3a`, primary text `#ffffff`, muted text `#b8b8b8`, accent `#0969da`, danger `#d1242f`, success `#1a7f37`, warning `#9a6700`, card radius `10`, control radius `6`.

Each primitive card must include a primitive name, short API/state note, miniature visual examples, and labels for ambiguous states.

---

### Task 1: Baseline Check

**Files:**
- Read: `docs/superpowers/specs/2026-06-14-primitives-visual-matrix-design.md`
- Read: `docs/design-system/spec.md:256-279`
- Read: `docs/design-system/design-system.pen` node `J8eHA`

- [ ] **Step 1: Read approved spec**

Use: `read /Users/gaojinlong/ThisMac/project/my-km/docs/superpowers/specs/2026-06-14-primitives-visual-matrix-design.md`

Expected: It states that `J8eHA` becomes a complete visual reference for all primitives from `docs/design-system/spec.md` §3.2.

- [ ] **Step 2: Read canonical inventory**

Use: `read /Users/gaojinlong/ThisMac/project/my-km/docs/design-system/spec.md` with `offset=256`, `limit=30`.

Expected: The output includes the six primitive families and component lists.

- [ ] **Step 3: Read current design node**

Use `pencil_batch_get`:

```json
{"filePath":"docs/design-system/design-system.pen","nodeIds":["J8eHA"],"readDepth":3}
```

Expected: `J8eHA` contains title `Primitives`, one description, and six summary rows: Button, Input, Card, Badge, Tooltip, Spinner.

- [ ] **Step 4: Inspect working tree**

Run:

```bash
git status --short
```

Expected: Existing unrelated changes may exist. Leave them untouched.

---

### Task 2: Create Family Sections

**Files:**
- Modify: `docs/design-system/design-system.pen` node `J8eHA`

- [ ] **Step 1: Replace six old rows with six section frames**

Use `pencil_batch_design`:

```json
{"filePath":"docs/design-system/design-system.pen","input":"In node J8eHA named '03 Primitives', keep the existing title 'Primitives' and existing description. Remove the six simple rows named Button, Input, Card, Badge, Tooltip, and Spinner. Add six full-width vertical family section frames below the description with 24px gap. Section names exactly: Form inputs, Overlays, Navigation and containers, Feedback, Data display, Navigation helpers. Each section uses fill #262626, stroke #3a3a3a, radius 10, padding 20, gap 16, a 16px semibold white title, and an 11px muted description. Do not modify anything outside J8eHA."}
```

Expected: `J8eHA` has six family sections and no old summary rows.

- [ ] **Step 2: Verify layout**

Use `pencil_snapshot_layout`:

```json
{"filePath":"docs/design-system/design-system.pen","parentId":"J8eHA","maxDepth":3,"problemsOnly":true}
```

Expected: No clipped section content.

---

### Task 3: Add Form Input Matrices

**Files:**
- Modify: `docs/design-system/design-system.pen` node `J8eHA`

- [ ] **Step 1: Add 12 form input cards**

Use `pencil_batch_design`:

```json
{"filePath":"docs/design-system/design-system.pen","input":"Inside Form inputs under J8eHA, add compact matrix cards for exactly: Button, IconButton, Input, Textarea, Select, Checkbox, Radio, Switch, Slider, Field, Label, FormControl. Use a 3-column grid. Each card uses fill #1f1f1f, stroke #3a3a3a, radius 10, padding 14, gap 10, 14px semibold white name, muted 10px note, and miniature visuals. Show: Button solid/soft/outline/ghost/link/disabled/loading; IconButton sm/md/lg/active/disabled; Input default/focus/error/disabled; Textarea default/multiline/error/disabled; Select trigger/open/selected/disabled; Checkbox unchecked/checked/indeterminate/disabled; Radio unchecked/selected/grouped/disabled; Switch off/on/focus/disabled; Slider min/mid/max/disabled; Field label/helper/error/required; Label default/required/disabled; FormControl label + input + helper + error."}
```

Expected: The section contains 12 visually distinct cards.

- [ ] **Step 2: Verify layout**

Use `pencil_snapshot_layout` for `J8eHA` with `maxDepth=4`, `problemsOnly=true`.

Expected: No clipped form input cards.

---

### Task 4: Add Overlay Matrices

**Files:**
- Modify: `docs/design-system/design-system.pen` node `J8eHA`

- [ ] **Step 1: Add 8 overlay cards**

Use `pencil_batch_design`:

```json
{"filePath":"docs/design-system/design-system.pen","input":"Inside Overlays under J8eHA, add compact matrix cards for exactly: Dialog, AlertDialog, Drawer, Popover, Tooltip, DropdownMenu, ContextMenu, HoverCard. Use the same 3-column grid and card style as Form inputs. Show: Dialog trigger/open panel/title-body-actions/close; AlertDialog destructive confirmation/cancel/confirm; Drawer trigger/open side sheet; Popover trigger/anchored content; Tooltip hover tooltip/delayed help; DropdownMenu trigger/open/checked item/disabled item; ContextMenu right-click surface/nested item/shortcut text; HoverCard anchored preview. Add labels for closed, open, disabled, destructive."}
```

Expected: The section contains 8 overlay cards.

- [ ] **Step 2: Verify layout**

Use `pencil_snapshot_layout` for `J8eHA` with `maxDepth=4`, `problemsOnly=true`.

Expected: No clipped overlay cards.

---

### Task 5: Add Navigation, Feedback, Data, and Helper Matrices

**Files:**
- Modify: `docs/design-system/design-system.pen` node `J8eHA`

- [ ] **Step 1: Add navigation and container cards**

Use `pencil_batch_design`:

```json
{"filePath":"docs/design-system/design-system.pen","input":"Inside Navigation and containers under J8eHA, add compact matrix cards for exactly: Tabs, Accordion, Collapsible, ScrollArea, Separator, Card, Toolbar. Use the same 3-column grid and card style. Show: Tabs tab list/active/hover/disabled; Accordion collapsed/expanded/disabled; Collapsible closed row/expanded content; ScrollArea viewport/overflow/scrollbar thumb; Separator horizontal/vertical/subtle/strong; Card surface/header-body-footer/selected interactive; Toolbar icon group/separator/pressed/disabled."}
```

Expected: The section contains 7 cards.

- [ ] **Step 2: Add feedback cards**

Use `pencil_batch_design`:

```json
{"filePath":"docs/design-system/design-system.pen","input":"Inside Feedback under J8eHA, add compact matrix cards for exactly: Alert, Toast, Banner, Progress, Spinner, Skeleton. Use the same 3-column grid and card style. Show: Alert info/success/warning/error; Toast neutral/success/error/action; Banner inline info/warning/dismissible; Progress 0 percent/45 percent/100 percent/indeterminate; Spinner sm/md/lg/on dark; Skeleton text/avatar/card/loading group."}
```

Expected: The section contains 6 cards.

- [ ] **Step 3: Add data display cards**

Use `pencil_batch_design`:

```json
{"filePath":"docs/design-system/design-system.pen","input":"Inside Data display under J8eHA, add compact matrix cards for exactly: Avatar, Badge, Tag, Kbd, Code, Table, List. Use the same 3-column grid and card style. Show: Avatar image/fallback/group/status; Badge neutral/success/warning/error; Tag default/removable/selected/disabled; Kbd single key/chord/compact; Code inline/block/copy affordance; Table header/row/selected row/empty row; List unordered/ordered/dense/interactive item."}
```

Expected: The section contains 7 cards.

- [ ] **Step 4: Add navigation helper cards**

Use `pencil_batch_design`:

```json
{"filePath":"docs/design-system/design-system.pen","input":"Inside Navigation helpers under J8eHA, add compact matrix cards for exactly: Breadcrumb, Pagination, CommandPalette. Use the same card style. Breadcrumb shows root/parent/current/truncated. Pagination shows previous/page numbers/current/disabled next. CommandPalette shows trigger/search input/result list/keyboard shortcut/empty result."}
```

Expected: The section contains 3 cards.

- [ ] **Step 5: Verify layout**

Use `pencil_snapshot_layout` for `J8eHA` with `maxDepth=4`, `problemsOnly=true`.

Expected: No clipped cards in any section.

---

### Task 6: Final Verification

**Files:**
- Verify: `docs/design-system/design-system.pen` node `J8eHA`

- [ ] **Step 1: Verify all primitive names are present**

Use `pencil_batch_get` on `J8eHA` with `readDepth=5` and confirm these 43 labels are present: Button, IconButton, Input, Textarea, Select, Checkbox, Radio, Switch, Slider, Field, Label, FormControl, Dialog, AlertDialog, Drawer, Popover, Tooltip, DropdownMenu, ContextMenu, HoverCard, Tabs, Accordion, Collapsible, ScrollArea, Separator, Card, Toolbar, Alert, Toast, Banner, Progress, Spinner, Skeleton, Avatar, Badge, Tag, Kbd, Code, Table, List, Breadcrumb, Pagination, CommandPalette.

Expected: Every name appears once as a primitive card heading.

- [ ] **Step 2: Check for layout problems**

Use `pencil_snapshot_layout`:

```json
{"filePath":"docs/design-system/design-system.pen","parentId":"J8eHA","maxDepth":5,"problemsOnly":true}
```

Expected: No clipped, overlapping, or hidden content.

- [ ] **Step 3: Capture screenshot**

Use `pencil_get_screenshot`:

```json
{"filePath":"docs/design-system/design-system.pen","nodeId":"J8eHA"}
```

Expected: The screenshot shows six family sections and complete visual matrices.

- [ ] **Step 4: Check git diff scope**

Run:

```bash
git status --short && git diff -- docs/design-system/design-system.pen
```

Expected: The implementation diff includes `docs/design-system/design-system.pen`. Existing unrelated modified files remain untouched.

## Self-Review

- Spec coverage: Tasks 2-6 cover structure, all six families, all listed primitives, matrix states, dark visual direction, and verification.
- Placeholder scan: No placeholder markers or deferred implementation instructions remain.
- Type/name consistency: Family and primitive names match `docs/design-system/spec.md` §3.2 and the approved design spec.
