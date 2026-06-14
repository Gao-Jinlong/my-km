# Primitives Visual Matrix Design

- Date: 2026-06-14
- Scope: `docs/design-system/design-system.pen` node `J8eHA` (`03 Primitives`)
- Status: approved for planning

## Goal

Expand the current primitive component section from a short textual list into a complete visual reference for all primitives listed in `docs/design-system/spec.md` §3.2.

## Structure

The `03 Primitives` frame keeps its current title and introductory description, then replaces the six-item summary list with six family sections matching the written spec:

1. Form inputs
2. Overlays
3. Navigation and containers
4. Feedback
5. Data display
6. Navigation helpers

Each family section contains compact matrix cards. Each card represents one primitive and shows the component's key variants, sizes, and interaction states.

## Component Coverage

The matrix covers all primitives from the spec:

- Form inputs: Button, IconButton, Input, Textarea, Select, Checkbox, Radio, Switch, Slider, Field, Label, FormControl
- Overlays: Dialog, AlertDialog, Drawer, Popover, Tooltip, DropdownMenu, ContextMenu, HoverCard
- Navigation and containers: Tabs, Accordion, Collapsible, ScrollArea, Separator, Card, Toolbar
- Feedback: Alert, Toast, Banner, Progress, Spinner, Skeleton
- Data display: Avatar, Badge, Tag, Kbd, Code, Table, List
- Navigation helpers: Breadcrumb, Pagination, CommandPalette

## Matrix Rules

- Simple primitives show default, hover/focus, disabled, and key size or tone variants.
- Form primitives include validation states where relevant: default, focus, error, disabled.
- Overlay primitives show trigger, open surface, destructive/confirmation variants where relevant, and keyboard-dismiss affordance.
- Navigation primitives show default, active/current, hover, disabled, collapsed/open states where relevant.
- Feedback primitives show severity/tone variants and loading/progress states.
- Data display primitives show density, tone, truncation, and empty/minimal examples where relevant.

## Visual Direction

Use the existing dark design-system canvas style. Cards should be compact but visually concrete: a label, a short API/state note, and miniature rendered examples. The frame may grow vertically to fit the complete set.

## Out of Scope

- No production component implementation in this step.
- No token changes unless the existing design variables are insufficient for the visual examples.
- No changes to `docs/design-system/spec.md` unless the design reveals a naming mismatch.
