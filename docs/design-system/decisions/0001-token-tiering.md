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
