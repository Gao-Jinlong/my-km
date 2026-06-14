# Pencil Primitives Components Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert every `03 Primitives` preview card into a reusable Pencil component, replace the grid cards with instances, and ensure primitive previews use token variables where mappings are direct.

**Architecture:** Work only in `docs/design-system/design-system.pen`. First audit/tokenize the existing primitive cards, then copy each card into a dedicated reusable component library, then replace the original grid cards with `ref` instances. Verify component discoverability, layout integrity, token verification, and lint status.

**Tech Stack:** Pencil MCP tools, `.pen` reusable components, `ref` instances, existing Pencil token variables, pnpm verification scripts.

---

## Files and Responsibilities

- Modify: `docs/design-system/design-system.pen` — primitive reusable components and instances.
- Read: `docs/superpowers/specs/2026-06-14-pencil-primitives-components-design.md` — approved scope.
- Verify: `pnpm tokens:verify`, `pnpm lint`.

No commit step is included because the user has not explicitly requested a commit.

## Primitive Inventory

Names: Button, IconButton, Input, Textarea, Select, Checkbox, Radio, Switch, Slider, Field, Label, FormControl, Dialog, AlertDialog, Drawer, Popover, Tooltip, DropdownMenu, ContextMenu, HoverCard, Tabs, Accordion, Collapsible, ScrollArea, Separator, Card, Toolbar, Alert, Toast, Banner, Progress, Spinner, Skeleton, Avatar, Badge, Tag, Kbd, Code, Table, List, Breadcrumb, Pagination, CommandPalette.

Source card IDs in the same order: `L7n0W Hsu0j U8YHJ dImQL aQqEJ zNomk CNyO7 yyCxt NNC9Y CU3sZ DhZYA yUDdw A7th1 c2sT0V t02PbO CjCxi I69Rj TQFv7 OTPZq Nh4dg RG4iH bFx5u r7UGPF R31UKJ tZPnn Z3iig kLlkR cDbtO GIBRD KKw2k YpbXJ gK7TU mkD7D F5jIW f6qoq g2bWE7 O6qwvp XZdcV QrSXw vRYbw W5DAA Cxss2 jrBlY`.

---

### Task 1: Audit and Tokenize Primitive Cards

**Files:**
- Modify: `docs/design-system/design-system.pen`

- [ ] **Step 1: Read current primitive section**

Run `pencil_batch_get` on `DcBKY` with `readDepth: 6` and `resolveVariables: false`.

Expected: all 43 source card IDs are present under `03 Primitives`.

- [ ] **Step 2: Check for duplicate components**

Run `pencil_batch_get` with pattern `{ "reusable": true }`, `searchDepth: 3`, `readDepth: 1`.

Expected: no existing `primitive/*` reusable components. If any exist, stop with `NEEDS_CONTEXT`.

- [ ] **Step 3: Normalize card shell tokens**

Run `pencil_batch_design` with this card ID list:

```js
ids=["L7n0W","Hsu0j","U8YHJ","dImQL","aQqEJ","zNomk","CNyO7","yyCxt","NNC9Y","CU3sZ","DhZYA","yUDdw","A7th1","c2sT0V","t02PbO","CjCxi","I69Rj","TQFv7","OTPZq","Nh4dg","RG4iH","bFx5u","r7UGPF","R31UKJ","tZPnn","Z3iig","kLlkR","cDbtO","GIBRD","KKw2k","YpbXJ","gK7TU","mkD7D","F5jIW","f6qoq","g2bWE7","O6qwvp","XZdcV","QrSXw","vRYbw","W5DAA","Cxss2","jrBlY"]
for (const id of ids) Update(id,{fill:"$color.bg.secondary",stroke:"$color.border.default",cornerRadius:"$radius.lg"})
```

Expected: all card shells use variables.

- [ ] **Step 4: Normalize title and note tokens**

For each card, update its title text to `$color.fg.primary` and note text to `$color.fg.muted`. Use IDs from Step 1 readback. Example:

```js
Update("K1jrMq",{fill:"$color.fg.primary"})
Update("JhE1O",{fill:"$color.fg.muted"})
```

Expected: no obvious raw title/note colors remain inside the 43 primitive cards.

- [ ] **Step 5: Normalize obvious visual tokens**

Within primitive card visual frames, replace direct fixed values only when unambiguous:

```text
accent/selected -> color.accent.*
neutral surface -> color.bg.*
text/icon -> color.fg.*
border/separator/focus -> color.border.*
feedback -> color.feedback.*
radius -> radius.*
```

Expected: remaining raw values are illustrative geometry, unsupported values, or ambiguous values.

- [ ] **Step 6: Verify token audit**

Run `pencil_batch_get` on `DcBKY` with `readDepth: 6`, `resolveVariables: false`.

Expected: card shells, titles, notes, and obvious visual states use `$color.*` and `$radius.*` variables.

---

### Task 2: Create Reusable Component Library

**Files:**
- Modify: `docs/design-system/design-system.pen`

- [ ] **Step 1: Create library frame**

Run `pencil_batch_design`:

