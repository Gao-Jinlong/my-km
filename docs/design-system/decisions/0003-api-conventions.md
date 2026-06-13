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
