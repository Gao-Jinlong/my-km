# Pencil Token Variables Design

Date: 2026-06-14
Status: approved

## Goal

Use Pencil's variable system as the design-file representation of the my-km design token system. The design file should stop relying on repeated fixed values for tokenized visual decisions and should remove the legacy `ws-*` variable namespace.

## Scope

Create Pencil variables that mirror the engineering token hierarchy in `packages/design-tokens/src/`:

- Tier 1 reference values: `ref.gray.*`, `ref.blue.*`, `ref.red.*`, `ref.green.*`, `ref.yellow.*`, dark anchors, and reference foundation values.
- Tier 2 system tokens: `color.bg.*`, `color.fg.*`, `color.border.*`, `color.accent.*`, `color.feedback.*`.
- Tier 3 domain tokens: `editor.*` and `workspace.*`.
- Non-color foundations: `typography.*`, `spacing.*`, `radius.*`, `shadow.*`, `motion.*`, and `z-index.*`.

## Naming

Use the same dot-separated names documented in the design system spec and used by the token package. Examples:

- `color.bg.primary`
- `color.fg.muted`
- `color.accent.default`
- `ref.gray.50`
- `spacing.4`
- `radius.md`
- `typography.family.sans`
- `editor.selection.bg`
- `workspace.bg.primary`

Legacy `ws-*` variables should be removed rather than kept for compatibility.

## Value Source

Variable values should match the current engineering token source:

- Reference palette values come from `packages/design-tokens/src/reference.ts`.
- Light/dark semantic mappings come from `packages/design-tokens/src/themes/light.ts` and `packages/design-tokens/src/themes/dark.ts`.
- The Pencil file should represent the same token decisions as code, but `.pen` remains the authoritative visual spec after this migration.

## Theme Model

Use Pencil themed variable values for theme-dependent variables where useful:

- Reference values remain stable.
- System/domain tokens may contain light and dark values under a theme axis such as `mode: light` and `mode: dark`.
- Shared non-theme foundations can remain single values.

## Application Strategy

Apply variables to existing nodes where the mapping is direct and unambiguous:

- Repeated surface colors map to `color.bg.*` or `workspace.bg.*`.
- Repeated text colors map to `color.fg.*`.
- Borders map to `color.border.*`.
- Accent previews and active elements map to `color.accent.*`.
- Reference palette swatches map to `ref.*` variables.
- Typography samples map to `typography.*` variables where Pencil supports the property type.
- Spacing, radius, and other numeric foundations map to matching foundation variables where Pencil supports variable references.

Keep fixed values only when they are content-specific, illustrative, unsupported by Pencil variables, or not part of the design token system.

## Verification

After migration:

1. `pencil_get_variables` should show the new dot-separated variable set and no `ws-*` variables.
2. Key token showcase nodes should use `$variable` references instead of repeated raw values.
3. The visual layout should remain unchanged except for variable metadata.
4. Any unsupported fixed values should be intentionally left as raw values.