```js
pos=FindEmptySpace({width:2200,height:3600,direction:"top",padding:120,nodeId:"mskib"})
primitiveLibrary=Insert(document,{type:"frame",name:"Primitive Component Library",x:pos.x,y:pos.y,width:2200,layout:"vertical",gap:24,padding:40,fill:"$color.bg.secondary",stroke:"$color.border.default",strokeWidth:1,cornerRadius:"$radius.xl",placeholder:true})
Insert(primitiveLibrary,{type:"text",name:"Title",content:"Primitive Component Library",fontFamily:"Inter",fontSize:20,fontWeight:"700",fill:"$color.fg.primary"})
```

Expected: one top-level placeholder library frame is created.

- [ ] **Step 2: Create category rows**

Run `pencil_batch_design`:

```js
formComponents=Insert(primitiveLibrary,{type:"frame",name:"Form inputs",layout:"horizontal",gap:12,width:"fill_container"})
overlayComponents=Insert(primitiveLibrary,{type:"frame",name:"Overlays",layout:"horizontal",gap:12,width:"fill_container"})
navComponents=Insert(primitiveLibrary,{type:"frame",name:"Navigation and containers",layout:"horizontal",gap:12,width:"fill_container"})
feedbackComponents=Insert(primitiveLibrary,{type:"frame",name:"Feedback",layout:"horizontal",gap:12,width:"fill_container"})
dataComponents=Insert(primitiveLibrary,{type:"frame",name:"Data display",layout:"horizontal",gap:12,width:"fill_container"})
helperComponents=Insert(primitiveLibrary,{type:"frame",name:"Navigation helpers",layout:"horizontal",gap:12,width:"fill_container"})
```

Expected: six category frames exist under the library.

- [ ] **Step 3: Copy cards as reusable components**

Use `Copy(sourceId, categoryFrame, { name: "primitive/Name", reusable: true })` for all 43 cards. Store returned component IDs in variables named `ButtonComponent`, `IconButtonComponent`, etc. Example:

```js
ButtonComponent=Copy("L7n0W",formComponents,{name:"primitive/Button",reusable:true})
IconButtonComponent=Copy("Hsu0j",formComponents,{name:"primitive/IconButton",reusable:true})
InputComponent=Copy("U8YHJ",formComponents,{name:"primitive/Input",reusable:true})
```

Expected: all 43 `primitive/*` reusable components exist. Use the inventory mapping above for names and source IDs; place each in its matching category row.

- [ ] **Step 4: Finish library placeholder**

Run:

```js
Update(primitiveLibrary,{placeholder:false})
```

Expected: library frame is complete and no longer placeholder.

- [ ] **Step 5: Verify reusable components**

Run `pencil_batch_get` with pattern `{ "reusable": true }`, `searchDepth: 3`, `readDepth: 1`.

Expected: all 43 `primitive/*` components appear.

---

### Task 3: Replace Original Cards with Refs

**Files:**
- Modify: `docs/design-system/design-system.pen`

- [ ] **Step 1: Replace originals with instances**

Use `Replace(sourceId, { type: "ref", name: "Name", ref: NameComponent, width: 178 })` for all 43 source cards. Example:

```js
Replace("L7n0W",{type:"ref",name:"Button",ref:ButtonComponent,width:178})
Replace("Hsu0j",{type:"ref",name:"IconButton",ref:IconButtonComponent,width:178})
Replace("U8YHJ",{type:"ref",name:"Input",ref:InputComponent,width:178})
```

Expected: original `03 Primitives` grid still shows all cards, but cards are `ref` instances.

- [ ] **Step 2: Verify instance replacement**

Run `pencil_batch_get` on `DcBKY` with `readDepth: 6`, `resolveInstances: false`, `resolveVariables: false`.

Expected: the 43 card positions under `03 Primitives` are `ref` nodes pointing to `primitive/*` components.

---

### Task 4: Verify Layout, Tokens, and Disk Sync

**Files:**
- Verify: `docs/design-system/design-system.pen`
- Verify: `package.json`

- [ ] **Step 1: Verify reusable components**

Run `pencil_batch_get` with pattern `{ "reusable": true }`, `searchDepth: 3`, `readDepth: 1`.

Expected: exactly the 43 intended `primitive/*` reusable components are discoverable, plus no accidental section-container components.

- [ ] **Step 2: Verify primitive section layout**

Run `pencil_snapshot_layout` for `DcBKY` with `problemsOnly: true`.

Expected: no clipped or collapsed layout problems.

- [ ] **Step 3: Verify token usage**

Run `pencil_batch_get` on `DcBKY` with `readDepth: 6`, `resolveInstances: true`, `resolveVariables: false`.

Expected: primitive card internals use `$color.*`, `$radius.*`, and other token variables where direct.

- [ ] **Step 4: Save/sync check**

After Pencil saves, run grep on disk file for primitive-specific obvious raw shell values if available, or re-open with `pencil_batch_get` to confirm saved state. If Pencil state and disk state disagree, ask the user to save before final verification.

Expected: Pencil state and disk file are synchronized.

- [ ] **Step 5: Run token verification**

Run:

```bash
pnpm tokens:verify
```

Expected: exits 0.

- [ ] **Step 6: Run lint**

Run:

```bash
pnpm lint
```

Expected: exits 0, or only reports known unrelated `packages/shared` Biome issues.

## Self-Review

- Spec coverage: Tasks 1-3 cover tokenizing, reusable component creation, and replacing originals with instances; Task 4 covers verification.
- Placeholder scan: no TBD/TODO/fill-in-later language remains.
- Type consistency: component names use `primitive/*`, original instances use `ref`, and variables use existing `$color.*`/`$radius.*` names.
