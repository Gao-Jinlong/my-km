# Design System Agent Guide

> AI agent 快速上手指南 — design-first 治理，按需读取

## Source relationship (design-first)

1. `docs/design-system/design-system.pen` — **唯一权威设计稿**（人工维护）
2. `docs/design-system/spec.md` — 文字治理规范和工程边界
3. `packages/design-tokens/src/` — 设计稿中 foundation/theme 决策的工程实现
4. `packages/design-system/` — 设计稿中 primitives 和 patterns 的工程实现

**如果实现与设计冲突，默认实现是错的。**
**如果设计稿缺少规格，先更新设计稿，再对齐代码。**

## Quick start

```bash
# Visual spec (read-only, never script)
open docs/design-system/design-system.pen

# Token source code
codegraph_explore "design-tokens themes light dark"

# Component source (when populated)
codegraph_explore "primitives button input dialog"
codegraph_explore "patterns empty-state page-header"
```

## Three-tier token architecture

```
Tier 3 → Component/Domain  (editor.*, workspace.*, button.primary.bg)
Tier 2 → System / Semantic  (color.bg.primary, color.fg.muted)
Tier 1 → Reference          (blue.500 = #0969da, gray.50 = #f6f8fa)
```

Token categories: `color` / `typography` / `spacing` / `radius` / `shadow` / `motion` / `zIndex` / `editor` / `workspace`.

## Golden rules

| # | Rule | Enforcement |
|---|------|-------------|
| 1 | **No bare hex colors** — use token utilities only (`bg-bg-primary`, `text-fg-muted`) | ESLint + Stylelint (error) |
| 2 | **No `bg-[#xxx]` / `style={{ color }}`** — go through tokens | Tailwind plugin + ESLint |
| 3 | **New UI components → `packages/design-system/`**, never `apps/web/src/components/ui/` | no-restricted-imports |
| 4 | **Design changes start in `design-system.pen`**, never in code | code review |
| 5 | **No script reads, generates, or modifies `.pen` files** | convention |
| 6 | **Business code only uses Tier 2/3 tokens**, never Tier 1 | code review |

## When to use what

| Need | Use | Location |
|------|-----|----------|
| Button / Input / Dialog / Badge (no business meaning) | **Primitive** | `packages/design-system/src/primitives/` |
| PageHeader / EmptyState / ConfirmDialog (repeated >=3x) | **Pattern** | `packages/design-system/src/patterns/` |
| EditorToolbar / FloatingFormatMenu (editor-specific) | **Editor Pattern** | `packages/design-system/src/patterns/editor/` |
| ProjectCard / AuthForm (binds business entity) | **Business component** | `apps/web/src/components/{domain}/` |
| Color / spacing / typography values | **Token** | `packages/design-tokens/src/` |
| Visual spec for any of the above | **Design file** | `docs/design-system/design-system.pen` |

**Boundary test**: Can >=2 domains use it? -> design-system. Only one domain? -> stays in web.

## Changing the design system

1. **Visual change**: Edit `docs/design-system/design-system.pen` first
2. **Token change**: Edit `packages/design-tokens/src/` to match the design -> run `pnpm tokens:build`
3. **Add primitive/pattern**: Verify `design-system.pen` has a matching spec section -> create component in `packages/design-system/src/`
4. **ADR required** for: new Tier 2 token, new primitive, pattern promotion/demotion, API convention changes

## Source of truth

| What | Where |
|------|-------|
| Visual spec (authoritative) | `docs/design-system/design-system.pen` |
| Written governance | `docs/design-system/spec.md` |
| Token source (implements design) | `packages/design-tokens/src/` |
| Token output (generated, don't edit) | `packages/design-tokens/dist/tokens.css` |
| ADR records | `docs/design-system/decisions/` |
| Storybook | `pnpm design:storybook` -> localhost:6006 |

## Component API conventions

- **CVA** for variants: `cva('...', { variants: { variant, tone, size } })`
- **asChild** pattern: `<Button asChild><Link href="/x">Go</Link></Button>`
- **data-state** for CSS: `data-state="open"`, `data-disabled`, `data-loading` -- no `.is-active` classes
- **forwardRef** + extends `ComponentPropsWithoutRef<...>`
- **Controlled + Uncontrolled**: `value + onValueChange` AND `defaultValue`

## Naming conventions

| Correct | Wrong |
|---------|-------|
| `color.bg.primary` (dot-separated) | `colorBgPrimary` |
| `.hover` / `.active` / `.disabled` | `.hovered` / `.is-hover` |
| `.subtle` / `.default` / `.strong` | `.light` / `.dark` |
| `fg.on-accent` | `fg.white` |
| `xs / sm / md / lg / xl / 2xl` | `1 / 2 / 3 / 4` |

CSS variable: `color.bg.primary` -> `--color-bg-primary` (auto-generated, never hand-write).
