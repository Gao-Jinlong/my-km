# 0002 — Two-package layout: design-tokens + design-system

- **Status:** accepted
- **Date:** 2026-06-13
- **Spec ref:** `spec.md` §1.2

## Context

The tokens layer is consumed by every layer above it (primitives, patterns,
business code, Pencil scripts, Storybook). Components are only consumed by
business code and Storybook.

## Decision

Two workspace packages:

- **`@my-km/design-tokens`** — zero runtime deps, pure TS source + generated
  artifacts (`tokens.css`, `tokens.ts`, `tokens.json`, `tokens.d.ts`).
- **`@my-km/design-system`** — primitives, patterns, Tailwind preset; depends
  on design-tokens via workspace link.

Storybook lives at `apps/storybook/`, depending on design-system.

## Alternatives

- **Single package** — rejected: blurs the boundary between "values" and
  "components"; forces tokens consumers to pull React.
- **Three packages** (tokens + ui + design-system docs) — rejected: too heavy
  for a small team with no external consumers.

## Consequences

- Token changes can ship without rebuilding any React.
- Tokens package can later be extracted for non-React consumers (CLI, native).
- Build of `design-system` depends on `design-tokens` `build`.
