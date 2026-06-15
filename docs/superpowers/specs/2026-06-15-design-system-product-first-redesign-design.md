# design-system.pen Product-First Redesign Design

- Status: approved-for-planning
- Date: 2026-06-15
- Scope: `docs/design-system/design-system.pen`
- Direction: Product-First Spec

## Background

The current `design-system.pen` is structurally useful but visually too simple. It reads like a governance document and component inventory rather than the authoritative visual source for a mature knowledge-work product.

The redesign should keep the existing design-first rules:

- `design-system.pen` remains the visual source of truth.
- Token names and the three-tier token model remain stable.
- Code in `packages/design-tokens/` and `packages/design-system/` will later align to the design, not the reverse.
- The `.pen` file is edited through Pencil tooling only, not by scripts.

## Goal

Rebuild the design file as a product-grade visual spec for my-km: a dense, calm, precise, AI-native personal knowledge workbench.

Success means the first screenshot of the design file no longer looks like a flat checklist. It should show a convincing product system: workspace shell, editor surface, command access, AI context, graph/context surfaces, and the foundations/components that make those screens coherent.

## Chosen Approach

Use a Product-First Spec structure.

The design file leads with realistic my-km product surfaces, then extracts tokens, primitives, states, and patterns from those surfaces. This makes the design system easier to judge in context and avoids a beautiful but abstract component catalog.

Rejected approaches:

- Spec Dashboard: clearer governance, but less product-specific.
- Token-First Atlas: systematic, but does not solve the visual weakness of the current file as strongly.

## Visual Language

The style is a polished product workbench, not a marketing page.

- Brand mood: professional, sharp, high-density, calm.
- Color direction: move beyond the current GitHub-like blue/gray palette toward deep blue plus cyan/teal accents, with stronger neutral surface ramps.
- Shape language: restrained 6-8px radii for most cards and controls.
- Depth: use stronger but still practical elevation for floating overlays, command menus, panels, and active surfaces.
- Typography: keep system sans and mono, but improve hierarchy with clearer section titles, labels, captions, code/token text, and product annotations.
- Density: maintain a production-tool feel. Avoid oversized hero sections, decorative orb backgrounds, and purely illustrative content.
- Dark mode: treat dark surfaces as first-class product surfaces, especially for AI, command, graph, and chrome examples.

## Canvas Structure

### 00 Product Workbench Overview

Create a first-class product overview frame that proves the visual system in use.

Content:

- Workspace shell with sidebar navigation and top command/search entry.
- Editor canvas with document hierarchy, inline code, quote, selection, and focus states.
- AI context panel with prompt input, source chips, insight cards, and status indicators.
- Knowledge context area with graph/list hybrid preview.
- Short design principles: dense, calm, precise, AI-native.
- Token callouts for major surface, text, border, accent, focus, and editor roles.

### 01 Foundations & Tokens

Replace flat token lists with visual token boards.

Content:

- Surface ladder: app background, workspace shell, panel, card, raised overlay, modal.
- Semantic color board: accent, success, warning, error, info, focus, selection.
- Light and dark theme comparison using the same components.
- Typography scale and presets using product-like examples.
- Radius, shadow, spacing, motion, and z-index examples shown as applied UI, not isolated labels only.
- Editor and workspace domain token examples.

### 02 Components & States

Rebuild the Primitive Component Library as a polished component matrix.

Content:

- Keep all 43 primitives represented.
- Group by existing families: form inputs, overlays, navigation/containers, feedback, data display, navigation helpers.
- Show real component shapes and density, not generic mini-cards.
- Highlight key primitives with richer examples: Button, IconButton, Input, Select, Dialog, Popover, DropdownMenu, Tabs, Toast, Badge, Kbd, Code, Table, CommandPalette.
- Add state rows or chips where useful: default, hover, active, focus, disabled, loading, error.
- Keep components reusable and business-neutral.

### 03 Product Patterns

Show product-level patterns in context, then label the reusable pieces.

Content:

- Editor Workbench pattern.
- AI Context Panel pattern.
- Command Palette pattern.
- Knowledge Graph / Context Map pattern.
- Settings Modal pattern.
- Empty, loading, error, and permission states.

Each pattern should include:

- A realistic visual example.
- Token callouts.
- Primitive/pattern ownership notes.
- Light/dark or default/active state where it clarifies behavior.

## Token Changes

Token names stay stable, but values may change in the design file.

Allowed changes:

- Update `ref.*` values to support a stronger product identity.
- Update `color.*` semantic mappings for richer surface hierarchy.
- Update `workspace.*` and `editor.*` domain values to make app shell and editor surfaces distinct.
- Update `shadow.*` examples and values where needed for overlay clarity.
- Add visual examples for tokens already defined in the spec.

Constraints:

- Do not replace the three-tier token model.
- Do not introduce business-only tokens into primitives.
- Do not use bare hard-coded visual decisions in the design explanation when a token role exists.
- If a new Tier 2 token is truly needed, record it as a follow-up ADR/code-alignment task.

## Editing Strategy

Use Pencil MCP/editor operations to edit `docs/design-system/design-system.pen`.

Implementation preference:

- Preserve useful existing reusable primitive nodes where possible.
- Recompose the surrounding frames and examples to fit the new Product-First structure.
- Use variables for colors, radius, shadow, spacing, and text styles whenever available.
- Add or update variables through Pencil variable APIs only when the visual direction requires it.
- Do not script-read, generate, or modify the `.pen` file outside Pencil tooling.

## Verification

After editing the design file:

- Use layout snapshots to catch clipped or overlapping nodes.
- Export or screenshot the main frames for visual review.
- Check that the overview, foundations, components, and patterns all read as one coherent design system.
- Confirm that component labels and token callouts remain readable.
- Confirm that the primitive library still accounts for the existing 43 primitives.

## Out of Scope

- Updating `packages/design-tokens/src/`.
- Updating `packages/design-system/src/`.
- Building Storybook stories.
- Migrating app UI.
- Adding new production React components.

Those should happen in later code-alignment work after the design source is approved.

## Open Follow-Ups

- Align `packages/design-tokens/src/` to the redesigned token values.
- Add ADRs if the redesign introduces new Tier 2 tokens or changes token semantics.
- Update Storybook visuals after code alignment.
- Add `.superpowers/` to `.gitignore` if brainstorming artifacts should stay local.
