# Pencil Primitives Components Design

Date: 2026-06-14
Status: approved

## Goal

Optimize only the `03 Primitives` section in `docs/design-system/design-system.pen` so primitive preview cards use the Pencil variable system consistently and become reusable Pencil components for future page design.

## Scope

In scope:

- `03 Primitives` and its internal primitive preview cards.
- All current primitive preview cards, including form inputs, overlays, navigation and containers, feedback, data display, and navigation helpers.
- Converting each primitive preview card into a Pencil reusable component.
- Replacing the in-place preview cards with `ref` instances of those components.
- Replacing remaining high-confidence fixed values inside primitive preview cards with token variables.

Out of scope:

- `01 Foundations` raw values used for palette examples and explanatory labels.
- Non-primitives sections except where needed to place the component library area.
- Code changes in `packages/design-system` or app source.

## Component Model

Each existing primitive preview card becomes a reusable Pencil component with a stable human-readable name:

- `primitive/Button`
- `primitive/IconButton`
- `primitive/Input`
- `primitive/Textarea`
- `primitive/Select`
- `primitive/Checkbox`
- `primitive/Radio`
- `primitive/Switch`
- `primitive/Slider`
- `primitive/Field`
- `primitive/Label`
- `primitive/FormControl`
- `primitive/Dialog`
- `primitive/AlertDialog`
- `primitive/Drawer`
- `primitive/Popover`
- `primitive/Tooltip`
- `primitive/DropdownMenu`
- `primitive/ContextMenu`
- `primitive/HoverCard`
- `primitive/Tabs`
- `primitive/Accordion`
- `primitive/Collapsible`
- `primitive/ScrollArea`
- `primitive/Separator`
- `primitive/Card`
- `primitive/Toolbar`
- `primitive/Alert`
- `primitive/Toast`
- `primitive/Banner`
- `primitive/Progress`
- `primitive/Spinner`
- `primitive/Skeleton`
- `primitive/Avatar`
- `primitive/Badge`
- `primitive/Tag`
- `primitive/Kbd`
- `primitive/Code`
- `primitive/Table`
- `primitive/List`
- `primitive/Breadcrumb`
- `primitive/Pagination`
- `primitive/CommandPalette`

The component source nodes should be placed in a dedicated component library area near the top/left of the canvas. The original `03 Primitives` grid should remain visually equivalent, but its cards should be `ref` instances.

## Token Binding Rules

Apply variables where mappings are direct:

- Card surfaces: `color.bg.secondary` or `color.bg.tertiary`.
- Card borders: `color.border.default`.
- Primary text: `color.fg.primary`.
- Secondary text: `color.fg.muted`.
- Accent controls and selected states: `color.accent.default`, `color.accent.hover`, `color.accent.active`, `color.accent.subtle-bg`, `color.accent.subtle-fg`.
- Disabled states: `color.bg.disabled`, `color.fg.disabled`, or reduced opacity where already modeled.
- Error states: `color.feedback.error.*` or `color.border.focus` only when semantically correct.
- Success/warning/info states: `color.feedback.success.*`, `color.feedback.warning.*`, `color.feedback.info.*`.
- Borders and separators: `color.border.default`, `color.border.subtle`, or `color.border.strong`.
- Radius: `radius.sm`, `radius.md`, `radius.lg`, `radius.xl`, or `radius.full`.
- Spacing/gaps/padding where supported and direct: `spacing.*`.

Keep raw values only when they are illustrative geometry, unsupported by Pencil variables, intentionally content-specific, or no current token expresses the value.

## Layout and Reuse Requirements

- Preserve the visible structure and grouping of `03 Primitives`.
- Keep the current card content and visual examples recognizable.
- Do not collapse or clip any primitive section.
- Component sources should be reusable (`reusable: true`).
- In-place cards in `03 Primitives` should become `ref` instances of their matching component.
- Component instance names should remain readable in the layer tree.
- Do not create components for section containers; only primitive preview cards become reusable components.

## Verification

After implementation:

1. `pencil_batch_get` for `03 Primitives` should show card instances as `ref` nodes or equivalent reusable instances.
2. Reusable components should be discoverable via `pencil_batch_get` search for `reusable: true`.
3. Primitive cards should no longer rely on obvious raw surface/text/border/accent colors where matching variables exist.
4. `pencil_snapshot_layout` for `03 Primitives` should report no layout problems.
5. `pnpm tokens:verify` should pass.
6. `pnpm lint` should be run; known unrelated `packages/shared` Biome issues may remain outside this design task.
