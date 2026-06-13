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
